/**
 * CropDialog — frame a picture before it is uploaded.
 *
 * The crop is applied to the BYTES, not recorded as display metadata. The file
 * that reaches the server is already the target shape, so every place a banner
 * or avatar appears just draws the whole image and they cannot disagree. The
 * alternative -- storing a focal point and hoping every `object-position` in
 * the app stays in step -- is what produced mismatched crops in the first
 * place.
 *
 * Drag to move, the slider (or the wheel) to zoom. The image is clamped so it
 * always covers the frame, which means the output can never contain an empty
 * edge.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'

/** Pixel dimensions written out per shape. Ratios match the display classes. */
export const CROP_SIZES = {
  avatar: { w: 512, h: 512 },
  banner: { w: 1500, h: 500 },
  thumb: { w: 1200, h: 600 },
} as const

export type CropShape = keyof typeof CROP_SIZES

/** Under the 2 MB server cap, with room to spare for the multipart-free POST. */
const MAX_OUTPUT_BYTES = 1.8 * 1024 * 1024

/**
 * PNG first so flat graphics and transparency survive. Photographs blow past
 * the size cap as PNG, so anything too big is re-encoded as JPEG on white --
 * which is also the only sane way to flatten transparency.
 */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (png && png.size <= MAX_OUTPUT_BYTES) return png

  const flat = document.createElement('canvas')
  flat.width = canvas.width
  flat.height = canvas.height
  const ctx = flat.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, flat.width, flat.height)
  ctx.drawImage(canvas, 0, 0)

  const jpeg = await new Promise<Blob | null>((r) => flat.toBlob(r, 'image/jpeg', 0.88))
  if (!jpeg) throw new Error('Could not process that image')
  return jpeg
}

export function CropDialog({
  file,
  shape,
  onCancel,
  onCropped,
}: {
  /** The picked file. Null closes the dialog. */
  file: File | null
  shape: CropShape
  onCancel: () => void
  onCropped: (file: File) => void
}) {
  const out = CROP_SIZES[shape]
  const aspect = out.w / out.h

  const [src, setSrc] = useState<string | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // Object URL rather than a data URL: no base64 inflation for a 2 MB file.
  useEffect(() => {
    if (!file) {
      setSrc(null)
      return
    }
    const url = URL.createObjectURL(file)
    setSrc(url)
    setNatural(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setError(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const frameSize = () => {
    const width = frame.current?.clientWidth ?? 480
    return { width, height: width / aspect }
  }

  /**
   * Scale at which the image exactly covers the frame. Everything is expressed
   * as a multiple of this, so zoom = 1 is always "just covering" whatever the
   * source dimensions happen to be.
   */
  const coverScale = useCallback(() => {
    if (!natural) return 1
    const { width, height } = frameSize()
    return Math.max(width / natural.w, height / natural.h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, aspect])

  /** Keep the image covering the frame: no empty edges, ever. */
  const clamp = useCallback(
    (next: { x: number; y: number }, z = zoom) => {
      if (!natural) return next
      const { width, height } = frameSize()
      const scale = coverScale() * z
      const limitX = Math.max(0, (natural.w * scale - width) / 2)
      const limitY = Math.max(0, (natural.h * scale - height) / 2)
      return {
        x: Math.min(limitX, Math.max(-limitX, next.x)),
        y: Math.min(limitY, Math.max(-limitY, next.y)),
      }
    },
    [natural, zoom, coverScale],
  )

  useEffect(() => {
    setOffset((o) => clamp(o))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    setOffset(
      clamp({
        x: drag.current.ox + (e.clientX - drag.current.x),
        y: drag.current.oy + (e.clientY - drag.current.y),
      }),
    )
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const confirm = async () => {
    if (!src || !natural || !file) return
    setBusy(true)
    setError(null)
    try {
      const image = new Image()
      image.src = src
      await image.decode()

      const { width, height } = frameSize()
      const scale = coverScale() * zoom

      // Displayed size, then the source rectangle the frame is showing.
      const shownW = natural.w * scale
      const shownH = natural.h * scale
      const left = (shownW - width) / 2 - offset.x
      const top = (shownH - height) / 2 - offset.y

      const canvas = document.createElement('canvas')
      canvas.width = out.w
      canvas.height = out.h
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        image,
        left / scale,
        top / scale,
        width / scale,
        height / scale,
        0,
        0,
        out.w,
        out.h,
      )

      const blob = await encode(canvas)
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      onCropped(new File([blob], `${shape}.${ext}`, { type: blob.type }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process that image.')
    } finally {
      setBusy(false)
    }
  }

  const scale = natural ? coverScale() * zoom : 1

  return (
    <Dialog open={Boolean(file)} onClose={onCancel} label="Crop image">
      <div className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">Frame the picture</h2>
        <p className="mt-2 font-mono text-[0.78rem] text-muted">
          Drag to move, zoom to fit. What you see here is exactly what gets saved.
        </p>

        {error && <p className="mt-4 font-mono text-[0.75rem] font-bold text-danger">{error}</p>}

        <div
          ref={frame}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.002)))}
          className={[
            'relative mt-5 w-full cursor-grab touch-none select-none overflow-hidden bg-fog ring-1 ring-ink active:cursor-grabbing',
            shape === 'avatar' ? 'rounded-full' : 'rounded-card',
          ].join(' ')}
          style={{ aspectRatio: `${out.w} / ${out.h}` }}
        >
          {src && (
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: natural ? natural.w * scale : undefined,
                height: natural ? natural.h * scale : undefined,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
        </div>

        <label className="mt-5 flex items-center gap-3">
          <span className="label-mono shrink-0 text-ink">Zoom</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-blue)]"
          />
        </label>

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-line pt-5">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || !natural} icon="check">
            {busy ? 'Processing...' : 'Use this crop'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

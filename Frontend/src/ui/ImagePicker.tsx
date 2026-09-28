/**
 * ImagePicker — choose a file, frame it, upload it, hand back the stored URL.
 *
 * The value is always a plain URL string, which is what every record stores.
 * That means an uploaded picture (`/api/images/<id>`) and one hosted somewhere
 * else are the same thing to everything downstream, and pasting a link keeps
 * working for anyone who would rather not upload.
 *
 * Picking a file opens the cropper rather than uploading straight away. What
 * gets uploaded is already the exact shape it will be displayed at, so the
 * crop cannot drift between the editor and the places the image appears --
 * there is no `object-position` to keep in step, because after cropping there
 * is nothing left to reposition.
 *
 * Size and type are checked here for a fast, clear message, and again on the
 * server, which is the check that counts.
 */
import { useRef, useState } from 'react'
import { api } from '../api'
import { Button } from './Button'
import { CropDialog, type CropShape } from './CropDialog'
import { Icon } from './Icon'
import { cn } from './cn'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

/**
 * Keep this in step with ImageService.MAX_BYTES on the server and with
 * client_max_body_size in nginx.conf. nginx defaults to 1 MB, which used to
 * reject anything larger with a bare 413 before the request reached the API.
 */
const MAX_BYTES = 2 * 1024 * 1024
const MAX_MB = MAX_BYTES / 1024 / 1024

/** "0.4 MB" / "812 KB" — small files read better in KB. */
const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * Display classes for each shape.
 *
 * Written out in full rather than interpolated from CROP_SIZES: Tailwind scans
 * source text for class names, and a template literal produces nothing it can
 * see. These must stay in step with CROP_SIZES in ./CropDialog.
 */
export const ASPECT_CLASS: Record<CropShape, string> = {
  avatar: 'aspect-square',
  banner: 'aspect-[3/1]',
  thumb: 'aspect-[2/1]',
}

/** Named export: banners are displayed in three separate places. */
export const BANNER_ASPECT = ASPECT_CLASS.banner

export function ImagePicker({
  label,
  hint,
  value,
  onChange,
  disabled,
  /** 'avatar' is a circle, 'banner' a wide strip, 'thumb' a 2:1 card image. */
  shape = 'thumb',
  className,
}: {
  label: string
  hint?: string
  value?: string
  onChange: (url: string) => void
  disabled?: boolean
  shape?: CropShape
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Size of what is actually stored: the CROPPED bytes, not the file the user
  // picked, since cropping re-encodes and usually shrinks it.
  const [size, setSize] = useState<number | null>(null)

  /** Validate, then hand off to the cropper. Nothing is uploaded yet. */
  const choose = (file: File | undefined) => {
    // Clear the input first, so re-picking the same file still fires onChange.
    if (input.current) input.current.value = ''
    if (!file) return
    setError(null)

    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Use a PNG, JPEG, WEBP or GIF.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${fileSize(file.size)} — the limit is ${MAX_MB} MB. Try a smaller one.`)
      return
    }
    setPicked(file)
  }

  /** The cropper hands back a new file, already at the display dimensions. */
  const upload = async (cropped: File) => {
    setPicked(null)
    setBusy(true)
    try {
      // Belt to the cropper's brace: it targets well under the cap, but a
      // pathological image could still come back too big, and a clear message
      // here beats a 413 from the edge.
      if (cropped.size > MAX_BYTES) {
        setError(`That crop is ${fileSize(cropped.size)} — the limit is ${MAX_MB} MB. Zoom out or pick a smaller image.`)
        return
      }
      onChange(await api.uploadImage(cropped))
      setSize(cropped.size)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not upload that image.'
      // A 413 is the proxy refusing the body; say what actually happened.
      setError(/413/.test(message) ? `That image is over the ${MAX_MB} MB limit.` : message)
    } finally {
      setBusy(false)
    }
  }

  const frame =
    shape === 'avatar'
      ? 'h-20 w-20 rounded-full'
      : cn('w-full rounded-card', ASPECT_CLASS[shape])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="label-mono text-ink">{label}</span>

      <div className={cn('flex gap-4', shape === 'avatar' ? 'items-center' : 'flex-col')}>
        <div className={cn('grid shrink-0 place-items-center overflow-hidden bg-fog ring-1 ring-line', frame)}>
          {value ? (
            // A cropped upload is already this shape, so object-cover has
            // nothing to trim; it only matters for a pasted external URL.
            <img src={value} alt="" className="h-full w-full object-cover object-center" />
          ) : (
            <Icon
              name={shape === 'avatar' ? 'user' : 'spark'}
              size={shape === 'avatar' ? 20 : 24}
              className="text-subtle"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => input.current?.click()}>
            {busy ? 'Uploading...' : value ? 'Replace' : 'Upload'}
          </Button>
          {value && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || busy}
              onClick={() => {
                onChange('')
                setSize(null)
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <p className="font-mono text-[0.72rem] font-bold text-danger">{error}</p>
      ) : (
        <p className="font-mono text-[0.72rem] text-subtle">
          {size !== null && value ? (
            <>
              <span className="font-bold text-ink">{fileSize(size)}</span> uploaded · limit {MAX_MB} MB
            </>
          ) : (
            (hint ?? `PNG, JPEG, WEBP or GIF · up to ${MAX_MB} MB`)
          )}
        </p>
      )}

      <CropDialog
        file={picked}
        shape={shape}
        onCancel={() => setPicked(null)}
        onCropped={(file) => void upload(file)}
      />
    </div>
  )
}

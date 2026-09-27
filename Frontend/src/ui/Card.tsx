/**
 * Card — the theme's surface, in several tones. A thin ink border
 * and a hard offset shadow that "presses in" on click.
 *  - tones: paper/cream/fog/ink/blue/yellow/red/green/outline. Each tone sets
 *    its own text colour, so children only need opacity for secondary text.
 *    'ink' is the always-dark slab, so it stays dark in dark mode too.
 *  - interactive: lifts on hover.
 *  - tilt: tilts toward the pointer in 3D with a soft light glare (implies interactive).
 */
import { useRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

export type CardTone = 'paper' | 'cream' | 'fog' | 'ink' | 'blue' | 'yellow' | 'red' | 'green' | 'outline'

const tones: Record<CardTone, string> = {
  paper: 'bg-paper text-ink ring-1 ring-ink',
  cream: 'bg-cream text-ink ring-1 ring-ink',
  fog: 'bg-fog text-ink ring-1 ring-ink',
  ink: 'bg-slab text-slab-fg ring-1 ring-ink',
  blue: 'bg-blue text-white ring-1 ring-ink',
  yellow: 'bg-yellow text-on-bright ring-1 ring-ink',
  red: 'bg-red text-white ring-1 ring-ink',
  green: 'bg-green text-white ring-1 ring-ink',
  outline: 'bg-paper text-ink ring-1 ring-line',
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  interactive?: boolean
  tilt?: boolean
  children: ReactNode
}

export function Card({ tone = 'paper', interactive, tilt, className, children, ...rest }: CardProps) {
  const ref = useRef<HTMLDivElement>(null)

  // On mouse move, write the pointer position into CSS variables that the
  // transform and the glare (below) read. Skipped for touch, which has no hover.
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tilt || e.pointerType !== 'mouse') return
    const el = ref.current!
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width // 0 (left) .. 1 (right)
    const py = (e.clientY - r.top) / r.height // 0 (top) .. 1 (bottom)
    el.style.setProperty('--rx', `${(0.5 - py) * 6}deg`) // tilt up/down
    el.style.setProperty('--ry', `${(px - 0.5) * 8}deg`) // tilt left/right
    el.style.setProperty('--gx', `${px * 100}%`) // glare centre x
    el.style.setProperty('--gy', `${py * 100}%`) // glare centre y
  }
  // Reset the tilt when the pointer leaves so the card settles flat.
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  return (
    <div
      ref={ref}
      onPointerMove={tilt ? onMove : undefined}
      onPointerLeave={tilt ? onLeave : undefined}
      className={cn(
        'relative overflow-hidden rounded-card',
        tones[tone],
        (interactive || tilt) &&
          'transition-[transform,box-shadow] duration-300 ease-out-soft hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_var(--color-ink)]',
        tilt &&
          'group/tilt [transform:perspective(900px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] hover:[transform:perspective(900px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))_translate(-4px,-4px)]',
        className,
      )}
      {...rest}
    >
      {children}
      {tilt && (
        <span
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
          style={{ background: 'radial-gradient(420px circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,0.25), transparent 45%)' }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

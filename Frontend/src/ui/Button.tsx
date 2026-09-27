/**
 * Button — the theme's action button, as a <button> or (with `href`) an <a>.
 * MLH-flavoured: a soft-cornered block, mono label, and an arrow that slides on
 * hover (no circular badge).
 *  - variant: primary (yellow) | blue | dark | outline | ghost
 *  - size:    sm | md | lg
 *  - icon:    an arrow/name that sits after the label and slides on hover
 *  - magnetic: the button drifts toward the pointer — hero CTAs only
 */
import { useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'blue' | 'dark' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-yellow text-on-bright ring-2 ring-ink hover:bg-yellow-deep hover:shadow-[4px_4px_0_var(--color-ink)]',
  blue: 'bg-blue text-white ring-2 ring-ink hover:bg-blue-deep hover:shadow-[4px_4px_0_var(--color-ink)]',
  dark: 'bg-slab text-slab-fg ring-2 ring-ink hover:bg-ink-2 hover:text-on-bright hover:shadow-[4px_4px_0_var(--color-yellow)]',
  outline: 'bg-paper text-ink ring-2 ring-ink hover:bg-fog hover:shadow-[4px_4px_0_var(--color-ink)]',
  ghost: 'text-ink hover:bg-fog',
}

const sizes: Record<ButtonSize, { body: string; icon: number }> = {
  sm: { body: 'h-9 px-3.5 text-[0.72rem]', icon: 15 },
  md: { body: 'h-11 px-5 text-[0.78rem]', icon: 16 },
  lg: { body: 'h-[54px] px-7 text-[0.85rem]', icon: 18 },
}

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  magnetic?: boolean
  children: ReactNode
  className?: string
}

type ButtonProps = CommonProps &
  (({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'>) | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>))

export function Button({ variant = 'primary', size = 'md', icon, magnetic, children, className, ...rest }: ButtonProps) {
  const ref = useRef<HTMLElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const s = sizes[size]

  // Magnetic buttons follow the mouse a little; skipped for touch (no hover).
  const onMove = (e: React.PointerEvent) => {
    if (!magnetic || e.pointerType !== 'mouse') return
    const r = ref.current!.getBoundingClientRect()
    setOffset({ x: (e.clientX - r.left - r.width / 2) * 0.2, y: (e.clientY - r.top - r.height / 2) * 0.3 })
  }

  const classes = cn(
    'group relative inline-flex shrink-0 select-none items-center justify-center gap-2.5 rounded-btn font-mono font-bold whitespace-nowrap',
    'transition-[transform,background-color,box-shadow,color] duration-200 ease-out-soft active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    s.body,
    className,
  )

  const inner = (
    <>
      {children}
      {icon && <Icon name={icon} size={s.icon} strokeWidth={2.4} className="transition-transform duration-300 ease-out-soft group-hover:translate-x-1" />}
    </>
  )

  const style = magnetic ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined
  const handlers = magnetic ? { onPointerMove: onMove, onPointerLeave: () => setOffset({ x: 0, y: 0 }) } : {}

  if ('href' in rest && rest.href !== undefined) {
    return (
      <a ref={ref as React.RefObject<HTMLAnchorElement>} className={classes} style={style} {...handlers} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </a>
    )
  }
  return (
    <button ref={ref as React.RefObject<HTMLButtonElement>} type="button" className={classes} style={style} {...handlers} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {inner}
    </button>
  )
}

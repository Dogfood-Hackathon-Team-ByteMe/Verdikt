/**
 * Reveal — fades its children up the first time they scroll into view. Anything
 * already on screen at load stays put, so the first frame is never blank.
 * effect="none" only flags data-pending, for children that animate themselves
 * (e.g. the growing rubric bars).
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from './cn'

/**
 * Fades content up as it scrolls into view. Anything already on screen at load
 * stays visible, so the first frame is always complete.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
  effect = 'fade',
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'li' | 'section'
  /** 'none' only flags data-pending, for children that animate themselves (e.g. `.grow` bars). */
  effect?: 'fade' | 'none'
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) return
    el.dataset.pending = 'true'
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.pending = 'false'
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag ref={ref as never} className={cn(effect === 'fade' && 'reveal', className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  )
}

import { useEffect, useRef, useState } from 'react'

/** Counts from 0 to `value` when scrolled into view. Renders the final value until then. */
export function CountUp({ value, duration = 1400, format = (n: number) => Math.round(n).toLocaleString('en-US') }: { value: number; duration?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(value)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || done.current) return
        done.current = true
        io.disconnect()
        const t0 = performance.now()
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration)
          setN(value * (1 - Math.pow(2, -10 * p)))
          if (p < 1) requestAnimationFrame(tick)
          else setN(value)
        }
        requestAnimationFrame(tick)
      },
      { rootMargin: '0px 0px 10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value, duration])

  return (
    <span ref={ref} className="tnum">
      {format(n)}
    </span>
  )
}

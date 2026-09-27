/**
 * Segmented — tab switcher with a yellow pill that slides under the active tab.
 * The pill is measured from the DOM so it fits each label; on phones the tabs
 * wrap and the active one just fills with yellow instead of sliding.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from './cn'

/** Tab-style switcher with a sliding yellow indicator. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  label: string
  className?: string
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const list = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState({ left: 0, width: 0 })

  /**
   * Re-measure on any geometry change, not just a window resize.
   *
   * Tab labels often carry a count that arrives with the data -- "Rubric (3)"
   * is "Rubric (0)" for the first paint -- so the tabs after it shift sideways
   * while `value` never changes and the window never resizes. The pill kept its
   * first measurement and ended up sitting under the wrong tab. A
   * ResizeObserver on the strip catches that, and the scrollbar-induced width
   * changes that do not always fire a resize event either.
   */
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[value]
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()

    const strip = list.current
    const observer = new ResizeObserver(measure)
    if (strip) {
      observer.observe(strip)
      for (const child of Array.from(strip.children)) observer.observe(child)
    }
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [value, options])

  return (
    <div ref={list} role="tablist" aria-label={label} className={cn('relative inline-flex max-w-full flex-wrap gap-1 rounded-full bg-fog p-1', className)}>
      <span
        className="absolute top-1 bottom-1 rounded-full bg-yellow shadow-[0_6px_16px_-8px_rgba(120,160,10,0.9)] transition-[left,width] duration-500 ease-spring max-sm:hidden"
        style={{ left: pill.left, width: pill.width }}
        aria-hidden="true"
      />
      {options.map((o) => (
        <button
          key={o.id}
          ref={(el) => {
            refs.current[o.id] = el
          }}
          id={`tab-${o.id}`}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'relative z-10 rounded-full px-4 py-2 font-mono text-[0.7rem] font-medium uppercase tracking-[0.1em] transition-colors duration-300',
            value === o.id ? 'text-on-bright max-sm:bg-yellow' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Accordion — one-open-at-a-time expander used for the FAQ. Heights animate via
 * a grid-rows 0fr -> 1fr trick so it works without measuring pixel heights.
 */
import { useState, type ReactNode } from 'react'
import { cn } from './cn'
import { Icon } from './Icon'

export function Accordion({ items, defaultOpen = 0 }: { items: { q: string; a: ReactNode }[]; defaultOpen?: number | null }) {
  const [open, setOpen] = useState<number | null>(defaultOpen)
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it, i) => {
        const isOpen = open === i
        return (
          <li key={it.q} className={cn('rounded-card transition-colors duration-300', isOpen ? 'bg-fog' : 'bg-paper ring-1 ring-line hover:ring-ink/30')}>
            <button
              type="button"
              id={`faq-q-${i}`}
              aria-expanded={isOpen}
              aria-controls={`faq-a-${i}`}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left text-[1.05rem] font-medium tracking-tight"
            >
              {it.q}
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-500 ease-spring', isOpen ? 'rotate-45 bg-slab text-yellow' : 'bg-fog text-ink')}>
                <Icon name="plus" size={16} strokeWidth={2} />
              </span>
            </button>
            <div
              id={`faq-a-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              className={cn('grid transition-[grid-template-rows] duration-500 ease-out-soft', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
            >
              <div className="overflow-hidden">
                <div className="max-w-2xl px-6 pb-6 text-muted">{it.a}</div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

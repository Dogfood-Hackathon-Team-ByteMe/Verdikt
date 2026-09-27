/**
 * SearchField — rounded search input with a leading magnifier icon.
 * `id` and `label` are required for accessibility (the label is visually hidden).
 */
import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'
import { Icon } from './Icon'

export function SearchField({ id, label, className, ...rest }: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon name="search" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="search"
        className="h-12 w-full rounded-full bg-fog pl-11 pr-5 text-[0.95rem] outline-none ring-1 ring-transparent transition-all duration-300 placeholder:text-subtle hover:ring-line focus:bg-paper focus:ring-ink"
        {...rest}
      />
    </div>
  )
}

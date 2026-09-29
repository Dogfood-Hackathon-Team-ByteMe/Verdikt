/**
 * Chip — toggle pill used for filters. `active` styles it as selected;
 * `count` shows a small number on the right.
 */
import type { ReactNode } from 'react'
import { cn } from './cn'

/** Toggle pill for filters. */
export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-300 ease-out-soft active:scale-95',
        active ? 'bg-slab text-slab-fg shadow-[0_8px_20px_-10px_rgba(12,13,15,0.6)]' : 'bg-fog text-ink hover:bg-line',
      )}
    >
      {children}
      {count !== undefined && <span className={cn('tnum font-mono text-[0.68rem]', active ? 'text-yellow' : 'text-subtle')}>{count}</span>}
    </button>
  )
}

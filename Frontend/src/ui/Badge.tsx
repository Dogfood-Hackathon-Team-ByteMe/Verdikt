/**
 * Badge — small mono pill for status and labels. `dot` adds a pulsing dot.
 */
import type { ReactNode } from 'react'
import { cn } from './cn'

export type BadgeVariant = 'outline' | 'yellow' | 'blue' | 'ink' | 'red' | 'green' | 'success' | 'danger'

const styles: Record<BadgeVariant, string> = {
  outline: 'bg-paper text-ink ring-1 ring-ink',
  yellow: 'bg-yellow text-on-bright ring-1 ring-ink',
  blue: 'bg-blue text-white',
  ink: 'bg-slab text-slab-fg',
  red: 'bg-red text-white',
  green: 'bg-green text-white',
  success: 'bg-[#e3f5ea] text-success ring-1 ring-success/30',
  danger: 'bg-[#fbe6e3] text-danger ring-1 ring-danger/30',
}

export function Badge({ variant = 'outline', dot, children, className }: { variant?: BadgeVariant; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-btn px-3 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-[0.05em]', styles[variant], className)}>
      {dot && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  )
}

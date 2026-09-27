/**
 * Logo — the Verdikt wordmark: a hand-drawn tick in a box (a ballot mark),
 * sitting in one of the primary colours, next to the name in bold Space Grotesk.
 */
import { cn } from './cn'

export function Logo({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'white' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', tone === 'white' ? 'text-white' : 'text-ink', className)}>
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
        <rect x="2.5" y="2.5" width="23" height="23" rx="6" fill="var(--color-blue)" stroke="var(--color-ink)" strokeWidth="2" />
        <path d="M8 14.5l4 4 8-9" fill="none" stroke="var(--color-yellow)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[1.3rem] font-bold tracking-[-0.03em]">Verdikt</span>
    </span>
  )
}

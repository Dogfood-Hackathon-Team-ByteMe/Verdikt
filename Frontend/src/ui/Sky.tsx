/**
 * Panel — a solid primary-colour panel used for the big call-to-action band
 * (the "stay in the loop" / host-an-event block). Blue by default, with a faint
 * inner grid and a soft top glow, ringed in ink to match the cards.
 * Exported as both `Panel` and `SkyPanel` (the older name kept for imports).
 */
import type { ReactNode } from 'react'
import { cn } from './cn'

export function Panel({ children, className, tone = 'blue' }: { children: ReactNode; className?: string; tone?: 'blue' | 'ink' }) {
  // Both stops come from tokens, so the panel dims in dark mode.
  const bg =
    tone === 'blue'
      ? 'linear-gradient(150deg, var(--color-panel-1) 0%, color-mix(in srgb, var(--color-panel-1) 55%, var(--color-panel-2)) 55%, var(--color-panel-2) 100%)'
      : 'linear-gradient(150deg, var(--color-slab) 0%, var(--color-ink-2) 340%)'
  return (
    <div className={cn('relative isolate overflow-hidden rounded-panel text-white ring-2 ring-ink', className)} style={{ background: bg }}>
      {/* faint graph grid + a soft glow up top, so the flat colour has some depth */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg,#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(70% 50% at 50% -10%, rgba(255,255,255,0.25), transparent 70%)' }} aria-hidden="true" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

// Older name kept so existing imports (`SkyPanel`) keep working.
export const SkyPanel = Panel

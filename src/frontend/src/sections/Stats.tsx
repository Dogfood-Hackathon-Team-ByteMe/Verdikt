/**
 * Stats — the figures row under the hero: big bold numbers with mono
 * captions, divided by dashed rules. Numbers count up when scrolled into view.
 */
import type { HackEvent, PlatformStats } from '../api'
import { Container, CountUp, Reveal, cn } from '../ui'

export function Stats({ event, stats }: { event?: HackEvent; stats?: PlatformStats }) {
  const pool = event?.prizes.reduce((s, p) => s + p.amount_usd, 0) || 2500
  const items = [
    { value: stats?.events ?? 12, label: 'Hackathons completed', tone: 'bg-red' },
    { value: stats?.teams ?? 240, label: 'Participations', tone: 'bg-yellow' },
    { value: pool, prefix: '$', label: 'In total prizes', tone: 'bg-blue' },
  ]
  return (
    <Container className="py-12 sm:py-16">
      <p className="mb-6 text-center font-mono text-[0.68rem] uppercase tracking-[0.12em] text-subtle">In the last month</p>
      <div className="grid grid-cols-1 gap-y-8 border-y-2 border-ink py-9 sm:grid-cols-3 sm:gap-0">
        {items.map((it, i) => (
          <Reveal key={it.label} delay={i * 90} className={cn('min-w-0', i < items.length - 1 && 'sm:border-r sm:border-dashed sm:border-line')}>
            <div className="px-1 text-center sm:px-5 sm:text-left">
              <span className={cn('mx-auto mb-3 block h-2 w-8 rounded-full sm:mx-0', it.tone)} aria-hidden="true" />
              <div className="headline text-[clamp(2rem,4.2vw,3.1rem)]">
                {it.prefix}
                <CountUp value={it.value} />
              </div>
              <div className="label-mono mt-2 text-muted">{it.label}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </Container>
  )
}

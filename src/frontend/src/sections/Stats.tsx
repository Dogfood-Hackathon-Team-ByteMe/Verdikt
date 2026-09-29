/**
 * Stats — the MLH-style figures row under the hero: big bold numbers with mono
 * captions, divided by dashed rules. Numbers count up when scrolled into view.
 */
import type { HackEvent } from '../api'
import { Container, CountUp, Reveal, cn } from '../ui'

export function Stats({ event, judges }: { event?: HackEvent; judges?: number }) {
  const pool = (event?.prizes.reduce((s, p) => s + p.amount_usd, 0) ?? 2100) + 400
  const items = [
    { value: judges ?? 36, label: 'Judges on the panel', tone: 'bg-red' },
    { value: event?.tracks.length ?? 8, label: 'Tracks to enter', tone: 'bg-yellow' },
    { value: pool, prefix: '$', label: 'In prizes', tone: 'bg-blue' },
    { value: 72, suffix: 'h', label: 'To build it', tone: 'bg-green' },
  ]
  return (
    <Container className="py-12 sm:py-16">
      <div className="grid grid-cols-2 gap-y-8 border-y-2 border-ink py-9 sm:grid-cols-4 sm:gap-0">
        {items.map((it, i) => (
          <Reveal key={it.label} delay={i * 90} className={cn('min-w-0', i < 3 && 'sm:border-r sm:border-dashed sm:border-line')}>
            <div className="px-1 sm:px-5">
              <span className={cn('mb-3 block h-2 w-8 rounded-full', it.tone)} aria-hidden="true" />
              <div className="headline text-[clamp(2rem,4.2vw,3.1rem)]">
                {it.prefix}
                <CountUp value={it.value} />
                {it.suffix}
              </div>
              <div className="label-mono mt-2 text-muted">{it.label}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </Container>
  )
}

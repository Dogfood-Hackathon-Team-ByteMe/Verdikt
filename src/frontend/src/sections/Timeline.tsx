/**
 * Timeline — the event schedule in three phases (before / 72 hours / after).
 * Past items are ticked and the next upcoming item is marked live, recomputed
 * from the current time.
 */
import { useEffect, useState } from 'react'
import { timeline } from '../content/dogfood'
import { Card, Icon, Reveal, Section, SectionHeading, cn } from '../ui'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })

export function Timeline() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const flat = timeline.flatMap((p) => p.items)
  const nextIdx = flat.findIndex((it) => Date.parse(it.at) > now)
  const next = nextIdx >= 0 ? flat[nextIdx] : null

  return (
    <Section id="timeline" className="bg-fog/60">
      <SectionHeading label="Timeline · all times UTC" title="72 hours to build." tail="Eleven days to judge." />

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {timeline.map((phase, pi) => {
          const isHack = phase.phase === '72 hours'
          return (
            <Reveal key={phase.phase} delay={pi * 90}>
              <Card tone={isHack ? 'ink' : 'paper'} className="h-full p-6">
                <div className={cn('font-mono text-[0.7rem] uppercase tracking-[0.12em]', isHack ? 'text-yellow' : 'text-subtle')}>{phase.phase}</div>
                <ol className="mt-5 flex flex-col">
                  {phase.items.map((it) => {
                    const past = Date.parse(it.at) <= now
                    const isNext = it === next
                    return (
                      <li key={it.title} className={cn('relative flex gap-4 border-l pb-6 pl-6 last:pb-0', isHack ? 'border-white/15' : 'border-line')}>
                        <span
                          className={cn(
                            'absolute -left-[9px] top-0.5 grid h-[17px] w-[17px] place-items-center rounded-full',
                            isNext ? 'bg-yellow text-on-bright ring-4 ring-yellow/30' : past ? (isHack ? 'bg-slab-fg text-on-bright' : 'bg-slab text-yellow') : isHack ? 'bg-white/10 ring-1 ring-white/30' : 'bg-paper ring-1 ring-line',
                          )}
                        >
                          {past && <Icon name="check" size={9} strokeWidth={3.2} />}
                          {isNext && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ink" />}
                        </span>
                        <div className="min-w-0">
                          <div className={cn('flex flex-wrap items-baseline gap-x-2 font-mono text-[0.72rem]', isHack ? 'text-white/60' : 'text-subtle')}>
                            <span>{day(it.at)}</span>
                            {time(it.at) !== '00:00' && <span>{time(it.at)}</span>}
                            {isNext && <span className="rounded-full bg-yellow px-2 py-px text-[0.62rem] uppercase tracking-[0.1em] text-on-bright">Up next</span>}
                          </div>
                          <div className={cn('mt-1 text-[1.05rem] font-medium tracking-[-0.02em]', past && !isHack && 'text-muted')}>{it.title}</div>
                          {it.detail && <div className={cn('text-sm', isHack ? 'text-white/60' : 'text-muted')}>{it.detail}</div>}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </Card>
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}

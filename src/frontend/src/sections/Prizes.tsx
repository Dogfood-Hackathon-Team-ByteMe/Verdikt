/**
 * Prizes — bento grid of the prize breakdown, with the grand prize enlarged.
 * Amounts come from the event; the layout/notes per prize are defined here.
 */
import type { HackEvent } from '../api'
import { Card, CountUp, Icon, Reveal, Section, SectionHeading, cn, type CardTone } from '../ui'

const layout: Record<string, { tone: CardTone; span: string; big?: boolean; note: string }> = {
  p1: { tone: 'yellow', span: 'lg:col-span-2 lg:row-span-2', big: true, note: 'Your portal gets adopted by Hackathon Raptors, with credit on every event page it runs.' },
  p2: { tone: 'ink', span: '', note: 'Strong tier completion and judging you can defend.' },
  p3: { tone: 'fog', span: '', note: 'A rapid climb or a novel decision.' },
  p4: { tone: 'fog', span: '', note: 'Honest scope, no backend shortcuts.' },
  p5: { tone: 'fog', span: '', note: 'Made the top five.' },
  p6: { tone: 'blue', span: 'lg:col-span-2', note: 'The most defensible assignment, normalization, isolation and audit.' },
}

export function Prizes({ event }: { event?: HackEvent }) {
  const prizes = event?.prizes ?? []
  const pool = prizes.reduce((s, p) => s + p.amount_usd, 0) + 400

  return (
    <Section id="prizes">
      <SectionHeading label="Prizes" title={`$${pool.toLocaleString('en-US')} in prizes.`} tail="And the winner gets used for real." />

      <div className="mt-14 grid auto-rows-[minmax(180px,auto)] gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {prizes.map((p, i) => {
          const l = layout[p.id] ?? { tone: 'fog' as CardTone, span: '', note: '' }
          return (
            <Reveal key={p.id} delay={i * 60} className={l.span}>
              <Card tone={l.tone} tilt className="flex h-full flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm opacity-70">{p.name}</span>
                  {i === 0 && <Icon name="trophy" size={22} />}
                </div>
                <div className={cn('leading-none tracking-[-0.05em]', l.big ? 'mt-auto text-[clamp(4rem,9vw,7.5rem)]' : 'mt-4 text-[2.8rem]')}>
                  $<CountUp value={p.amount_usd} />
                </div>
                <p className={cn('max-w-sm text-sm opacity-70', l.big ? 'mt-3' : 'mt-auto pt-4')}>{l.note}</p>
              </Card>
            </Reveal>
          )
        })}
        <Reveal delay={prizes.length * 60} className="lg:col-span-2">
          <Card tone="outline" tilt className="flex h-full flex-col p-6">
            <span className="text-sm text-muted">Write-up quest · closes 5 Oct</span>
            <div className="mt-4 text-[2.8rem] leading-none tracking-[-0.05em]">4 × $100</div>
            <p className="mt-auto max-w-sm pt-4 text-sm text-muted">Publish a technical write-up about what you built on X, LinkedIn, Dev.to or your blog.</p>
          </Card>
        </Reveal>
      </div>
    </Section>
  )
}

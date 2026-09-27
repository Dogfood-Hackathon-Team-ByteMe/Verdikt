/**
 * Tiers — the four-tier ladder (T1–T4). Tier 1 is highlighted as the one the
 * team is building now. Tier content is in content/dogfood.ts.
 */
import { tiers } from '../content/dogfood'
import { Badge, Card, Icon, Reveal, Section, SectionHeading, cn } from '../ui'

export function Tiers() {
  return (
    <Section id="tiers" className="border-y-2 border-ink bg-band">
      <SectionHeading onColor className="text-band-fg" label="The tier ladder" title="Four tiers to climb." tail="We're building Tier 1 first.">
        Every team builds against the same spec. Reaching Tier 1 is the gate to being judged at all.
      </SectionHeading>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((t, i) => {
          const current = i === 0
          return (
            <Reveal key={t.id} delay={i * 80}>
              <Card tone={current ? 'ink' : 'paper'} tilt className="flex h-full flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className={cn('grid h-11 w-11 place-items-center rounded-full font-mono text-sm font-semibold', current ? 'bg-yellow text-on-bright' : 'bg-fog text-ink')}>
                    {t.id}
                  </span>
                  {current ? (
                    <Badge variant="yellow" dot>
                      Building now
                    </Badge>
                  ) : (
                    <Icon name="lock" size={16} className="text-subtle" />
                  )}
                </div>
                <h3 className="mt-6 text-[1.7rem] font-medium tracking-[-0.04em]">{t.name}</h3>
                <p className={cn('text-sm', current ? 'opacity-70' : 'text-muted')}>{t.note}</p>
                <ul className="mt-6 flex flex-col gap-2.5 text-[0.92rem]">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full', current ? 'bg-yellow text-on-bright' : 'bg-fog text-subtle')}>
                        <Icon name="check" size={10} strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
          )
        })}
      </div>
    </Section>
  )
}

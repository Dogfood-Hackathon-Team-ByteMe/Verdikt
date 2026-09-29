/**
 * Tiers — the four-tier ladder (T1–T4). Status comes from `tier.status` in
 * content/dogfood.ts, which is meant to be updated as work actually lands
 * (kept in step with `.dogfood.toml`'s claim) rather than hardcoded to "we
 * are building T1" forever.
 */
import { tiers, type TierStatus } from '../content/dogfood'
import { Badge, Card, Icon, Reveal, Section, SectionHeading, cn } from '../ui'

const STATUS_COPY: Record<TierStatus, string> = {
  done: 'Shipped',
  building: 'Building now',
  planned: 'Not started',
}

const doneCount = tiers.filter((t) => t.status === 'done').length
const buildingTier = tiers.find((t) => t.status === 'building')
const headlineTail = buildingTier
  ? `Building ${buildingTier.id} now.`
  : doneCount === tiers.length
    ? 'All four tiers shipped.'
    : `${doneCount} of ${tiers.length} tiers shipped.`

export function Tiers() {
  return (
    <Section id="tiers" className="border-y-2 border-ink bg-band">
      <SectionHeading onColor className="text-band-fg" label="The tier ladder" title="Four tiers to climb." tail={headlineTail}>
        Every team builds against the same spec. Reaching Tier 1 is the gate to being judged at all — this is where
        Verdikt actually stands, not where it started.
      </SectionHeading>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((t, i) => {
          const done = t.status === 'done'
          const building = t.status === 'building'
          const active = done || building
          return (
            <Reveal key={t.id} delay={i * 80}>
              <Card tone={active ? 'ink' : 'paper'} tilt className="flex h-full flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className={cn('grid h-11 w-11 place-items-center rounded-full font-mono text-sm font-semibold', active ? 'bg-yellow text-on-bright' : 'bg-fog text-ink')}>
                    {t.id}
                  </span>
                  {done ? (
                    <Badge variant="green" dot>
                      {STATUS_COPY.done}
                    </Badge>
                  ) : building ? (
                    <Badge variant="yellow" dot>
                      {STATUS_COPY.building}
                    </Badge>
                  ) : (
                    <span className="flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-[0.05em] text-subtle">
                      <Icon name="lock" size={14} />
                      {STATUS_COPY.planned}
                    </span>
                  )}
                </div>
                <h3 className="mt-6 text-[1.7rem] font-medium tracking-[-0.04em]">{t.name}</h3>
                <p className={cn('text-sm', active ? 'opacity-70' : 'text-muted')}>{t.note}</p>
                <ul className="mt-6 flex flex-col gap-2.5 text-[0.92rem]">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full',
                          done ? 'bg-yellow text-on-bright' : building ? 'bg-yellow/70 text-on-bright' : 'bg-fog text-subtle',
                        )}
                      >
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

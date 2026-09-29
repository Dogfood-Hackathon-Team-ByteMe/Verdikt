/**
 * Roles — pick one of the five roles and see the same project through their eyes:
 * which score cells are visible and which actions return 403. Mirrors the
 * backend-enforced permission model.
 */
import { useState } from 'react'
import type { Role } from '../api'
import { Badge, Card, Icon, Reveal, Section, SectionHeading, Segmented, cn } from '../ui'

const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: 'visitor', label: 'Visitor', blurb: 'No account. Browses the gallery and reads project pages.' },
  { id: 'participant', label: 'Participant', blurb: 'Builds with a team, edits drafts, submits before the deadline.' },
  { id: 'judge', label: 'Judge', blurb: 'Scores assigned projects in their tracks. Sees their own ballots only.' },
  { id: 'organizer', label: 'Organizer', blurb: 'Runs the event, assigns judges, watches progress, publishes results.' },
  { id: 'admin', label: 'Admin', blurb: 'Operates the instance: every event, every user, every log.' },
]

const CAPS: { label: string; allowed: Role[] }[] = [
  { label: 'Browse the gallery', allowed: ['visitor', 'participant', 'judge', 'organizer', 'admin'] },
  { label: 'Submit and edit a project', allowed: ['participant'] },
  { label: 'Score assigned projects', allowed: ['judge'] },
  { label: 'See other judges’ scores', allowed: ['organizer', 'admin'] },
  { label: 'Configure tracks, prizes, rubric', allowed: ['organizer', 'admin'] },
  { label: 'Read the audit log', allowed: ['organizer', 'admin'] },
]

const CELL: Record<Role, [string, string]> = {
  visitor: ['hidden', 'hidden'],
  participant: ['hidden', 'hidden'],
  judge: ['4.25', 'redacted'],
  organizer: ['4.25', '3.80 · 4.10'],
  admin: ['4.25', '3.80 · 4.10'],
}

export function Roles() {
  const [role, setRole] = useState<Role>('judge')
  const active = ROLES.find((r) => r.id === role)!
  const [own, peers] = CELL[role]

  return (
    <Section id="roles" className="bg-fog/60">
      <SectionHeading label="Who sees what" title="Five roles, one set of locks," tail="all enforced on the server.">
        Pick a role to see the same project through their eyes.
      </SectionHeading>

      <Reveal className="mt-10 flex justify-center">
        <Segmented label="Roles" options={ROLES.map(({ id, label }) => ({ id, label }))} value={role} onChange={setRole} />
      </Reveal>

      <Reveal className="mx-auto mt-8 max-w-3xl">
        <Card tone="paper" className="p-5 sm:p-8" role="tabpanel" aria-labelledby={`tab-${role}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
            <div>
              <div className="text-[1.3rem] font-medium tracking-[-0.03em]">Quorum</div>
              <div className="text-sm text-muted">Null Island · Judging Engines</div>
            </div>
            <Badge variant="yellow">Signed in as {active.label}</Badge>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <ScoreCell label={role === 'judge' ? 'J-07 (you)' : 'J-07'} value={own} />
            <ScoreCell label="J-19 and J-23" value={peers} />
          </div>

          <ul className="mt-5 flex flex-col">
            {CAPS.map((c) => {
              const ok = c.allowed.includes(role)
              return (
                <li key={c.label} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
                  <span className={cn('transition-colors duration-300', ok ? 'text-ink' : 'text-subtle line-through decoration-line')}>{c.label}</span>
                  <span className={cn('flex items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-[0.1em] transition-colors duration-300', ok ? 'text-success' : 'text-danger')}>
                    <Icon name={ok ? 'check' : 'x'} size={12} strokeWidth={2.6} />
                    {ok ? 'Allowed' : '403'}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-5 text-sm text-muted">{active.blurb}</p>
        </Card>
      </Reveal>
    </Section>
  )
}

function ScoreCell({ label, value }: { label: string; value: string }) {
  const hidden = value === 'hidden' || value === 'redacted'
  return (
    <div className="rounded-[16px] bg-fog p-4">
      <div className="font-mono text-[0.64rem] uppercase tracking-[0.12em] text-subtle">{label}</div>
      {hidden ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-6 w-16 rounded-md bg-ink" aria-hidden="true" />
          <span className="font-mono text-[0.7rem] uppercase text-muted">{value}</span>
        </div>
      ) : (
        <div className="tnum mt-1 text-[1.8rem] leading-none tracking-[-0.04em]">{value}</div>
      )}
    </div>
  )
}

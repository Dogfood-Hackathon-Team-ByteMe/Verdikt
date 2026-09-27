/**
 * JudgePage — /judge. Score the entries in the events you judge.
 *
 * Judging is per event, like everything else: this page does not ask "are you a
 * judge?" but "which events are you a judge of?", and an account that judges
 * none lands on an empty state rather than a 403.
 *
 * Layout is list-beside-ballot rather than a dialog because judging is
 * repetitive -- you want the queue and the remaining count in view while you
 * score, so the next entry is one click away and progress is visible without
 * closing anything.
 *
 * The queue comes from GET /api/judge/queue, which applies the same scope
 * rules the server enforces when a ballot is saved: the judge's batch if the
 * organizer dealt assignments, otherwise the tracks they were appointed to. So
 * the page never offers an entry the API would then refuse. Ballots are
 * GET /api/scores (narrowed server-side to the caller's own), and saving is one
 * upsert.
 */
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Ballot, Criterion, HackEvent, Project } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { standingIn } from '../auth/participation'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Badge, Button, Card, Container, Icon, Segmented, cn } from '../ui'

export default function JudgePage() {
  const { user } = useAuth()
  const events = useApi(() => api.listEvents())
  const [eventId, setEventId] = useState<string>('')

  // The events this account judges. Track-level and event-level judges both
  // land here -- standingIn resolves the two shapes the same way the API does.
  const judging = useMemo(
    () => (events.data ?? []).filter((e) => standingIn(user, e) === 'judge'),
    [events.data, user],
  )

  // Settle on a selection once the list arrives, and let go of one that is no
  // longer in it (a judge removed from an event mid-session).
  useEffect(() => {
    if (judging.length === 0) return
    if (!judging.some((e) => e.id === eventId)) setEventId(judging[0].id)
  }, [judging, eventId])

  const event = judging.find((e) => e.id === eventId)

  if (events.loading && !events.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <p className="label-mono text-subtle" role="status">Loading your judging</p>
        </Container>
      </AppShell>
    )
  }

  if (judging.length === 0) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Judging" title="Nothing to" tail="score.">
            You are not a judge on any event yet. An organizer adds judges from their event&apos;s settings.
          </PageHeading>
          <Button className="mt-8" href="/events" icon="arrowRight">Browse events</Button>
        </Container>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading label="Judging" title="Score the" tail="entries.">
          One ballot per entry. You can come back and change it until the organizer closes judging &mdash; and you
          only ever see your own scores, never another judge&apos;s.
        </PageHeading>

        {judging.length > 1 && (
          <div className="mt-8">
            <Segmented
              label="Event to judge"
              value={eventId}
              onChange={setEventId}
              options={judging.map((e) => ({ id: e.id, label: e.name }))}
            />
          </div>
        )}

        {/* Keyed by event, so switching events starts the desk clean. Without
            it the previously-selected entry id survives into the new queue,
            matches nothing, and leaves the ballot pane on its placeholder. */}
        {event && <JudgingDesk key={event.id} event={event} />}
      </Container>
    </AppShell>
  )
}

/** The queue and the ballot for one event. */
function JudgingDesk({ event }: { event: HackEvent }) {
  const projects = useApi(() => api.getJudgeQueue(event.id), [event.id])
  const ballots = useApi(() => api.listBallots(event.id), [event.id])
  const [openId, setOpenId] = useState<string | null>(null)

  const queue = projects.data?.projects ?? []
  const mode = projects.data?.mode
  const byProject = useMemo(() => {
    const map = new Map<string, Ballot>()
    for (const b of ballots.data ?? []) map.set(b.project_id, b)
    return map
  }, [ballots.data])

  // Open the first unscored entry once, so the page lands ready to work
  // rather than on a list that still needs a click.
  useEffect(() => {
    if (openId || queue.length === 0 || ballots.loading) return
    setOpenId((queue.find((p) => !byProject.has(p.id)) ?? queue[0]).id)
  }, [queue, byProject, openId, ballots.loading])

  const open = queue.find((p) => p.id === openId) ?? null
  const done = queue.filter((p) => byProject.has(p.id)).length
  const loading = projects.loading && !projects.data

  if (event.criteria.length === 0) {
    return (
      <Card tone="paper" className="mt-8 p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">No rubric yet</h2>
        <p className="mt-2 font-mono text-[0.85rem] text-muted">
          The organizer has not set the scoring criteria for {event.name}. There is nothing to score against until
          they do.
        </p>
      </Card>
    )
  }

  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start">
      <Card tone="paper" className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="label-mono text-red">Your queue</div>
          <div className="tnum font-mono text-[0.78rem] text-subtle">
            {done}/{queue.length}
          </div>
        </div>
        {mode && (
          <p className="mt-1 font-mono text-[0.72rem] text-subtle">
            {mode === 'assigned'
              ? 'The entries the organizer assigned to you.'
              : mode === 'tracks'
                ? 'Entries in the tracks you judge.'
                : 'Every entry in this event.'}
          </p>
        )}

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fog">
          <div
            className="h-full rounded-full bg-yellow transition-[width] duration-500 ease-out-soft"
            style={{ width: queue.length ? `${(done / queue.length) * 100}%` : '0%' }}
          />
        </div>

        {loading && <p className="mt-5 label-mono text-subtle" role="status">Loading entries</p>}

        {!loading && queue.length === 0 && (
          <p className="mt-5 rounded-card bg-fog p-4 text-center font-mono text-[0.82rem] text-muted">
            {mode === 'assigned'
              ? 'Nothing has been assigned to you yet.'
              : 'Nothing has been submitted in your tracks yet.'}
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-1">
          {queue.map((p) => {
            const scored = byProject.has(p.id)
            const active = p.id === openId
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left transition-colors duration-200',
                    // bg-slab, not bg-ink: `ink` inverts with the theme, so an
                    // inked row with slab-fg text turns white-on-white in dark
                    // mode. `slab` is the always-dark surface, as Card tone="ink".
                    active ? 'bg-slab text-slab-fg' : 'hover:bg-fog',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1',
                      scored ? 'bg-green ring-green' : active ? 'ring-slab-fg/40' : 'ring-line',
                    )}
                  >
                    {scored && <Icon name="check" size={11} strokeWidth={3} className="text-on-bright" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[0.84rem] font-bold">{p.title}</span>
                    <span className={cn('block truncate font-mono text-[0.72rem]', active ? 'text-slab-fg/60' : 'text-subtle')}>
                      {p.track_name ?? 'no track'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      {open ? (
        <BallotForm
          key={open.id}
          project={open}
          criteria={event.criteria}
          existing={byProject.get(open.id) ?? null}
          onSaved={ballots.reload}
        />
      ) : (
        !loading && (
          <Card tone="paper" className="p-6">
            <p className="font-mono text-[0.85rem] text-muted">Pick an entry from the queue to score it.</p>
          </Card>
        )
      )}
    </div>
  )
}

/** The weighted total a ballot would earn, as a percentage of the maximum. */
function weightedPercent(scores: Record<string, number>, criteria: Criterion[]): number | null {
  let total = 0
  let weight = 0
  for (const c of criteria) {
    const value = scores[c.key]
    if (typeof value !== 'number' || c.max_score <= 0) continue
    total += (value / c.max_score) * c.weight
    weight += c.weight
  }
  return weight > 0 ? Math.round((total / weight) * 100) : null
}

/**
 * One ballot.
 *
 * Keyed by project id at the call site, so switching entries remounts this and
 * the draft state starts from the newly-selected ballot instead of carrying the
 * previous entry's scores across.
 */
function BallotForm({
  project,
  criteria,
  existing,
  onSaved,
}: {
  project: Project
  criteria: Criterion[]
  existing: Ballot | null
  onSaved: () => void
}) {
  const [scores, setScores] = useState<Record<string, number>>(existing?.scores ?? {})
  const [comment, setComment] = useState(existing?.comment ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2200)
    return () => clearTimeout(t)
  }, [saved])

  const missing = criteria.filter((c) => typeof scores[c.key] !== 'number')
  const percent = weightedPercent(scores, criteria)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.saveBallot({ project_id: project.id, scores, comment })
      onSaved()
      setSaved(true)
    } catch (e) {
      // Verbatim: the rubric rules live on the server and its message is the
      // one that explains which line was wrong.
      setError(e instanceof Error ? e.message : 'Could not save that ballot.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="headline text-[1.4rem]">{project.title}</h2>
          <p className="mt-1 font-mono text-[0.78rem] text-muted">
            {project.team} &middot; {project.track_name ?? 'no track'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {existing && <Badge variant="green">Scored</Badge>}
          <Button href={`/projects/${project.id}`} size="sm" variant="ghost" icon="arrowUpRight">
            Open entry
          </Button>
        </div>
      </div>

      {project.summary && (
        <p className="mt-4 border-t border-line pt-4 font-mono text-[0.84rem] leading-relaxed text-muted">
          {project.summary}
        </p>
      )}

      {error && <Alert className="mt-5">{error}</Alert>}

      <ul className="mt-6 flex flex-col gap-5">
        {criteria.map((c) => (
          <li key={c.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-[0.9rem] font-bold">{c.label}</span>
              <span className="label-mono text-subtle">weight {c.weight}</span>
            </div>
            {c.description && <p className="mt-1 font-mono text-[0.75rem] text-subtle">{c.description}</p>}

            <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={c.label}>
              {Array.from({ length: c.max_score }, (_, i) => i + 1).map((value) => {
                const picked = scores[c.key] === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: value }))}
                    className={cn(
                      'tnum h-10 min-w-10 rounded-btn px-3 font-mono text-[0.85rem] font-bold transition-colors duration-150',
                      picked
                        ? 'bg-slab text-slab-fg ring-2 ring-ink'
                        : 'bg-fog text-ink ring-1 ring-line hover:ring-ink',
                    )}
                  >
                    {value}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-1.5 border-t border-line pt-5">
        <label htmlFor="ballot-comment" className="label-mono text-ink">
          Comment
        </label>
        <textarea
          id="ballot-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What stood out, and what would you tell the team?"
          className="w-full rounded-btn bg-paper p-3 font-mono text-[0.85rem] text-ink outline-none ring-1 ring-line transition-shadow focus:ring-2 focus:ring-ink"
        />
        <p className="font-mono text-[0.72rem] text-subtle">
          Goes to the organizer with your scores. Teams do not see it.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button disabled={busy || missing.length > 0} onClick={() => void save()} icon="check">
          {busy ? 'Saving...' : saved ? 'Saved' : existing ? 'Update ballot' : 'Submit ballot'}
        </Button>

        {missing.length > 0 ? (
          <span className="font-mono text-[0.78rem] text-subtle">
            {missing.length} criteri{missing.length === 1 ? 'on' : 'a'} left to score
          </span>
        ) : (
          percent !== null && (
            <span className="font-mono text-[0.78rem] text-subtle">
              Weighted total <span className="tnum font-bold text-ink">{percent}%</span>
            </span>
          )
        )}
      </div>
    </Card>
  )
}

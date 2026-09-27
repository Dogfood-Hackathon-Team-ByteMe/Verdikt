/**
 * EventEditor — /organizer/events/:id.
 *
 * This is T1 requirement #3, "event creation with configurable dates, tracks
 * and prizes", plus the organizer-defined submission questions from the T1
 * data model. Four tabs, because they write to two different endpoints:
 *
 *   Details / Prizes / Questions -> PUT /api/events/:id
 *   Tracks                       -> POST|PUT|DELETE /api/tracks
 *
 * Prizes and questions are whole-array replacements (the backend stores them
 * as subdocuments and overwrites the array), so the form always sends the
 * complete list. Tracks are separate documents and are edited one at a time.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import type { CustomQuestion, HackEvent, Prize, Track } from '../api/types'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Badge, Button, Card, Container, Field, Icon, Segmented , ImagePicker } from '../ui'

type Tab = 'details' | 'tracks' | 'prizes' | 'questions' | 'submissions'

/** An ISO instant -> the "YYYY-MM-DDTHH:mm" a datetime-local input wants. */
const toLocalInput = (iso: string | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function EventEditor() {
  const { id = '' } = useParams()
  const event = useApi(() => api.getEvent(id), [id])
  const [tab, setTab] = useState<Tab>('details')

  if (event.loading && !event.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <p className="label-mono text-subtle" role="status">Loading the event</p>
        </Container>
      </AppShell>
    )
  }

  if (!event.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Not found" title="No event" tail="here.">
            It may have been deleted, or you may not organise it.
          </PageHeading>
          <Button className="mt-8" href="/organizer" icon="arrowRight">Back to your events</Button>
        </Container>
      </AppShell>
    )
  }

  const e = event.data
  const closed = new Date(e.submissions_close) < new Date()

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label="Manage event"
          title={e.name}
          actions={<Badge variant={closed ? 'outline' : 'green'}>{closed ? 'submissions closed' : 'open'}</Badge>}
        >
          {e.tagline || e.description}
        </PageHeading>

        <div className="mt-8">
          <Segmented<Tab>
            label="Event settings"
            value={tab}
            onChange={setTab}
            options={[
              { id: 'details', label: 'Details' },
              { id: 'tracks', label: `Tracks (${e.tracks.length})` },
              { id: 'prizes', label: `Prizes (${e.prizes.length})` },
              { id: 'questions', label: `Questions (${e.custom_questions.length})` },
              { id: 'submissions', label: 'Submissions' },
            ]}
          />
        </div>

        <div className="mt-8">
          {tab === 'details' && <DetailsTab event={e} onSaved={event.reload} />}
          {tab === 'tracks' && <TracksTab event={e} onChanged={event.reload} />}
          {tab === 'prizes' && <PrizesTab event={e} onSaved={event.reload} />}
          {tab === 'questions' && <QuestionsTab event={e} onSaved={event.reload} />}
          {tab === 'submissions' && <SubmissionsTab event={e} />}
        </div>

        <Button href="/organizer" variant="outline" className="mt-12">
          Back to your events
        </Button>
      </Container>
    </AppShell>
  )
}

/** Shared save-state plumbing for the tabs that PUT the event. */
function useSaver(save: () => Promise<unknown>, onSaved: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(t)
  }, [saved])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await save()
      onSaved()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, saved, run }
}

// --- Details ---------------------------------------------------------------

function DetailsTab({ event, onSaved }: { event: HackEvent; onSaved: () => void }) {
  const [name, setName] = useState(event.name)
  const [tagline, setTagline] = useState(event.tagline ?? '')
  const [banner, setBanner] = useState(event.banner_url ?? '')
  const [description, setDescription] = useState(event.description ?? '')
  const [startsAt, setStartsAt] = useState(toLocalInput(event.starts_at))
  const [closesAt, setClosesAt] = useState(toLocalInput(event.submissions_close))
  const [minSize, setMinSize] = useState(String(event.min_team_size))
  const [maxSize, setMaxSize] = useState(String(event.max_team_size))

  const { busy, error, saved, run } = useSaver(
    () =>
      api.updateEvent(event.id, {
        name: name.trim(),
        tagline: tagline.trim(),
        banner_url: banner,
        description: description.trim(),
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
        submissions_close: closesAt ? new Date(closesAt).toISOString() : undefined,
        min_team_size: Number(minSize) || 1,
        max_team_size: Number(maxSize) || 4,
      }),
    onSaved,
  )

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h2 className="headline text-[1.25rem]">Details and dates</h2>
      {error && <Alert className="mt-5">{error}</Alert>}

      <div className="mt-6 flex flex-col gap-5">
        <Field label="Event name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Tagline" placeholder="One line for the hero" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        <Field label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <ImagePicker
          label="Event banner"
          shape="banner"
          hint="Shown across the event card. PNG, JPEG, WEBP or GIF, up to 2 MB."
          value={banner}
          onChange={setBanner}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <DateField label="Starts at" value={startsAt} onChange={setStartsAt} hint="Drives the before / during / after state." />
          <DateField
            label="Submissions close"
            value={closesAt}
            onChange={setClosesAt}
            hint="The hard deadline. The server refuses writes after it."
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Min team size" type="number" min={1} value={minSize} onChange={(e) => setMinSize(e.target.value)} />
          <Field label="Max team size" type="number" min={1} value={maxSize} onChange={(e) => setMaxSize(e.target.value)} />
        </div>

        <div>
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? 'Saving...' : saved ? 'Saved' : 'Save details'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function DateField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string
  value: string
  hint?: string
  onChange: (v: string) => void
}) {
  const id = `date-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label-mono text-ink">{label}</label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-btn bg-paper px-3.5 font-mono text-[0.9rem] text-ink outline-none ring-1 ring-line transition-[box-shadow] duration-200 hover:ring-subtle focus:ring-2 focus:ring-ink"
      />
      {hint && <p className="font-mono text-[0.72rem] text-subtle">{hint}</p>}
    </div>
  )
}

// --- Tracks ----------------------------------------------------------------

function TracksTab({ event, onChanged }: { event: HackEvent; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update tracks.')
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    act(async () => {
      await api.createTrack({ event_id: event.id, name: name.trim(), description: description.trim() })
      setName('')
      setDescription('')
    })

  return (
    <div className="flex flex-col gap-5">
      <Card tone="paper" className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">Tracks</h2>
        <p className="mt-2 font-mono text-[0.8rem] text-muted">
          Teams pick one track per project. A project cannot be submitted without one.
        </p>
        {error && <Alert className="mt-5">{error}</Alert>}

        {event.tracks.length === 0 ? (
          <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
            No tracks yet. Add at least one, or nobody can submit.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col divide-y divide-line">
            {event.tracks.map((t) => (
              <TrackRow key={t.id} track={t} busy={busy} onChanged={onChanged} onError={setError} />
            ))}
          </ul>
        )}
      </Card>

      <Card tone="paper" className="p-6 sm:p-7">
        <h3 className="headline text-[1.05rem]">Add a track</h3>
        <div className="mt-5 flex flex-col gap-4">
          <Field label="Name" placeholder="Judging Engines" value={name} onChange={(e) => setName(e.target.value)} />
          <Field
            label="Description"
            placeholder="Ranking, normalization and audit trails."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <Button disabled={busy || !name.trim()} onClick={() => void add()} icon="plus">
              {busy ? 'Working...' : 'Add track'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function TrackRow({
  track,
  busy,
  onChanged,
  onError,
}: {
  track: Track
  busy: boolean
  onChanged: () => void
  onError: (m: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(track.name)
  const [confirming, setConfirming] = useState(false)

  const save = async () => {
    try {
      await api.updateTrack(track.id, { name: name.trim() })
      setEditing(false)
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not rename the track.')
    }
  }

  const remove = async () => {
    try {
      await api.deleteTrack(track.id)
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not delete the track.')
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      {editing ? (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-btn bg-paper px-3 font-mono text-[0.85rem] outline-none ring-1 ring-ink"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(track.name) }}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0">
            <div className="truncate font-mono text-[0.88rem] font-bold">{track.name}</div>
            {track.description && <div className="truncate font-mono text-[0.75rem] text-subtle">{track.description}</div>}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Rename</Button>
            {confirming ? (
              <>
                {/* Deleting a track orphans any project pointing at it, so it
                    asks twice rather than once. */}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void remove()}>
                  Really delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>No</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>Delete</Button>
            )}
          </div>
        </>
      )}
    </li>
  )
}

// --- Prizes ----------------------------------------------------------------

function PrizesTab({ event, onSaved }: { event: HackEvent; onSaved: () => void }) {
  const [rows, setRows] = useState<Prize[]>(event.prizes)
  const { busy, error, saved, run } = useSaver(
    () =>
      api.updateEvent(event.id, {
        prizes: rows.map((p) => ({
          name: p.name.trim(),
          amount_usd: Number(p.amount_usd) || 0,
          description: p.description,
          track: p.track || null,
        })),
      }),
    onSaved,
  )

  const set = (i: number, patch: Partial<Prize>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  const total = rows.reduce((sum, p) => sum + (Number(p.amount_usd) || 0), 0)

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="headline text-[1.25rem]">Prizes</h2>
        <span className="font-mono text-[0.8rem] text-muted tnum">${total.toLocaleString()} total</span>
      </div>
      {error && <Alert className="mt-5">{error}</Alert>}

      <ul className="mt-6 flex flex-col gap-4">
        {rows.map((p, i) => (
          <li key={i} className="rounded-card bg-fog p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_180px_auto] sm:items-end">
              <Field label="Name" value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
              <Field
                label="Amount (USD)"
                type="number"
                min={0}
                value={String(p.amount_usd)}
                onChange={(e) => set(i, { amount_usd: Number(e.target.value) })}
              />
              <div className="flex flex-col gap-1.5">
                <label className="label-mono text-ink">Track</label>
                <select
                  value={p.track ?? ''}
                  onChange={(e) => set(i, { track: e.target.value || null })}
                  className="h-12 w-full rounded-btn bg-paper px-3 font-mono text-[0.85rem] outline-none ring-1 ring-line focus:ring-2 focus:ring-ink"
                >
                  <option value="">Overall</option>
                  {event.tracks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
          No prizes yet.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="outline"
          icon="plus"
          onClick={() => setRows((r) => [...r, { id: `new-${r.length}`, name: '', amount_usd: 0, track: null }])}
        >
          Add prize
        </Button>
        <Button disabled={busy} onClick={() => void run()}>
          {busy ? 'Saving...' : saved ? 'Saved' : 'Save prizes'}
        </Button>
      </div>
    </Card>
  )
}

// --- Custom questions ------------------------------------------------------

function QuestionsTab({ event, onSaved }: { event: HackEvent; onSaved: () => void }) {
  const [rows, setRows] = useState<CustomQuestion[]>(event.custom_questions)
  const { busy, error, saved, run } = useSaver(
    () => api.updateEvent(event.id, { custom_questions: rows.filter((q) => q.key.trim() && q.label.trim()) }),
    onSaved,
  )

  const set = (i: number, patch: Partial<CustomQuestion>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h2 className="headline text-[1.25rem]">Submission questions</h2>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        Added to every team&apos;s submission form. A required question blocks submission until it is answered, and
        the server enforces that.
      </p>
      {error && <Alert className="mt-5">{error}</Alert>}

      <ul className="mt-6 flex flex-col gap-4">
        {rows.map((q, i) => (
          <li key={i} className="rounded-card bg-fog p-4">
            {/* items-START, not items-end. Only the Key field carries a hint,
                and bottom-aligning made its extra line push every other input
                down out of step with it. Tops align, so the inputs line up. */}
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_150px] sm:items-start">
              <Field
                label="Question"
                placeholder="What was the hardest part?"
                value={q.label}
                onChange={(e) => set(i, { label: e.target.value })}
              />
              <Field
                label="Key"
                hint="Stable id. Changing it orphans existing answers."
                placeholder="whatsHard"
                value={q.key}
                onChange={(e) => set(i, { key: e.target.value.replace(/\s+/g, '') })}
              />
              <div className="flex flex-col gap-1.5">
                <label className="label-mono text-ink">Type</label>
                <select
                  value={q.type}
                  onChange={(e) => set(i, { type: e.target.value as CustomQuestion['type'] })}
                  className="h-12 w-full rounded-btn bg-paper px-3 font-mono text-[0.85rem] outline-none ring-1 ring-line focus:ring-2 focus:ring-ink"
                >
                  <option value="text">Short text</option>
                  <option value="longtext">Long text</option>
                  <option value="url">URL</option>
                </select>
              </div>
            </div>
            {/* Row-level actions share one line under the fields, so Remove no
                longer floats against a field whose height it cannot match. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <label className="flex items-center gap-2 font-mono text-[0.78rem]">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => set(i, { required: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-blue)]"
                />
                Required before a team can submit
              </label>
              <Button size="sm" variant="ghost" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
          No custom questions. Teams will only fill in the standard fields.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="outline"
          icon="plus"
          onClick={() => setRows((r) => [...r, { key: '', label: '', type: 'text', required: false }])}
        >
          Add question
        </Button>
        <Button disabled={busy} onClick={() => void run()}>
          {busy ? 'Saving...' : saved ? 'Saved' : 'Save questions'}
        </Button>
      </div>
    </Card>
  )
}

// --- Submissions overview --------------------------------------------------

function SubmissionsTab({ event }: { event: HackEvent }) {
  // An organizer sees drafts for their own event, which is exactly what makes
  // this view useful before the deadline.
  const projects = useApi(() => api.listProjects({ event_id: event.id }), [event.id])
  const teams = useApi(() => api.listTeams(event.id), [event.id])

  const rows = projects.data ?? []
  const submitted = rows.filter((p) => p.status === 'submitted')

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Teams" value={teams.data?.length ?? 0} />
        <Stat label="Submitted" value={submitted.length} />
        <Stat label="Still draft" value={rows.length - submitted.length} />
      </div>

      <Card tone="paper" className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">Entries</h2>
        {projects.loading && !projects.data ? (
          <p className="mt-5 label-mono text-subtle" role="status">Loading</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
            Nothing submitted yet.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate font-mono text-[0.88rem] font-bold">{p.title}</div>
                  <div className="truncate font-mono text-[0.75rem] text-subtle">
                    {p.team} &middot; {p.track_name ?? 'no track'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={p.status === 'submitted' ? 'green' : 'outline'}>{p.status}</Badge>
                  <Button href={`/projects/${p.id}`} size="sm" variant="ghost">View</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card tone="ink" className="p-6">
        <div className="label-mono flex items-center gap-2 text-yellow">
          <Icon name="chart" size={13} strokeWidth={2.2} />
          Export
        </div>
        <p className="mt-3 font-mono text-[0.78rem] leading-relaxed text-slab-fg/70">
          Scores export as CSV once judging starts. Organizers only.
        </p>
        <Button
          href={`/api/export.csv?eventId=${event.id}`}
          size="sm"
          variant="dark"
          className="mt-4"
          icon="arrowUpRight"
        >
          Download scores CSV
        </Button>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card tone="paper" className="p-5">
      <div className="label-mono text-subtle">{label}</div>
      <div className="headline mt-2 text-[2rem] tnum">{value}</div>
    </Card>
  )
}

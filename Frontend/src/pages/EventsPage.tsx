/**
 * EventsPage — /events. Every event, and the one thing you can do with each:
 * enter it.
 *
 * Laid out as a gallery rather than a stack of full-width panels: an event is
 * something you scan and compare, so the card carries only what you need to
 * choose one (banner, standing, deadline, size) and the entry form opens in
 * place on the one you pick. Search and the filter chips narrow the grid.
 *
 * Who may enter is decided by the server (backend/utils/eventRoles.js). The
 * same rule is mirrored in ../auth/participation so the card can explain the
 * block up front rather than after a failed request -- but the message shown
 * on a real failure is always the server's own.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { HackEvent, Team } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { participationBlockFor, standingIn } from '../auth/participation'
import { useApi } from '../hooks/useApi'
import { useCountdown } from '../hooks/useCountdown'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, BANNER_ASPECT, Badge, Button, Card, Chip, Container, Field, Icon, SearchField, cn } from '../ui'

type Filter = 'all' | 'open' | 'closed' | 'mine'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'mine', label: 'Yours' },
]

const isClosed = (e: HackEvent) => new Date(e.submissions_close) < new Date()

export default function EventsPage() {
  const { user } = useAuth()
  const events = useApi(() => api.listEvents())
  const teams = useApi(() => api.listTeams())
  const [refreshKey, setRefreshKey] = useState(0)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const reload = () => {
    teams.reload()
    setRefreshKey((k) => k + 1)
  }

  const all = useMemo(() => events.data ?? [], [events.data])
  const myTeams = useMemo(
    () => (teams.data ?? []).filter((t) => user && t.members.some((m) => m.id === user.id)),
    [teams.data, user],
  )

  /** "Yours" = any event you hold a standing in, or have a team in. */
  const isMine = useMemo(
    () => (e: HackEvent) =>
      standingIn(user, e) !== 'visitor' || myTeams.some((t) => t.event_id === e.id),
    [user, myTeams],
  )

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (e: HackEvent) =>
      !needle ||
      [e.name, e.tagline, e.description, ...e.tracks.map((t) => t.name)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
  }, [q])

  const passesFilter = useMemo(
    () => (e: HackEvent) =>
      filter === 'all' ||
      (filter === 'open' && !isClosed(e)) ||
      (filter === 'closed' && isClosed(e)) ||
      (filter === 'mine' && isMine(e)),
    [filter, isMine],
  )

  const shown = all.filter((e) => matches(e) && passesFilter(e))
  const countFor = (id: Filter) =>
    all.filter((e) => matches(e) && (id === 'all' || (id === 'open' && !isClosed(e)) || (id === 'closed' && isClosed(e)) || (id === 'mine' && isMine(e)))).length

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label="Events"
          title="Every"
          tail="event."
          actions={
            user ? (
              <Button href="/organizer" icon="arrowRight">
                Host an event
              </Button>
            ) : undefined
          }
        >
          Browse what is running, then enter the one you want to build for.
          Hosting one of your own does not stop you competing in the rest.
        </PageHeading>

        {events.error && <Alert className="mt-8">{events.error.message}</Alert>}

        {/* Toolbar: search on the left, filters on the right. */}
        <div className="mt-9 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchField
            id="events-search"
            label="Search events"
            placeholder="Search by name, tagline or track"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full lg:max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Chip
                key={f.id}
                active={filter === f.id}
                onClick={() => setFilter(f.id)}
                count={events.data ? countFor(f.id) : undefined}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </div>

        {events.loading && !events.data ? (
          <p className="mt-10 label-mono text-subtle" role="status">
            Loading events
          </p>
        ) : (
          <>
            <div className="mt-4 label-mono text-subtle" aria-live="polite">
              {shown.length} {shown.length === 1 ? 'event' : 'events'}
            </div>

            {shown.length === 0 ? (
              <Card tone="paper" className="mt-6 p-7 text-center">
                <p className="font-mono text-[0.9rem] text-muted">
                  {all.length === 0
                    ? 'No events yet. An organizer has to create one first.'
                    : 'Nothing matches that. Try a different search or filter.'}
                </p>
              </Card>
            ) : (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((event, i) => (
                  <div
                    key={`${event.id}-${refreshKey}`}
                    className="animate-[rise_0.6s_var(--ease-out-soft)_both]"
                    style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  >
                    <EventCard event={event} teams={teams.data ?? []} onJoined={reload} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Container>
    </AppShell>
  )
}

/** One event, compact: enough to choose it, with the entry action in place. */
function EventCard({
  event,
  teams,
  onJoined,
}: {
  event: HackEvent
  teams: Team[]
  onJoined: () => void
}) {
  const { user } = useAuth()
  const countdown = useCountdown(event.submissions_close)
  const closed = countdown.closed

  const standing = standingIn(user, event)
  const block = participationBlockFor(user, event)
  const myTeam = teams.find((t) => t.event_id === event.id && t.members.some((m) => m.id === user?.id))

  return (
    <Card tone="paper" interactive className="flex h-full flex-col overflow-hidden p-0">
      {event.banner_url ? (
        // Same ratio as the editor's preview, so the crop matches what the
        // organiser framed.
        <img src={event.banner_url} alt="" className={cn(BANNER_ASPECT, 'w-full object-cover object-center')} />
      ) : (
        <div className={cn(BANNER_ASPECT, 'grid w-full place-items-center bg-fog')}>
          <Icon name="spark" size={20} className="text-subtle" />
        </div>
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="headline text-[1.2rem] leading-tight">{event.name}</h2>
          <Badge variant={closed ? 'outline' : 'green'} dot={!closed} className="shrink-0">
            {closed ? 'Closed' : `${countdown.days}d ${countdown.hours}h`}
          </Badge>
        </div>

        {standing !== 'visitor' && (
          <div className="mt-2">
            <StandingBadge standing={standing} />
          </div>
        )}

        {event.tagline && (
          <p className="mt-2 line-clamp-2 font-mono text-[0.8rem] leading-relaxed text-muted">{event.tagline}</p>
        )}

        <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3 font-mono text-[0.72rem]">
          <Stat label="Tracks" value={String(event.tracks.length)} />
          <Stat label="Prizes" value={String(event.prizes.length)} />
          <Stat label="Team" value={`${event.min_team_size}-${event.max_team_size}`} />
          <Stat label="Closes" value={new Date(event.submissions_close).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} />
        </dl>

        {/* mt-auto pins the actions to the bottom so cards of different text
            lengths still line up across the grid. */}
        <div className="mt-auto border-t border-line pt-4">
          <Participation
            event={event}
            myTeam={myTeam}
            block={block}
            closed={closed}
            signedIn={Boolean(user)}
            onJoined={onJoined}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <Button href={`/projects?event=${event.id}`} variant="ghost" size="sm" icon="arrowRight">
              Projects
            </Button>
            {standing === 'organizer' && (
              <Button href={`/organizer/events/${event.id}`} variant="ghost" size="sm">
                Manage
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-mono truncate text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate font-bold text-ink">{value}</dd>
    </div>
  )
}

function StandingBadge({ standing }: { standing: ReturnType<typeof standingIn> }) {
  if (standing === 'visitor') return null
  const variant = standing === 'participant' ? 'blue' : 'yellow'
  const label =
    standing === 'admin' ? 'Admin' : standing === 'organizer' ? 'You organise this' : standing === 'judge' ? 'You judge this' : 'You are entered'
  return <Badge variant={variant}>{label}</Badge>
}

/**
 * The entry control. Five states, in the order they are checked:
 * already in a team, barred by role, signed out, closed, or free to enter.
 */
function Participation({
  event,
  myTeam,
  block,
  closed,
  signedIn,
  onJoined,
}: {
  event: HackEvent
  myTeam?: Team
  block: string | null
  closed: boolean
  signedIn: boolean
  onJoined: () => void
}) {
  if (myTeam) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-[0.8rem] text-muted">
          In <span className="font-bold text-ink">{myTeam.name}</span>
        </p>
        <Button href={`/teams/${myTeam.id}`} size="sm" variant="outline">
          Manage team
        </Button>
      </div>
    )
  }

  // Role block comes before the deadline check: "you may never enter this" is
  // more useful than "it is too late to enter this".
  if (block) {
    return (
      <p className="flex items-start gap-2 font-mono text-[0.78rem] leading-relaxed text-muted">
        <Icon name="lock" size={13} className="mt-0.5 shrink-0 text-subtle" />
        {block}.
      </p>
    )
  }

  if (!signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-[0.8rem] text-muted">Sign in to enter.</p>
        <Button href="/login" size="sm">
          Sign in
        </Button>
      </div>
    )
  }

  if (closed) {
    return (
      <p className="font-mono text-[0.8rem] text-muted">Submissions are closed.</p>
    )
  }

  return <CreateTeam eventId={event.id} onCreated={onJoined} />
}

/** Entering an event is creating a team in it; there is no separate step. */
function CreateTeam({ eventId, onCreated }: { eventId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createTeam({ name: name.trim(), event_id: eventId })
      onCreated()
    } catch (e) {
      // Verbatim: the server knows the real reason, including role blocks this
      // page failed to predict.
      setError(e instanceof Error ? e.message : 'Could not create the team.')
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[0.8rem] text-muted">Not entered yet.</p>
        <Button size="sm" onClick={() => setOpen(true)} icon="arrowRight">
          Enter
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Team name"
        placeholder="Null Island"
        value={name}
        error={error ?? undefined}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void create()}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !name.trim()} onClick={() => void create()}>
          {busy ? 'Creating...' : 'Create team'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="font-mono text-[0.7rem] leading-relaxed text-subtle">
        Or open an invite link from a team leader —{' '}
        <Link to="/dashboard" className="font-bold text-blue hover:underline">
          your dashboard
        </Link>{' '}
        lists yours.
      </p>
    </div>
  )
}

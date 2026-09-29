/**
 * Dashboard — the signed-in home. Leads with the hackathons this account is
 * taking part in (searchable and filterable by deadline), then the certificates
 * it holds and any outstanding notifications.
 *
 * "Participating in" is derived client-side: the backend has no "my events"
 * endpoint, so we cross the public event list with the teams this user is a
 * member of, plus any event that already lists them as a participant. That is a
 * little over-fetching in exchange for not blocking on a new endpoint.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Certificate, HackEvent, Project, Team } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { standingIn } from '../auth/participation'
import { useApi } from '../hooks/useApi'
import { useCountdown } from '../hooks/useCountdown'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Badge, Button, Card, Chip, Container, CountUp, Icon, Reveal, SearchField, cn } from '../ui'

type Filter = 'all' | 'open' | 'closed'
type Sort = 'deadline' | 'recent'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
]

const isClosed = (e: HackEvent) => new Date(e.submissions_close) < new Date()

export default function Dashboard() {
  const { user } = useAuth()
  const events = useApi(() => api.listEvents())
  const teams = useApi(() => api.listTeams())
  const projects = useApi(() => api.listProjects({}))
  const certs = useApi(() => api.myCertificates())

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('deadline')

  const myTeams = useMemo(
    () => (teams.data ?? []).filter((t) => user && t.members.some((m) => m.id === user.id)),
    [teams.data, user],
  )

  /** Every event this account is entered in, by team or by standing. */
  const myEvents = useMemo(
    () =>
      (events.data ?? []).filter(
        (e) => myTeams.some((t) => t.event_id === e.id) || standingIn(user, e) === 'participant',
      ),
    [events.data, myTeams, user],
  )

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (e: HackEvent) =>
      !needle ||
      [e.name, e.tagline, ...e.tracks.map((t) => t.name)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
  }, [q])

  const passesFilter = (e: HackEvent) =>
    filter === 'all' || (filter === 'open' && !isClosed(e)) || (filter === 'closed' && isClosed(e))

  const shown = useMemo(() => {
    const list = myEvents.filter((e) => matches(e) && passesFilter(e))
    return [...list].sort((a, b) =>
      sort === 'deadline'
        ? new Date(a.submissions_close).getTime() - new Date(b.submissions_close).getTime()
        : new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEvents, matches, filter, sort])

  const countFor = (id: Filter) =>
    myEvents.filter(
      (e) => matches(e) && (id === 'all' || (id === 'open' && !isClosed(e)) || (id === 'closed' && isClosed(e))),
    ).length

  const openEvents = myEvents.filter((e) => !isClosed(e))
  const nextDeadline = openEvents
    .map((e) => new Date(e.submissions_close))
    .sort((a, b) => a.getTime() - b.getTime())[0]

  const projectFor = (team?: Team): Project | undefined =>
    team ? projects.data?.find((p) => p.team_id === team.id) : undefined

  const loading = events.loading && !events.data

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading label="Dashboard" title="Your" tail="hackathons.">
          {user?.name ? `Welcome back, ${user.name}.` : 'Welcome back.'} Everything you are building for, in one place.
        </PageHeading>

        {/* Summary figures */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <SummaryTile label="Participating in" tone="bg-red" value={myEvents.length} suffix={myEvents.length === 1 ? 'event' : 'events'} />
          <SummaryTile label="Certificates earned" tone="bg-blue" value={certs.data?.length ?? 0} suffix={(certs.data?.length ?? 0) === 1 ? 'record' : 'records'} />
          <Card tone="ink" className="p-6">
            <div className="label-mono text-yellow">Next deadline</div>
            {nextDeadline ? (
              <>
                <div className="headline mt-3 text-[1.6rem] leading-none">
                  {nextDeadline.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </div>
                <div className="mt-2 font-mono text-[0.78rem] text-slab-fg/60">
                  {nextDeadline.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </div>
              </>
            ) : (
              <p className="mt-4 font-mono text-[0.85rem] text-slab-fg/60">No open deadlines right now.</p>
            )}
          </Card>
        </div>

        {/* Toolbar: search, deadline filters, sort */}
        <div className="mt-12 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchField
            id="dashboard-search"
            label="Search your hackathons"
            placeholder="Search by name, tagline or track"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full lg:max-w-md"
          />
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} count={events.data ? countFor(f.id) : undefined}>
                {f.label}
              </Chip>
            ))}
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
            <Chip active={sort === 'deadline'} onClick={() => setSort('deadline')}>
              Deadline
            </Chip>
            <Chip active={sort === 'recent'} onClick={() => setSort('recent')}>
              Newest
            </Chip>
          </div>
        </div>

        {loading ? (
          <p className="mt-10 label-mono text-subtle" role="status">
            Loading your hackathons
          </p>
        ) : myEvents.length === 0 ? (
          <Card tone="paper" className="mt-6 p-8 text-center">
            <p className="font-mono text-[0.9rem] text-muted">
              You have not entered a hackathon yet. Browse what is running and enter the one you want to build for.
            </p>
            <Button href="/events" className="mt-5" icon="arrowRight">
              Browse events
            </Button>
          </Card>
        ) : (
          <>
            <div className="mt-6 label-mono text-subtle" aria-live="polite">
              {shown.length} {shown.length === 1 ? 'hackathon' : 'hackathons'}
            </div>
            {shown.length === 0 ? (
              <Card tone="paper" className="mt-4 p-7 text-center">
                <p className="font-mono text-[0.9rem] text-muted">Nothing matches that. Try a different search or filter.</p>
              </Card>
            ) : (
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                {shown.map((event, i) => (
                  <Reveal key={event.id} delay={Math.min(i, 8) * 60}>
                    <EventCard
                      event={event}
                      team={myTeams.find((t) => t.event_id === event.id)}
                      project={projectFor(myTeams.find((t) => t.event_id === event.id))}
                    />
                  </Reveal>
                ))}
              </div>
            )}
          </>
        )}

        <MyCertificates rows={certs.data ?? []} />

        <Notifications />

        <div className="mt-12 flex flex-wrap gap-3">
          <Button href="/projects" variant="outline" icon="arrowRight">
            Browse the projects
          </Button>
          <Button href="/events" variant="outline" icon="arrowRight">
            Browse events
          </Button>
          {user && (
            <Button href="/organizer" variant="outline" icon="arrowRight">
              {(user.organiser_in.length ?? 0) > 0 ? 'Manage your events' : 'Host an event'}
            </Button>
          )}
        </div>
      </Container>
    </AppShell>
  )
}

function SummaryTile({ label, value, suffix, tone }: { label: string; value: number; suffix: string; tone: string }) {
  return (
    <Card tone="paper" className="p-6">
      <span className={cn('mb-3 block h-2 w-8 rounded-full', tone)} aria-hidden="true" />
      <div className="headline text-[2.4rem] leading-none">
        <CountUp value={value} />
      </div>
      <div className="label-mono mt-2 text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[0.72rem] text-subtle">{suffix}</div>
    </Card>
  )
}

/** One hackathon this account is in: standing, team, submission, deadline. */
function EventCard({ event, team, project }: { event: HackEvent; team?: Team; project?: Project }) {
  const c = useCountdown(event.submissions_close)
  const closed = c.closed

  return (
    <Card tone="paper" interactive className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="headline text-[1.35rem] leading-tight">{event.name}</h2>
          {event.tagline && <p className="mt-1 line-clamp-1 font-mono text-[0.78rem] text-muted">{event.tagline}</p>}
        </div>
        <Badge variant={closed ? 'outline' : 'green'} dot={!closed} className="shrink-0">
          {closed ? 'Closed' : `${c.days}d ${c.hours}h left`}
        </Badge>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 border-y border-line py-4 font-mono text-[0.72rem]">
        <Stat label="Your team" value={team?.name ?? '—'} />
        <Stat label="Submission" value={project ? project.status : 'None yet'} />
        <Stat label="Closes" value={new Date(event.submissions_close).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} />
      </dl>

      {project?.status === 'draft' && !closed && (
        <p className="mt-3 flex items-center gap-2 font-mono text-[0.76rem] text-danger">
          <Icon name="bolt" size={13} className="shrink-0" />
          Still a draft — submit it before the deadline.
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {project ? (
          <Button href={`/projects/${project.id}/edit`} size="sm" icon="arrowRight">
            {project.status === 'submitted' ? 'Edit submission' : 'Finish and submit'}
          </Button>
        ) : team ? (
          <Button href={`/teams/${team.id}`} size="sm" icon="arrowRight">
            Start your project
          </Button>
        ) : (
          <Button href={`/events`} size="sm" icon="arrowRight">
            Enter a team
          </Button>
        )}
        {team && (
          <Button href={`/teams/${team.id}`} size="sm" variant="outline">
            Manage team
          </Button>
        )}
        <Button href={`/projects?event=${event.id}`} size="sm" variant="ghost">
          Projects
        </Button>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-mono truncate text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate font-bold capitalize text-ink">{value}</dd>
    </div>
  )
}

/**
 * The certificates issued to this account (T4), each with its public
 * verification link. Rendered only when there is at least one.
 */
function MyCertificates({ rows }: { rows: Certificate[] }) {
  if (rows.length === 0) return null

  const titles: Record<string, string> = {
    participation: 'Participation',
    placement: 'Placement',
    judge: 'Judge record',
  }

  return (
    <Card tone="paper" className="mt-12 p-6">
      <div className="label-mono text-red">Your certificates</div>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        Each is signed by this instance and publicly verifiable &mdash; the link works for anyone, no account needed.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((cert) => (
          <li
            key={cert.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-fog p-3 font-mono text-[0.8rem]"
          >
            <span className="min-w-0">
              <span className="font-bold">{titles[cert.kind] ?? cert.kind}</span>
              {cert.event_name && <span className="text-subtle"> &middot; {cert.event_name}</span>}
            </span>
            <Button size="sm" variant="outline" href={`/verify/${cert.serial}`}>
              View and share
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * Notifications — invites and join-request outcomes the backend recorded.
 * Hidden entirely when there are none, so a quiet dashboard stays quiet.
 */
function Notifications() {
  const notes = useApi(() => api.listNotifications())

  const markRead = async (id: string) => {
    try {
      await api.markNotificationRead(id)
      notes.reload()
    } catch {
      // Not worth interrupting the page over; it will be re-read next visit.
    }
  }

  if (!notes.data || notes.data.length === 0) return null

  return (
    <Card tone="paper" className="mt-8 p-6">
      <div className="label-mono text-red">Notifications</div>
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {notes.data.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className={n.is_read ? 'font-mono text-[0.82rem] text-muted' : 'font-mono text-[0.82rem] text-ink'}>
                {n.message}
              </p>
              {n.reference_token && (
                <Link
                  to={`/invite/${n.reference_token}`}
                  className="mt-1 inline-flex items-center gap-1.5 font-mono text-[0.75rem] font-bold text-blue hover:underline"
                >
                  Open invite
                  <Icon name="arrowRight" size={12} />
                </Link>
              )}
            </div>
            {!n.is_read && (
              <button
                type="button"
                onClick={() => void markRead(n.id)}
                className="shrink-0 rounded-btn px-2 py-1 font-mono text-[0.7rem] font-bold text-subtle transition-colors hover:bg-fog hover:text-ink"
              >
                Mark read
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

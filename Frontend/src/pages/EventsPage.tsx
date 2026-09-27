/**
 * EventsPage — /events. Every event, and the one thing you can do with each:
 * enter it.
 *
 * This is where participation and team creation live. The dashboard only ever
 * knew about the featured event, so there was no way to enter any other one;
 * the Events tab is that way in.
 *
 * Who may enter is decided by the server (backend/utils/eventRoles.js). The
 * same rule is mirrored in ../auth/participation so the card can explain the
 * block up front rather than after a failed request -- but the message shown
 * on a real failure is always the server's own.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { HackEvent, Team } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { participationBlockFor, standingIn } from '../auth/participation'
import { useApi } from '../hooks/useApi'
import { useCountdown } from '../hooks/useCountdown'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, BANNER_ASPECT, Badge, Button, Card, Container, Field, Icon, cn } from '../ui'

export default function EventsPage() {
  const { user } = useAuth()
  const events = useApi(() => api.listEvents())
  const teams = useApi(() => api.listTeams())
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = () => {
    teams.reload()
    setRefreshKey((k) => k + 1)
  }

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

        {events.loading && !events.data && (
          <p className="mt-10 label-mono text-subtle" role="status">
            Loading events
          </p>
        )}

        {events.data?.length === 0 && (
          <Card tone="paper" className="mt-10 p-7">
            <p className="font-mono text-[0.9rem] text-muted">
              No events yet. An organizer has to create one first.
            </p>
          </Card>
        )}

        <div className="mt-10 flex flex-col gap-5">
          {events.data?.map((event) => (
            <EventCard
              key={`${event.id}-${refreshKey}`}
              event={event}
              teams={teams.data ?? []}
              onJoined={reload}
            />
          ))}
        </div>
      </Container>
    </AppShell>
  )
}

/** One event, plus whatever action the viewer is entitled to. */
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
    <Card tone="paper" className="overflow-hidden p-0">
      {event.banner_url && (
        // Same ratio as the editor's preview, so the crop matches what the
        // organiser framed.
        <img src={event.banner_url} alt="" className={cn(BANNER_ASPECT, 'w-full object-cover object-center')} />
      )}
      <div className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="headline text-[1.5rem]">{event.name}</h2>
            <StandingBadge standing={standing} />
          </div>
          {event.tagline && (
            <p className="mt-2 font-mono text-[0.88rem] text-muted">{event.tagline}</p>
          )}
        </div>

        <Badge variant={closed ? 'outline' : 'green'} dot={!closed}>
          {closed ? 'Submissions closed' : `${countdown.days}d ${countdown.hours}h left`}
        </Badge>
      </div>

      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-5 font-mono text-[0.78rem]">
        <Stat label="Tracks" value={String(event.tracks.length)} />
        <Stat label="Prizes" value={String(event.prizes.length)} />
        <Stat label="Team size" value={`${event.min_team_size}-${event.max_team_size}`} />
        <Stat label="Closes" value={new Date(event.submissions_close).toLocaleDateString()} />
      </dl>

      <div className="mt-6 border-t border-line pt-5">
        <Participation
          event={event}
          myTeam={myTeam}
          block={block}
          closed={closed}
          signedIn={Boolean(user)}
          onJoined={onJoined}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button href={`/projects?event=${event.id}`} variant="outline" size="sm" icon="arrowRight">
          See the projects
        </Button>
        {standing === 'organizer' && (
          <Button href={`/organizer/events/${event.id}`} variant="ghost" size="sm">
            Manage this event
          </Button>
        )}
      </div>
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-mono text-subtle">{label}</dt>
      <dd className="mt-1 font-bold text-ink">{value}</dd>
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
        <p className="font-mono text-[0.85rem] text-muted">
          You are in <span className="font-bold text-ink">{myTeam.name}</span> for this event.
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
      <p className="flex items-start gap-2 font-mono text-[0.82rem] leading-relaxed text-muted">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-subtle" />
        {block}.
      </p>
    )
  }

  if (!signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-[0.85rem] text-muted">Sign in to enter this event.</p>
        <Button href="/login" size="sm">
          Sign in
        </Button>
      </div>
    )
  }

  if (closed) {
    return (
      <p className="font-mono text-[0.85rem] text-muted">
        Submissions are closed, so this event can no longer be entered.
      </p>
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
        <p className="font-mono text-[0.85rem] text-muted">
          You are not in this event yet. Start a team to enter.
        </p>
        <Button size="sm" onClick={() => setOpen(true)} icon="arrowRight">
          Enter this event
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
      <p className="font-mono text-[0.72rem] text-subtle">
        Or open an invite link a team leader sent you.{' '}
        <Link to="/dashboard" className="font-bold text-blue hover:underline">
          Your dashboard
        </Link>{' '}
        lists invites you have been sent.
      </p>
    </div>
  )
}

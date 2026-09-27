/**
 * Dashboard — what a signed-in participant needs to see first: how long is
 * left, whether they have a team, and whether their project is submitted.
 *
 * The backend has no "my teams" endpoint, so the team is found by filtering
 * the public team list for one containing this user. That is a small amount of
 * over-fetching in exchange for not blocking on a new endpoint; if the list
 * grows past a few hundred teams it should become GET /api/teams?member=me.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Team } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { useApi } from '../hooks/useApi'
import { useCountdown } from '../hooks/useCountdown'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Badge, Button, Card, Container, Field, Icon } from '../ui'

export default function Dashboard() {
  const { user } = useAuth()
  const event = useApi(() => api.getFeaturedEvent())
  const teams = useApi(() => api.listTeams())
  const [refreshKey, setRefreshKey] = useState(0)

  const myTeam: Team | undefined = teams.data?.find((t) => t.members.some((m) => m.id === user?.id))
  const projects = useApi(
    () => (myTeam ? api.listProjects({ event_id: myTeam.event_id }) : Promise.resolve([])),
    [myTeam?.id, refreshKey],
  )
  const myProject = projects.data?.find((p) => p.team_id === myTeam?.id)

  const countdown = useCountdown(event.data?.submissions_close)
  const closed = Boolean(event.data && new Date(event.data.submissions_close) < new Date())

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading label="Dashboard" title="Your" tail="event.">
          {event.data?.name ?? 'Loading the event...'}
        </PageHeading>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {/* Deadline */}
          <Card tone="ink" className="p-6">
            <div className="label-mono text-yellow">
              {closed ? 'Submissions closed' : 'Time left to submit'}
            </div>
            {closed ? (
              <p className="mt-4 font-mono text-[0.9rem] text-slab-fg/70">
                The window shut. Submitted work is locked and visible in the gallery.
              </p>
            ) : (
              <div className="mt-4 flex gap-4 tnum">
                {[
                  ['days', countdown.days],
                  ['hrs', countdown.hours],
                  ['min', countdown.minutes],
                  ['sec', countdown.seconds],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="headline text-[2rem] leading-none">{String(value).padStart(2, '0')}</div>
                    <div className="label-mono mt-1 text-slab-fg/50">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Team */}
          <Card tone="paper" className="p-6">
            <div className="label-mono text-red">Your team</div>
            {teams.loading ? (
              <p className="mt-4 font-mono text-[0.85rem] text-subtle">Loading...</p>
            ) : myTeam ? (
              <>
                <div className="headline mt-3 text-[1.5rem]">{myTeam.name}</div>
                <div className="mt-2 font-mono text-[0.8rem] text-muted">
                  {myTeam.members.length} of {event.data?.max_team_size ?? 4} members
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {myTeam.members.map((m) => (
                    <span key={m.id} className="rounded-full bg-fog px-2.5 py-1 font-mono text-[0.7rem]">
                      {m.name || m.email}
                    </span>
                  ))}
                </div>
                <Button href={`/teams/${myTeam.id}`} variant="outline" size="sm" className="mt-5">
                  Manage team
                </Button>
              </>
            ) : (
              <CreateTeamCard eventId={event.data?.id} onCreated={() => teams.reload()} />
            )}
          </Card>

          {/* Project */}
          <Card tone="paper" className="p-6">
            <div className="label-mono text-red">Your submission</div>
            {!myTeam ? (
              <p className="mt-4 font-mono text-[0.85rem] text-muted">Create or join a team first.</p>
            ) : myProject ? (
              <>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="headline text-[1.5rem]">{myProject.title}</div>
                  <Badge variant={myProject.status === 'submitted' ? 'green' : 'outline'}>
                    {myProject.status}
                  </Badge>
                </div>
                <p className="mt-3 font-mono text-[0.82rem] text-muted">
                  {myProject.status === 'submitted'
                    ? 'Submitted. You can still edit until the deadline.'
                    : 'Still a draft. It will not be judged unless you submit it.'}
                </p>
                <Button href={`/projects/${myProject.id}/edit`} size="sm" className="mt-5" icon="arrowRight">
                  {myProject.status === 'submitted' ? 'Edit submission' : 'Finish and submit'}
                </Button>
              </>
            ) : (
              <CreateProjectCard teamId={myTeam.id} disabled={closed} onCreated={() => setRefreshKey((k) => k + 1)} />
            )}
          </Card>
        </div>

        {/* A draft with the clock running is the one thing worth nagging about. */}
        {myProject?.status === 'draft' && !closed && (
          <Alert tone="danger" className="mt-8">
            Your project is still a draft. Drafts are not judged &mdash; submit before the deadline.
          </Alert>
        )}

        <Notifications />

        <div className="mt-12 flex flex-wrap gap-3">
          <Button href="/projects" variant="outline" icon="arrowRight">
            Browse the projects
          </Button>
          <Button href="/events" variant="outline" icon="arrowRight">
            Browse events
          </Button>
          {/* Offered to everyone, not just people who already run something:
              hosting is an action any account can take, and hiding this was
              the only thing standing between a participant and their first
              event. The label just reflects whether they have one yet. */}
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

/** Inline team creation, so an empty dashboard is still actionable. */
function CreateTeamCard({ eventId, onCreated }: { eventId?: string; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!eventId || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createTeam({ name: name.trim(), event_id: eventId })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the team.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <p className="font-mono text-[0.85rem] text-muted">You are not in a team yet.</p>
      <div className="mt-4 flex flex-col gap-3">
        <Field
          label="Team name"
          placeholder="Null Island"
          value={name}
          error={error ?? undefined}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
        />
        <Button size="sm" disabled={busy || !name.trim() || !eventId} onClick={() => void create()}>
          {busy ? 'Creating...' : 'Create team'}
        </Button>
      </div>
      <p className="mt-3 font-mono text-[0.72rem] text-subtle">
        Or open an invite link someone sent you.
      </p>
    </div>
  )
}

/** Inline project creation; the full form lives on the edit page. */
function CreateProjectCard({ teamId, disabled, onCreated }: { teamId: string; disabled: boolean; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const project = await api.createProject({ team_id: teamId, title: title.trim() })
      onCreated()
      window.location.assign(`/projects/${project.id}/edit`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the project.')
      setBusy(false)
    }
  }

  if (disabled) {
    return <p className="mt-4 font-mono text-[0.85rem] text-muted">Submissions are closed, so no new projects.</p>
  }

  return (
    <div className="mt-3">
      <p className="font-mono text-[0.85rem] text-muted">No project yet. Start a draft.</p>
      <div className="mt-4 flex flex-col gap-3">
        <Field
          label="Project title"
          placeholder="Quorum"
          value={title}
          error={error ?? undefined}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
        />
        <Button size="sm" disabled={busy || !title.trim()} onClick={() => void create()} icon="arrowRight">
          {busy ? 'Creating...' : 'Start draft'}
        </Button>
      </div>
    </div>
  )
}

/** Small helper so a Link-styled Button keeps router behaviour where needed. */
export function RouterLinkButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 font-mono text-[0.8rem] font-bold text-blue hover:underline">
      {children}
      <Icon name="arrowRight" size={14} />
    </Link>
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
              {/* A direct invite carries its token, so it can be acted on here. */}
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

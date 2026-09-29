/**
 * ProfilePage — /profile. Who you are, and what you are doing here.
 *
 * The activity list is the point. Because roles are per event, "what is this
 * user?" has no answer: the same account organises one hackathon, judges a
 * track in another and competes in a third. So the page prints no role at all
 * beside the name -- it lists the events and says what you are in each one.
 *
 * Nothing here needs a profile endpoint; it is all derived from lists the user
 * can already read. Editing goes through PUT /api/users/:id, which allow-lists
 * name, email and password server-side.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, authApi } from '../api'
import type { HackEvent, Project, Team } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { standingIn, type EventStanding } from '../auth/participation'
import { initialsFor } from '../auth/roles'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Badge, Button, Card, Container, Field, Icon, ImagePicker } from '../ui'

export default function ProfilePage() {
  const { user, refresh } = useAuth()

  const events = useApi(() => api.listEvents())
  const teams = useApi(() => api.listTeams())
  const projects = useApi(() => api.listProjects())

  const myTeams = (teams.data ?? []).filter((t) => user && t.members.some((m) => m.id === user.id))

  // An event counts as yours if you hold any standing in it, or you are in one
  // of its teams.
  const mine = (events.data ?? [])
    .map((event) => ({ event, standing: standingIn(user, event) }))
    .filter(({ event, standing }) => standing !== 'visitor' || myTeams.some((t) => t.event_id === event.id))

  if (!user) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Profile" title="Not" tail="signed in.">
            Sign in to see your profile.
          </PageHeading>
          <Button className="mt-8" href="/login" icon="arrowRight">
            Sign in
          </Button>
        </Container>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label="Profile"
          title="Your"
          tail="account."
          actions={user.is_admin ? <Badge variant="red">Admin</Badge> : undefined}
        >
          Roles belong to events, not to people &mdash; what you are here depends on which event you are looking at.
        </PageHeading>

        <div className="mt-10 grid gap-5 lg:grid-cols-[340px_1fr] lg:items-start">
          <div className="flex flex-col gap-5">
            <IdentityCard />
            <EditProfile onSaved={refresh} />
          </div>

          <Activity
            mine={mine}
            myTeams={myTeams}
            projects={projects.data ?? []}
            loading={events.loading && !events.data}
          />
        </div>
      </Container>
    </AppShell>
  )
}

/** Name, address, avatar and how much of each thing you are doing. */
function IdentityCard() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <Card tone="paper" className="p-6">
      <div className="flex items-center gap-4">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-ink"
          />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-yellow font-mono text-[0.95rem] font-bold text-on-bright ring-2 ring-ink">
            {initialsFor(user)}
          </span>
        )}
        <div className="min-w-0">
          <div className="headline truncate text-[1.35rem]">{user.name || user.email}</div>
          <div className="truncate font-mono text-[0.78rem] text-muted">{user.email}</div>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-line pt-5 text-center">
        <Counter label="Organising" value={user.organiser_in.length} />
        <Counter label="Judging" value={user.judge_in.length} />
        <Counter label="Competing" value={user.participating_in.length} />
      </dl>
    </Card>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="headline tnum text-[1.6rem] leading-none">{value}</dd>
      <dt className="label-mono mt-1 text-subtle">{label}</dt>
    </div>
  )
}

/** Name, email and an optional new password. */
function EditProfile({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [avatar, setAvatar] = useState(user?.avatar_url ?? '')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Re-seed if the signed-in user arrives or changes under the form.
  useEffect(() => {
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
    setAvatar(user?.avatar_url ?? '')
  }, [user?.id, user?.name, user?.email, user?.avatar_url])

  if (!user) return null

  const dirty =
    name !== (user.name ?? '') ||
    email !== user.email ||
    avatar !== (user.avatar_url ?? '') ||
    password.length > 0

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      // Only what changed: a picture-only save must not be refused over a field
      // the user never touched (e.g. an account with no name yet).
      await authApi.updateProfile(user.id, {
        ...(name !== (user.name ?? '') ? { name } : {}),
        ...(email !== user.email ? { email } : {}),
        ...(avatar !== (user.avatar_url ?? '') ? { avatar_url: avatar } : {}),
        // The server refuses a password change without the current one, so
        // both travel together or neither does.
        ...(password ? { password, current_password: currentPassword } : {}),
      })
      setPassword('')
      setCurrentPassword('')
      await onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } catch (e) {
      // Verbatim: the server owns the reason, e.g. a duplicate address.
      setError(e instanceof Error ? e.message : 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card tone="paper" className="p-6">
      <div className="label-mono text-red">Edit profile</div>

      {error && <Alert className="mt-4">{error}</Alert>}

      <div className="mt-5 flex flex-col gap-4">
        <ImagePicker
          label="Profile picture"
          shape="avatar"
          hint="PNG, JPEG, WEBP or GIF, up to 2 MB."
          value={avatar}
          disabled={busy}
          onChange={setAvatar}
        />
        <Field label="Name" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Email"
          type="email"
          hint="You sign in with this."
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          {/* new-password stops the browser autofilling the saved password
              here, which would silently turn every save into a password
              change and hold the Save button until "current password" was
              typed -- blocking even a picture-only change. */}
          <Field
            label="New password"
            reveal
            autoComplete="new-password"
            hint="Leave blank to keep the one you have."
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
          {/* Only asked for when there is something to authorise, so the
              common case (rename, new picture) stays a two-field form. */}
          {password.length > 0 && (
            <Field
              label="Current password"
              reveal
              autoComplete="current-password"
              hint="Required to change your password."
              value={currentPassword}
              disabled={busy}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}
        </div>
      </div>

      <Button
        className="mt-5 w-full"
        disabled={busy || !dirty || (password.length > 0 && currentPassword.length === 0)}
        onClick={() => void save()}
      >
        {busy ? 'Saving...' : saved ? 'Saved' : dirty ? 'Save changes' : 'No changes'}
      </Button>

      <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 font-mono text-[0.72rem] leading-relaxed text-subtle">
        <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
        Admin status and event roles are not editable here. The server sets those as a consequence of
        what you do, and refuses to take them from a request.
      </p>
    </Card>
  )
}

const STANDING_COPY: Record<Exclude<EventStanding, 'visitor'>, { label: string; note: string }> = {
  admin: { label: 'Admin', note: 'You administer the platform, so you do not compete here.' },
  organizer: { label: 'Organising', note: 'You run this event, so you cannot compete in it.' },
  judge: { label: 'Judging', note: 'You score entries here, so you cannot compete in it.' },
  participant: { label: 'Competing', note: 'You are entered in this event.' },
}

/** One row per event the user has any relationship to. */
function Activity({
  mine,
  myTeams,
  projects,
  loading,
}: {
  mine: { event: HackEvent; standing: EventStanding }[]
  myTeams: Team[]
  projects: Project[]
  loading: boolean
}) {
  return (
    <Card tone="paper" className="p-6">
      <div className="label-mono text-red">Your activity</div>

      {loading && (
        <p className="mt-5 font-mono text-[0.85rem] text-subtle" role="status">
          Loading your events
        </p>
      )}

      {!loading && mine.length === 0 && (
        <div className="mt-5">
          <p className="font-mono text-[0.88rem] text-muted">You are not attached to any event yet.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button href="/events" size="sm" icon="arrowRight">
              Browse events
            </Button>
            <Button href="/organizer" size="sm" variant="outline">
              Host your own
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-5 flex flex-col divide-y divide-line">
        {mine.map(({ event, standing }) => {
          const team = myTeams.find((t) => t.event_id === event.id)
          const project = team ? projects.find((p) => p.team_id === team.id) : undefined
          const copy = STANDING_COPY[standing === 'visitor' ? 'participant' : standing]
          const closed = new Date(event.submissions_close) < new Date()

          return (
            <li key={event.id} className="flex flex-col gap-3 py-5 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to="/events" className="headline text-[1.15rem] hover:text-blue">
                    {event.name}
                  </Link>
                  <p className="mt-1 font-mono text-[0.78rem] text-muted">{copy.note}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge variant={standing === 'participant' ? 'blue' : 'yellow'}>{copy.label}</Badge>
                  {closed && <Badge variant="outline">Closed</Badge>}
                </div>
              </div>

              {team && (
                <div className="rounded-card bg-fog p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 font-mono text-[0.8rem]">
                      <span className="text-subtle">Team </span>
                      <span className="font-bold">{team.name}</span>
                      <span className="text-subtle">
                        {' '}
                        &middot; {team.members.length} member{team.members.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <Button href={`/teams/${team.id}`} size="sm" variant="ghost">
                      Open team
                    </Button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    {project ? (
                      <>
                        <div className="min-w-0 font-mono text-[0.8rem]">
                          <span className="text-subtle">Entry </span>
                          <span className="font-bold">{project.title}</span>
                          <Badge
                            variant={project.status === 'submitted' ? 'green' : 'outline'}
                            className="ml-2 align-middle"
                          >
                            {project.status}
                          </Badge>
                        </div>
                        <Button href={`/projects/${project.id}/edit`} size="sm" variant="ghost">
                          {closed ? 'View entry' : 'Edit entry'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-[0.8rem] text-muted">No entry started yet.</span>
                        {!closed && (
                          <Button href="/dashboard" size="sm" variant="ghost">
                            Start one
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {standing === 'organizer' && (
                <Button href={`/organizer/events/${event.id}`} size="sm" variant="outline" className="self-start">
                  Manage this event
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

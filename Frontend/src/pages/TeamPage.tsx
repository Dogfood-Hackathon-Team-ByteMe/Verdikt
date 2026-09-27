/**
 * TeamPage — /teams/:id. Members, and the invite link the leader generates.
 *
 * Only the leader (the first member, by backend convention) can create invites
 * or remove people; the buttons are hidden for everyone else, and the server
 * refuses regardless.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth/AuthProvider'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Badge, Button, Card, Container, Icon } from '../ui'

export default function TeamPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()

  const team = useApi(() => api.getTeam(id), [id])
  const event = useApi(() => api.getFeaturedEvent())

  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const isLeader = Boolean(user && team.data && team.data.leader_id === user.id)
  const full = Boolean(team.data && event.data && team.data.members.length >= event.data.max_team_size)

  const makeInvite = async () => {
    setBusy(true)
    setError(null)
    try {
      const invite = await api.createInvite(id)
      // A full URL, because the point of this button is something to paste.
      setInviteUrl(`${window.location.origin}/invite/${invite.token}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be blocked; the input below is selectable as a fallback.
    }
  }

  const remove = async (userId: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.removeMember(id, userId)
      team.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that member.')
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await api.leaveTeam(id, user.id)
      // Leaving also drops the event enrolment, so the dashboard must re-read.
      window.location.assign('/dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave the team.')
      setBusy(false)
      setLeaving(false)
    }
  }

  if (team.loading && !team.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <p className="label-mono text-subtle" role="status">Loading the team</p>
        </Container>
      </AppShell>
    )
  }

  if (!team.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Not found" title="No team" tail="here." />
          <Button className="mt-8" href="/dashboard" icon="arrowRight">Back to dashboard</Button>
        </Container>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label="Team"
          title={team.data.name}
          actions={isLeader ? <Badge variant="yellow">You lead this team</Badge> : undefined}
        >
          {team.data.members.length} of {event.data?.max_team_size ?? 4} members.
        </PageHeading>

        {error && <Alert className="mt-8">{error}</Alert>}

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Card tone="paper" className="p-6">
            <div className="label-mono text-red">Members</div>
            <ul className="mt-5 flex flex-col divide-y divide-line">
              {team.data.members.map((m, i) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fog font-mono text-[0.7rem] font-bold ring-1 ring-line">
                      {(m.name || m.email || '?').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[0.85rem] font-bold">{m.name || m.email}</div>
                      {i === 0 && <div className="label-mono text-subtle">Leader</div>}
                    </div>
                  </div>
                  {/* The leader cannot remove themselves; that would orphan the team. */}
                  {isLeader && i !== 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(m.id)}
                      className="rounded-btn px-2 py-1 font-mono text-[0.7rem] font-bold text-subtle transition-colors hover:bg-fog hover:text-danger disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card tone="paper" className="p-6">
            <div className="label-mono text-red">Invite link</div>

            {!isLeader ? (
              <p className="mt-5 font-mono text-[0.85rem] text-muted">
                Only the team leader can create invite links.
              </p>
            ) : full ? (
              <p className="mt-5 font-mono text-[0.85rem] text-muted">
                This team is full ({event.data?.max_team_size} members), so new invites are refused.
              </p>
            ) : (
              <>
                <p className="mt-3 font-mono text-[0.85rem] text-muted">
                  Anyone with the link can join, until it expires in 7 days.
                </p>

                {inviteUrl ? (
                  <div className="mt-5">
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={inviteUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-11 min-w-0 flex-1 rounded-btn bg-fog px-3 font-mono text-[0.75rem] outline-none ring-1 ring-line focus:ring-2 focus:ring-ink"
                      />
                      <Button size="sm" onClick={() => void copy()}>
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void makeInvite()}
                      className="mt-3 font-mono text-[0.72rem] font-bold text-blue hover:underline disabled:opacity-50"
                    >
                      Generate a different link
                    </button>
                  </div>
                ) : (
                  <Button className="mt-5" disabled={busy} onClick={() => void makeInvite()} icon="arrowRight">
                    {busy ? 'Creating...' : 'Create invite link'}
                  </Button>
                )}
              </>
            )}

            <p className="mt-6 flex items-start gap-2 border-t border-line pt-5 font-mono text-[0.72rem] leading-relaxed text-subtle">
              <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
              Links are single-team and expire. Revoke one by generating a new link.
            </p>
          </Card>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button href="/dashboard" variant="outline">
            Back to dashboard
          </Button>

          {/* The leader cannot leave -- it would orphan the team -- so this
              only appears for other members. */}
          {user && !isLeader && team.data.members.some((m) => m.id === user.id) && (
            leaving ? (
              <>
                <span className="font-mono text-[0.8rem] text-muted">Leave this team?</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void leave()}>
                  Yes, leave
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLeaving(false)}>Cancel</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}>
                Leave team
              </Button>
            )
          )}
        </div>
      </Container>
    </AppShell>
  )
}

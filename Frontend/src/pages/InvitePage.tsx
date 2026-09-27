/**
 * InvitePage — /invite/:token.
 *
 * Public on purpose: you should be able to see which team invited you before
 * deciding whether to make an account. If you are signed out, the join button
 * routes through sign-in and comes back here.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth/AuthProvider'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Button, Card, Container, Icon } from '../ui'

export default function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { user, status } = useAuth()

  const invite = useApi(() => api.getInvite(token), [token])
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)

  const join = async () => {
    setJoining(true)
    setError(null)
    try {
      await api.acceptInvite(token)
      setJoined(true)
      // Give the success state a beat to register before moving on.
      setTimeout(() => navigate('/dashboard'), 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the team.')
      setJoining(false)
    }
  }

  if (invite.loading) {
    return (
      <AppShell>
        <Container className="py-20">
          <p className="label-mono text-subtle" role="status">Checking the invite</p>
        </Container>
      </AppShell>
    )
  }

  // An expired link 410s and an unknown one 404s; both mean the same thing here.
  if (invite.error || !invite.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Invite" title="This link" tail="does not work.">
            {invite.error?.message ?? 'The invite may have expired, been revoked, or never existed.'}
          </PageHeading>
          <Button className="mt-8" href="/" icon="arrowRight">
            Back to the event page
          </Button>
        </Container>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Container className="py-12 sm:py-20">
        <div className="mx-auto max-w-xl">
          <PageHeading label="Team invite" title="You have been" tail="invited." />

          <Card tone="paper" className="mt-8 p-7">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue text-white ring-2 ring-ink">
                <Icon name="users" size={20} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <div className="headline truncate text-[1.6rem]">{invite.data.team_name ?? 'A team'}</div>
                {invite.data.expires_at && (
                  <div className="label-mono mt-1 text-subtle">
                    Link expires {new Date(invite.data.expires_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>

            {error && <Alert className="mt-6">{error}</Alert>}
            {joined && (
              <Alert tone="success" className="mt-6">
                You are in. Taking you to your dashboard.
              </Alert>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              {status === 'loading' ? (
                <Button disabled>Checking your session</Button>
              ) : user ? (
                <Button disabled={joining || joined} onClick={() => void join()} size="lg" icon="arrowRight">
                  {joined ? 'Joined' : joining ? 'Joining...' : 'Join this team'}
                </Button>
              ) : (
                <>
                  {/* Carry the invite path through sign-in so they land back here. */}
                  <Button
                    size="lg"
                    icon="arrowRight"
                    onClick={() => navigate('/login', { state: { from: `/invite/${token}` } })}
                  >
                    Sign in to join
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => navigate('/signup', { state: { from: `/invite/${token}` } })}
                  >
                    Create an account
                  </Button>
                </>
              )}
            </div>

            <p className="mt-6 border-t border-line pt-5 font-mono text-[0.75rem] leading-relaxed text-subtle">
              Joining a team enrols you in its event. You can only be in one team per event, and judges cannot join a
              team in an event they are judging.
            </p>
          </Card>

          <p className="mt-6 text-center font-mono text-[0.8rem] text-muted">
            Not what you expected?{' '}
            <Link to="/" className="font-bold text-blue hover:underline">
              Go to the event page
            </Link>
          </p>
        </div>
      </Container>
    </AppShell>
  )
}

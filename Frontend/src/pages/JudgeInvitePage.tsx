/**
 * JudgeInvitePage — /judge-invite/:token.
 *
 * Public, like the team invite page: you should see which event and track you
 * are being asked to judge before deciding to make an account. Signed out, the
 * accept button routes through sign-in or sign-up and comes back here.
 *
 * The link only works for the address it was sent to. The page shows a masked
 * hint of that address so the right person knows which account to use, and
 * the server refuses anyone else outright.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth/AuthProvider'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Button, Card, Container, Icon } from '../ui'

const DEAD: Record<string, string> = {
  accepted: 'This invite has already been used.',
  revoked: 'The organizer withdrew this invite.',
  expired: 'This invite has expired. Ask the organizer for a new one.',
}

export default function JudgeInvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { user, status, refresh } = useAuth()

  const invite = useApi(() => api.getJudgeInvite(token), [token])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.acceptJudgeInvite(token)
      // The session's judge_in just changed; refetch it so /judge sees it.
      await refresh()
      setDone(true)
      setTimeout(() => navigate('/judge'), 900)
    } catch (e) {
      // Verbatim: "sent to a different email address" and "you are competing in
      // this event" are the server's reasons and the only useful ones.
      setError(e instanceof Error ? e.message : 'Could not accept the invite.')
      setBusy(false)
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

  if (invite.error || !invite.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Judge invite" title="This link" tail="does not work.">
            {invite.error?.message ?? 'The invite may have been withdrawn, or never existed.'}
          </PageHeading>
          <Button className="mt-8" href="/" icon="arrowRight">
            Back to the event page
          </Button>
        </Container>
      </AppShell>
    )
  }

  const data = invite.data
  const dead = DEAD[data.status]
  const here = `/judge-invite/${token}`

  return (
    <AppShell>
      <Container className="py-12 sm:py-20">
        <div className="mx-auto max-w-xl">
          <PageHeading label="Judge invite" title="You are invited" tail="to judge." />

          <Card tone="paper" className="mt-8 p-7">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-yellow text-on-bright ring-2 ring-ink">
                <Icon name="check" size={20} strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <div className="headline truncate text-[1.5rem]">{data.track_name ?? 'A track'}</div>
                <div className="font-mono text-[0.8rem] text-muted">{data.event_name ?? 'An event'}</div>
              </div>
            </div>

            <p className="mt-5 font-mono text-[0.8rem] text-muted">
              This invite is for <span className="font-bold text-ink">{data.email_hint}</span>. Sign in with that
              address to accept it.
              {data.expires_at && data.status === 'pending' && (
                <> It expires {new Date(data.expires_at).toLocaleDateString()}.</>
              )}
            </p>

            {dead && <Alert className="mt-6">{dead}</Alert>}
            {error && <Alert className="mt-6">{error}</Alert>}
            {done && (
              <Alert tone="success" className="mt-6">
                You are on the panel. Taking you to your judging queue.
              </Alert>
            )}

            {!dead && (
              <div className="mt-7 flex flex-wrap gap-3">
                {status === 'loading' ? (
                  <Button disabled>Checking your session</Button>
                ) : user ? (
                  <Button disabled={busy || done} onClick={() => void accept()} size="lg" icon="arrowRight">
                    {done ? 'Accepted' : busy ? 'Accepting...' : `Accept as ${user.email}`}
                  </Button>
                ) : (
                  <>
                    <Button size="lg" icon="arrowRight" onClick={() => navigate('/login', { state: { from: here } })}>
                      Sign in to accept
                    </Button>
                    <Button variant="outline" size="lg" onClick={() => navigate('/signup', { state: { from: here } })}>
                      Create an account
                    </Button>
                  </>
                )}
              </div>
            )}

            <p className="mt-6 border-t border-line pt-5 font-mono text-[0.75rem] leading-relaxed text-subtle">
              Judging a track makes you a judge of this event, so you cannot also enter it. You will score only the
              entries in your track, or the batch the organizer assigns you, and you will only ever see your own
              scores.
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

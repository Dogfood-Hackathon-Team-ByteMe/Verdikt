/**
 * OrganizerHome — /organizer. The events this person runs, and the button to
 * start a new one.
 *
 * Creating an event makes you its organiser server-side (EventService adds the
 * id to your organiserIn), so the list grows as soon as the session refreshes.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth/AuthProvider'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, BANNER_ASPECT, Badge, Button, Card, Container, Field, cn } from '../ui'

/** Two days out, as a sensible default deadline for a new event. */
const defaultClose = () => {
  const d = new Date(Date.now() + 48 * 3600_000)
  // datetime-local wants "YYYY-MM-DDTHH:mm" with no timezone or seconds.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function OrganizerHome() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const events = useApi(() => api.listMyEvents(user?.organiser_in ?? []), [user?.organiser_in.join(',')])

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [close, setClose] = useState(defaultClose())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const event = await api.createEvent({
        name: name.trim(),
        description: description.trim(),
        // datetime-local gives local time; the API wants an instant.
        submissions_close: new Date(close).toISOString(),
        starts_at: new Date().toISOString(),
      })
      // The session now organises one more event, so re-read it before the
      // guard on the next page runs.
      await refresh()
      navigate(`/organizer/events/${event.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the event.')
      setBusy(false)
    }
  }

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label="Organizer"
          title="Your"
          tail="events."
          actions={
            !creating && (
              <Button onClick={() => setCreating(true)} icon="plus">
                New event
              </Button>
            )
          }
        >
          Set the dates, tracks, prizes and the questions every team has to answer.
        </PageHeading>

        {creating && (
          <Card tone="paper" className="mt-10 p-6 sm:p-7">
            <h2 className="headline text-[1.25rem]">New event</h2>
            {error && <Alert className="mt-5">{error}</Alert>}
            <div className="mt-6 flex flex-col gap-5">
              <Field
                label="Event name"
                placeholder="DOGFOOD 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Field
                label="Description"
                placeholder="What are people building, and why?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-event-close" className="label-mono text-ink">
                  Submissions close
                </label>
                <input
                  id="new-event-close"
                  type="datetime-local"
                  value={close}
                  onChange={(e) => setClose(e.target.value)}
                  className="h-12 w-full rounded-btn bg-paper px-3.5 font-mono text-[0.9rem] text-ink outline-none ring-1 ring-line transition-[box-shadow] duration-200 hover:ring-subtle focus:ring-2 focus:ring-ink"
                />
                <p className="font-mono text-[0.72rem] text-subtle">
                  Must be in the future. You can change it later, and the server enforces it on every submission.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy || !name.trim() || !description.trim()} onClick={() => void create()} icon="arrowRight">
                  {busy ? 'Creating...' : 'Create event'}
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}

        {events.loading && !events.data ? (
          <p className="mt-10 label-mono text-subtle" role="status">Loading your events</p>
        ) : events.data && events.data.length > 0 ? (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {events.data.map((e) => {
              const closed = new Date(e.submissions_close) < new Date()
              return (
                <li key={e.id}>
                  <Card tone="paper" interactive className="flex h-full flex-col overflow-hidden p-0">
                    {/* Same ratio as the editor preview and the public event
                        card, so one banner is framed once and crops the same
                        everywhere it appears. */}
                    {e.banner_url ? (
                      <img
                        src={e.banner_url}
                        alt=""
                        className={cn(BANNER_ASPECT, 'w-full object-cover object-center')}
                      />
                    ) : (
                      <div className={cn(BANNER_ASPECT, 'grid w-full place-items-center bg-fog')}>
                        <span className="label-mono text-subtle">No banner</span>
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="headline text-[1.4rem]">{e.name}</h3>
                      <Badge variant={closed ? 'outline' : 'green'}>{closed ? 'closed' : 'open'}</Badge>
                    </div>
                    <p className="mt-3 font-mono text-[0.82rem] text-muted">{e.tagline || e.description}</p>
                    <dl className="mt-5 grid grid-cols-3 gap-3 font-mono text-[0.72rem]">
                      <div>
                        <dt className="text-subtle">Tracks</dt>
                        <dd className="mt-1 text-[1.1rem] tnum">{e.tracks.length}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Prizes</dt>
                        <dd className="mt-1 text-[1.1rem] tnum">{e.prizes.length}</dd>
                      </div>
                      <div>
                        <dt className="text-subtle">Questions</dt>
                        <dd className="mt-1 text-[1.1rem] tnum">{e.custom_questions.length}</dd>
                      </div>
                    </dl>
                    <Button href={`/organizer/events/${e.id}`} size="sm" variant="outline" className="mt-6 self-start">
                      Manage
                    </Button>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        ) : (
          !creating && (
            <Card tone="fog" className="mt-10 p-8 text-center">
              <p className="font-mono text-[0.9rem] text-muted">
                You do not organise any events yet.
              </p>
              <Button className="mt-5" onClick={() => setCreating(true)} icon="plus">
                Create your first event
              </Button>
            </Card>
          )
        )}
      </Container>
    </AppShell>
  )
}

/**
 * CommunityPage — /community. The crowd's pick, in public.
 *
 * The poll endpoint has always been public; without this page only the
 * organizer could actually see it, which rather defeats a community vote. It
 * reads the same `GET /api/events/:id/community` that `/api/v1` publishes, so
 * a venue screen and this page never disagree.
 *
 * `?event=<id>` picks an event, mirroring /projects; without it the featured
 * event supplies the poll. The judged standings are deliberately NOT here —
 * they stay behind the organizer's session until results are published, and
 * saying so on the page is the point rather than an omission.
 */
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Button, Card, Container, cn } from '../ui'

export default function CommunityPage() {
  const [params] = useSearchParams()
  const pinned = params.get('event') ?? undefined

  const featured = useApi(() => api.getFeaturedEvent())
  const eventId = pinned ?? featured.data?.id
  const scoped = useApi(() => (pinned ? api.getEvent(pinned) : Promise.resolve(null)), [pinned])
  const event = pinned ? scoped.data : featured.data

  const poll = useApi(
    () => (eventId ? api.getCommunityPoll(eventId) : Promise.resolve(null)),
    [eventId],
  )

  const rows = poll.data?.standings ?? []
  const voted = rows.filter((r) => r.vote_count > 0)
  const total = poll.data?.total_votes ?? 0

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label="Community"
          title="The crowd's"
          tail="pick."
        >
          One vote per person, on submitted entries. This is the public&apos;s favourite and only that &mdash; the
          judged result is decided by the panel against the organizer&apos;s rubric, and the two are allowed to
          disagree.
        </PageHeading>

        {event && (
          <div className="mt-4 font-mono text-[0.85rem] text-muted">
            {event.name}
            {/* The running total belongs on this line, next to the event it
                counts, rather than floating beside the heading. */}
            {total > 0 && <span className="tnum"> · {total} {total === 1 ? 'vote' : 'votes'}</span>}
            {' · '}
            {/* -my-1 keeps the line's height while the padding lifts the hit
                area over the 24px minimum. */}
            <Link
              to={`/projects${pinned ? `?event=${pinned}` : ''}`}
              className="-my-1 inline-block py-1 hover:text-blue"
            >
              browse every entry
            </Link>
          </div>
        )}

        <div className="mt-8">
          {poll.loading && !poll.data ? (
            <p className="label-mono text-subtle" role="status">
              Counting the votes
            </p>
          ) : voted.length === 0 ? (
            <Card tone="paper" className="p-6 sm:p-7">
              <h2 className="headline text-[1.25rem]">No votes yet</h2>
              <p className="mt-2 font-mono text-[0.85rem] text-muted">
                Nothing has been voted for so far. Open an entry and press Vote &mdash; you need an account, and
                you get one vote per project.
              </p>
              <Button href="/projects" icon="arrowRight" className="mt-5">
                Browse the entries
              </Button>
            </Card>
          ) : (
            <ol className="flex flex-col gap-3">
              {voted.map((row) => (
                <li key={row.project_id}>
                  <Card tone="paper" className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-4">
                        {/* The top three get the heavier treatment; after that a
                            rank is just a number and should read like one. */}
                        <span
                          className={cn(
                            'tnum grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-[1rem] font-bold',
                            row.rank === 1 && 'bg-yellow text-ink',
                            row.rank === 2 && 'bg-fog text-ink ring-1 ring-ink',
                            row.rank === 3 && 'bg-fog text-muted ring-1 ring-line',
                            row.rank > 3 && 'font-mono text-[0.85rem] text-subtle',
                          )}
                        >
                          {row.rank}
                        </span>
                        <div className="min-w-0">
                          <Link
                            to={`/projects/${row.project_id}`}
                            className="font-display text-[1.05rem] font-bold hover:text-blue"
                          >
                            {row.title}
                          </Link>
                          <div className="font-mono text-[0.75rem] text-subtle">
                            {row.team_name ?? 'Unknown team'}
                            {row.track && ` · ${row.track}`}
                          </div>
                        </div>
                      </div>

                      <div className="tnum shrink-0 text-right">
                        <div className="font-display text-[1.3rem] font-bold leading-none">{row.vote_count}</div>
                        <div className="label-mono text-subtle">{row.vote_count === 1 ? 'vote' : 'votes'}</div>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>

        <p className="mt-10 font-mono text-[0.75rem] leading-relaxed text-subtle">
          Ties share a rank, so two entries on the same count are both second and the next is fourth. The same
          numbers are available without an account at{' '}
          {/* break-all because the path carries a 24-character event id, which
              is one unbreakable word wider than a phone screen. */}
          <code className="break-all rounded bg-fog px-1.5 py-0.5">
            /api/v1/events/{eventId ?? ':id'}/community
          </code>
          .
        </p>
      </Container>
    </AppShell>
  )
}

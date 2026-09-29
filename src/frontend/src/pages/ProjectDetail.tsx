/**
 * ProjectDetail — /projects/:id. The public page for one submission.
 *
 * Renders the full T1 data model: thumbnail, gallery, demo video, links, tags
 * and the organizer's questions and answers. Scores are never shown here --
 * they stay hidden until results are published, which is the whole reason the
 * gallery is safe to make public during judging.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { Project, ProjectComment } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Badge, Button, Card, Container, Icon, cn } from '../ui'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }) + ' UTC'

export default function ProjectDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const project = useApi(() => api.getProject(id), [id])
  const event = useApi(() => api.getFeaturedEvent())

  if (project.loading && !project.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <p className="label-mono text-subtle" role="status">Loading the project</p>
        </Container>
      </AppShell>
    )
  }

  // getProject returns null for both "gone" and "still a draft you may not
  // see", because the difference is not the visitor's business.
  if (!project.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Not found" title="No project" tail="here.">
            It may still be a draft, or it may have been withdrawn.
          </PageHeading>
          <Button className="mt-8" href="/projects" icon="arrowRight">
            Back to the projects
          </Button>
        </Container>
      </AppShell>
    )
  }

  const p = project.data
  const questions = event.data?.custom_questions ?? []
  const answered = questions.filter((q) => p.custom_answers[q.key]?.trim())
  const canEdit = Boolean(user) // the server decides for real; this only offers the link

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label={p.track_name ?? 'Project'}
          title={p.title}
          actions={
            <Badge variant={p.status === 'submitted' ? 'green' : 'outline'}>
              {p.status === 'submitted' && p.submitted_at ? `Submitted ${when(p.submitted_at)}` : 'Draft'}
            </Badge>
          }
        >
          {p.tagline || p.summary}
        </PageHeading>

        <div className="mt-4 font-mono text-[0.85rem] text-muted">by {p.team}</div>

        {p.thumbnail_url && (
          <div className="mt-8 overflow-hidden rounded-card ring-1 ring-ink">
            <img src={p.thumbnail_url} alt="" className="aspect-[2/1] w-full object-cover" loading="lazy" />
          </div>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-8">
            {p.description && (
              <Card tone="paper" className="p-6 sm:p-7">
                <h2 className="headline text-[1.25rem]">About</h2>
                {/* whitespace-pre-line so the author's paragraph breaks survive. */}
                <p className="mt-4 whitespace-pre-line font-mono text-[0.9rem] leading-relaxed text-ink">
                  {p.description}
                </p>
              </Card>
            )}

            {p.gallery_urls.length > 0 && (
              <Card tone="paper" className="p-6 sm:p-7">
                <h2 className="headline text-[1.25rem]">Gallery</h2>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {p.gallery_urls.map((url) => (
                    <li key={url} className="overflow-hidden rounded-card ring-1 ring-line">
                      <img src={url} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {answered.length > 0 && (
              <Card tone="paper" className="p-6 sm:p-7">
                <h2 className="headline text-[1.25rem]">Organizer questions</h2>
                <dl className="mt-5 flex flex-col gap-5">
                  {answered.map((q) => (
                    <div key={q.key}>
                      <dt className="label-mono text-muted">{q.label}</dt>
                      <dd className="mt-2 whitespace-pre-line font-mono text-[0.88rem] leading-relaxed">
                        {p.custom_answers[q.key]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )}
          </div>

          <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            {p.status === 'submitted' && <VotePanel project={p} />}

            <Card tone="paper" className="p-6">
              <div className="label-mono text-red">Links</div>
              <div className="mt-4 flex flex-col gap-2">
                {p.repo_url && (
                  <Button href={p.repo_url} target="_blank" rel="noreferrer" variant="outline" size="sm" icon="arrowUpRight">
                    Repository
                  </Button>
                )}
                {p.live_url && (
                  <Button href={p.live_url} target="_blank" rel="noreferrer" variant="outline" size="sm" icon="arrowUpRight">
                    Live site
                  </Button>
                )}
                {p.demo_video_url && (
                  <Button href={p.demo_video_url} target="_blank" rel="noreferrer" variant="outline" size="sm" icon="arrowUpRight">
                    Demo video
                  </Button>
                )}
                {!p.repo_url && !p.live_url && !p.demo_video_url && (
                  <p className="font-mono text-[0.78rem] text-subtle">No links yet.</p>
                )}
              </div>
            </Card>

            {p.tags.length > 0 && (
              <Card tone="paper" className="p-6">
                <div className="label-mono text-red">Built with</div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span key={t} className="rounded-full bg-fog px-2.5 py-1 font-mono text-[0.72rem]">
                      {t}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            <Card tone="ink" className="p-6">
              <div className="label-mono flex items-center gap-2 text-yellow">
                <Icon name="lock" size={13} strokeWidth={2.2} />
                Scores
              </div>
              <p className="mt-3 font-mono text-[0.78rem] leading-relaxed text-slab-fg/70">
                Hidden until the organizers publish results. Judges cannot see each other&apos;s ballots either.
              </p>
            </Card>

            {canEdit && (
              <Button href={`/projects/${p.id}/edit`} variant="ghost" size="sm">
                Edit this project
              </Button>
            )}
          </aside>
        </div>

        {p.status === 'submitted' && <CommentsSection project={p} />}

        <Button href="/projects" variant="outline" className="mt-12">
          Back to the projects
        </Button>
      </Container>
    </AppShell>
  )
}

/**
 * The community vote: applause, spent one per person.
 *
 * The count and the claim both come from the server on load, and every press
 * trusts the server's answer over its own optimism -- the API refuses your own
 * team, the event's judges, its organiser and admins, and the refusal message
 * is shown as written rather than guessed at here.
 */
function VotePanel({ project }: { project: Project }) {
  const { user } = useAuth()
  const [count, setCount] = useState(project.vote_count)
  const [mine, setMine] = useState(project.has_voted)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const press = async () => {
    setBusy(true)
    setError(null)
    try {
      const tally = mine ? await api.withdrawVote(project.id) : await api.castVote(project.id)
      setMine(!mine)
      setCount(tally.vote_count)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card tone="paper" className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="label-mono text-red">Community vote</div>
          <div className="mt-2 font-display text-[1.6rem] font-bold leading-none">
            {count}
            <span className="ml-2 font-mono text-[0.72rem] font-normal uppercase tracking-[0.05em] text-subtle">
              {count === 1 ? 'vote' : 'votes'}
            </span>
          </div>
        </div>
        {user ? (
          <Button size="sm" variant={mine ? 'outline' : 'primary'} disabled={busy} onClick={() => void press()}>
            {mine ? 'Voted' : 'Vote'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" href="/login">
            Sign in to vote
          </Button>
        )}
      </div>
      <p className="mt-3 font-mono text-[0.72rem] leading-relaxed text-subtle">
        One vote per person. The crowd&apos;s pick sits beside the judged results and never inside them.
      </p>
      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </Card>
  )
}

/**
 * Comments: public to read, an account to write, one reply level.
 *
 * Removal shows for the comment's author and for this event's organiser; the
 * server checks both for real. A removed comment keeps its slot with a
 * placeholder, so replies do not end up answering thin air.
 */
function CommentsSection({ project }: { project: Project }) {
  const { user } = useAuth()
  const comments = useApi(() => api.listComments(project.id), [project.id])
  const rows = comments.data ?? []
  const topLevel = rows.filter((c) => !c.parent_id)
  const repliesTo = (id: string) => rows.filter((c) => c.parent_id === id)

  // The backend lets this event's organiser OR an admin remove any comment.
  // Leaving admins out here hid the button from people the API would have
  // obeyed, which reads as a broken page rather than a policy.
  const canModerate = Boolean(
    user && (user.is_admin || (project.event_id && user.organiser_in.includes(project.event_id))),
  )

  return (
    <section className="mt-12">
      <h2 className="headline text-[1.4rem]">
        Comments
        {rows.length > 0 && (
          <span className="ml-2 align-middle font-mono text-[0.8rem] font-normal text-subtle">{rows.length}</span>
        )}
      </h2>

      <div className="mt-5 flex flex-col gap-3">
        {user ? (
          <CommentBox projectId={project.id} onPosted={() => comments.reload()} />
        ) : (
          <Card tone="paper" className="p-4">
            <p className="font-mono text-[0.8rem] text-muted">
              <a href="/login" className="font-bold text-blue underline underline-offset-2">
                Sign in
              </a>{' '}
              to join the conversation. Reading is free.
            </p>
          </Card>
        )}

        {comments.loading && !comments.data ? (
          <p className="label-mono text-subtle" role="status">
            Loading comments
          </p>
        ) : topLevel.length === 0 ? (
          <p className="font-mono text-[0.8rem] text-subtle">Nobody has said anything yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {topLevel.map((c) => (
              <li key={c.id}>
                <CommentCard
                  comment={c}
                  canRemove={Boolean(user && !c.removed && (canModerate || c.author?.id === user.id))}
                  canReply={Boolean(user)}
                  projectId={project.id}
                  onChanged={() => comments.reload()}
                />
                {repliesTo(c.id).length > 0 && (
                  <ul className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-4 sm:pl-6">
                    {repliesTo(c.id).map((r) => (
                      <li key={r.id}>
                        <CommentCard
                          comment={r}
                          canRemove={Boolean(user && !r.removed && (canModerate || r.author?.id === user.id))}
                          canReply={false}
                          projectId={project.id}
                          onChanged={() => comments.reload()}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function CommentBox({
  projectId,
  parentId,
  onPosted,
  compact,
}: {
  projectId: string
  parentId?: string
  onPosted: () => void
  compact?: boolean
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const post = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.addComment(projectId, body.trim(), parentId)
      setBody('')
      onPosted()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not post.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card tone="paper" className={compact ? 'p-3' : 'p-4'}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={compact ? 2 : 3}
        maxLength={2000}
        placeholder={parentId ? 'Write a reply' : 'Say something useful'}
        aria-label={parentId ? 'Reply' : 'New comment'}
        className="w-full resize-y rounded-btn bg-fog px-3 py-2 font-mono text-[0.85rem] outline-none ring-1 ring-transparent transition-shadow placeholder:text-subtle focus:bg-paper focus:ring-ink"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[0.68rem] text-subtle">{body.length}/2000</span>
        <Button size="sm" disabled={busy || !body.trim()} onClick={() => void post()}>
          {busy ? 'Posting' : parentId ? 'Reply' : 'Post comment'}
        </Button>
      </div>
      {error && (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      )}
    </Card>
  )
}

function CommentCard({
  comment,
  canRemove,
  canReply,
  projectId,
  onChanged,
}: {
  comment: ProjectComment
  canRemove: boolean
  canReply: boolean
  projectId: string
  onChanged: () => void
}) {
  const [replying, setReplying] = useState(false)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    setBusy(true)
    try {
      await api.removeComment(comment.id)
      onChanged()
    } catch {
      // The next reload tells the truth either way.
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card tone="paper" className={cn('p-4', comment.removed && 'opacity-60')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[0.78rem] font-bold">{comment.author?.name ?? '—'}</span>
        {comment.created_at && (
          <time dateTime={comment.created_at} className="font-mono text-[0.68rem] text-subtle">
            {new Date(comment.created_at).toLocaleString()}
          </time>
        )}
      </div>
      <p
        className={cn(
          'mt-2 whitespace-pre-line font-mono text-[0.85rem] leading-relaxed',
          comment.removed && 'italic text-subtle',
        )}
      >
        {comment.body}
      </p>
      {(canReply || canRemove) && !comment.removed && (
        <div className="mt-2 flex gap-2">
          {canReply && (
            <Button size="sm" variant="ghost" onClick={() => setReplying((v) => !v)}>
              {replying ? 'Cancel' : 'Reply'}
            </Button>
          )}
          {canRemove && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>
              Remove
            </Button>
          )}
        </div>
      )}
      {replying && (
        <div className="mt-3">
          <CommentBox
            projectId={projectId}
            parentId={comment.id}
            compact
            onPosted={() => {
              setReplying(false)
              onChanged()
            }}
          />
        </div>
      )}
    </Card>
  )
}

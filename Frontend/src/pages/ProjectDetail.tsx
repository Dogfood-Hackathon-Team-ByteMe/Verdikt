/**
 * ProjectDetail — /projects/:id. The public page for one submission.
 *
 * Renders the full T1 data model: thumbnail, gallery, demo video, links, tags
 * and the organizer's questions and answers. Scores are never shown here --
 * they stay hidden until results are published, which is the whole reason the
 * gallery is safe to make public during judging.
 */
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth/AuthProvider'
import { useApi } from '../hooks/useApi'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Badge, Button, Card, Container, Icon } from '../ui'

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

        <Button href="/projects" variant="outline" className="mt-12">
          Back to the projects
        </Button>
      </Container>
    </AppShell>
  )
}

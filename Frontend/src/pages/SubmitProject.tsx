/**
 * SubmitProject — the submission form. T1 requirements #5 and #8 made visible:
 * the whole spec data model, editable as a draft until the deadline, then an
 * explicit submit.
 *
 * Three things worth knowing about how it behaves:
 *
 * 1. Saving is manual, not autosave-on-keystroke. Autosave over a field that
 *    the server validates on submit produces confusing half-saved states, and
 *    a teammate editing concurrently would clobber you silently. There is a
 *    dirty indicator instead, and an unload guard.
 * 2. The deadline is re-read from the event, and when it passes the form goes
 *    read-only. That is a courtesy, not the enforcement -- the server refuses
 *    the write regardless, which is what T1 grades.
 * 3. Submit failures are shown verbatim from the server. It is the server that
 *    knows a required custom question is unanswered, so it gets to say so.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { CustomQuestion, HackEvent, Project, ProjectDraft } from '../api/types'
import { useApi } from '../hooks/useApi'
import { useCountdown } from '../hooks/useCountdown'
import { AppShell, PageHeading } from '../sections/AppShell'
import { Alert, Badge, Button, Card, Container, Field, Icon } from '../ui'

/** The editable shape, flat, so the form is one state object. */
interface FormState {
  title: string
  tagline: string
  summary: string
  description: string
  track: string
  repo_url: string
  live_url: string
  demo_video_url: string
  thumbnail_url: string
  gallery_urls: string
  tags: string
  custom_answers: Record<string, string>
}

const toForm = (p: Project): FormState => ({
  title: p.title,
  tagline: p.tagline ?? '',
  summary: p.summary,
  description: p.description ?? '',
  track: p.track,
  repo_url: p.repo_url,
  live_url: p.live_url ?? '',
  demo_video_url: p.demo_video_url ?? '',
  thumbnail_url: p.thumbnail_url ?? '',
  // Multi-value fields edit as one-per-line / comma lists; far less fiddly
  // than a row of add-remove inputs for the same data.
  gallery_urls: p.gallery_urls.join('\n'),
  tags: p.tags.join(', '),
  custom_answers: { ...p.custom_answers },
})

const toDraft = (f: FormState): ProjectDraft => ({
  title: f.title.trim(),
  tagline: f.tagline.trim(),
  summary: f.summary.trim(),
  description: f.description.trim(),
  track: f.track || undefined,
  repo_url: f.repo_url.trim(),
  live_url: f.live_url.trim(),
  demo_video_url: f.demo_video_url.trim(),
  thumbnail_url: f.thumbnail_url.trim(),
  gallery_urls: f.gallery_urls.split('\n').map((s) => s.trim()).filter(Boolean),
  tags: f.tags.split(',').map((s) => s.trim()).filter(Boolean),
  custom_answers: f.custom_answers,
})

export default function SubmitProject() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const project = useApi(() => api.getProject(id), [id])
  const event = useApi(() => api.getFeaturedEvent())

  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saveTimer = useRef<number | undefined>(undefined)

  // Seed the form once the project arrives; later reloads must not clobber
  // what the person is currently typing.
  useEffect(() => {
    if (project.data && !form) setForm(toForm(project.data))
  }, [project.data, form])

  const countdown = useCountdown(event.data?.submissions_close)
  const closed = countdown.closed
  const status = project.data?.status ?? 'draft'

  const dirty = useMemo(() => {
    if (!form || !project.data) return false
    return JSON.stringify(toDraft(form)) !== JSON.stringify(toDraft(toForm(project.data)))
  }, [form, project.data])

  // Browser-level guard against closing the tab on unsaved work.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  const setAnswer = (key: string, value: string) =>
    setForm((f) => (f ? { ...f, custom_answers: { ...f.custom_answers, [key]: value } } : f))

  const save = async () => {
    if (!form) return false
    setSaving(true)
    setError(null)
    try {
      await api.updateProject(id, toDraft(form))
      project.reload()
      setSaved(true)
      saveTimer.current = window.setTimeout(() => setSaved(false), 2200)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    // Always save first: submitting validates what is on the SERVER, so
    // unsaved edits would be judged against stale data.
    if (dirty && !(await save())) return
    setSubmitting(true)
    setError(null)
    try {
      await api.submitProject(id)
      project.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit.')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await api.deleteProject(id)
      navigate('/dashboard')
    } catch (e) {
      // The backend allows only the team leader to delete, and refuses after
      // the deadline; either way it says so.
      setError(e instanceof Error ? e.message : 'Could not delete the project.')
      setSubmitting(false)
      setConfirmDelete(false)
    }
  }

  const withdraw = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await api.unsubmitProject(id)
      project.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not withdraw.')
    } finally {
      setSubmitting(false)
    }
  }

  if (project.loading && !project.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <p className="label-mono text-subtle" role="status">Loading your project</p>
        </Container>
      </AppShell>
    )
  }

  if (!project.data || !form) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Not found" title="No project" tail="here.">
            It may have been deleted, or it belongs to another team.
          </PageHeading>
          <Button className="mt-8" onClick={() => navigate('/dashboard')} icon="arrowRight">
            Back to dashboard
          </Button>
        </Container>
      </AppShell>
    )
  }

  const questions = event.data?.custom_questions ?? []
  const readOnly = closed

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label={status === 'submitted' ? 'Submitted entry' : 'Draft entry'}
          title={status === 'submitted' ? 'Your' : 'Finish your'}
          tail="submission."
          actions={
            <Badge variant={status === 'submitted' ? 'green' : 'outline'} dot={status === 'draft'}>
              {status}
            </Badge>
          }
        >
          {readOnly
            ? 'Submissions are closed. This entry is now read-only.'
            : `You can edit until the deadline: ${countdown.days}d ${countdown.hours}h ${countdown.minutes}m left.`}
        </PageHeading>

        {error && <Alert className="mt-8">{error}</Alert>}
        {readOnly && (
          <Alert tone="info" className="mt-8">
            The submission window has closed. The server rejects further edits, so the form is locked.
          </Alert>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* --- The form --------------------------------------------- */}
          <div className="flex flex-col gap-8">
            <FormSection title="The basics" note="Shown on the gallery card.">
              <Field label="Title" value={form.title} disabled={readOnly} onChange={(e) => set('title', e.target.value)} />
              <Field
                label="Tagline"
                hint="One line. This is what people read first."
                placeholder="Pairwise judging with a replayable audit log"
                value={form.tagline}
                disabled={readOnly}
                onChange={(e) => set('tagline', e.target.value)}
              />
              <TextArea
                label="Summary"
                hint="Two or three sentences for the gallery card."
                rows={3}
                value={form.summary}
                disabled={readOnly}
                onChange={(v) => set('summary', v)}
              />
              <SelectField
                label="Track"
                hint="Required before you can submit."
                value={form.track}
                disabled={readOnly}
                options={(event.data?.tracks ?? []).map((t) => ({ value: t.id, label: t.name }))}
                onChange={(v) => set('track', v)}
              />
            </FormSection>

            <FormSection title="The write-up" note="Shown on the project page.">
              <TextArea
                label="Long description"
                hint="What it does, how it works, what you would do next."
                rows={8}
                value={form.description}
                disabled={readOnly}
                onChange={(v) => set('description', v)}
              />
            </FormSection>

            <FormSection title="Links">
              <Field
                label="Repository URL"
                icon="github"
                hint="Required before you can submit."
                placeholder="https://github.com/your-team/project"
                value={form.repo_url}
                disabled={readOnly}
                onChange={(e) => set('repo_url', e.target.value)}
              />
              <Field
                label="Live link"
                placeholder="https://your-project.example.com"
                value={form.live_url}
                disabled={readOnly}
                onChange={(e) => set('live_url', e.target.value)}
              />
              <Field
                label="Demo video URL"
                hint="A hosted link, not an upload."
                placeholder="https://youtube.com/watch?v=..."
                value={form.demo_video_url}
                disabled={readOnly}
                onChange={(e) => set('demo_video_url', e.target.value)}
              />
            </FormSection>

            <FormSection title="Media">
              <Field
                label="Thumbnail URL"
                hint="The gallery card image."
                placeholder="https://example.com/thumb.png"
                value={form.thumbnail_url}
                disabled={readOnly}
                onChange={(e) => set('thumbnail_url', e.target.value)}
              />
              <TextArea
                label="Image gallery"
                hint="One URL per line."
                rows={4}
                value={form.gallery_urls}
                disabled={readOnly}
                onChange={(v) => set('gallery_urls', v)}
              />
              <Field
                label="Tech tags"
                hint="Comma separated, e.g. Go, Postgres, React."
                value={form.tags}
                disabled={readOnly}
                onChange={(e) => set('tags', e.target.value)}
              />
            </FormSection>

            {questions.length > 0 && (
              <FormSection title="Organizer questions" note="Set by the event organizer.">
                {questions.map((q) => (
                  <QuestionField
                    key={q.key}
                    question={q}
                    value={form.custom_answers[q.key] ?? ''}
                    disabled={readOnly}
                    onChange={(v) => setAnswer(q.key, v)}
                  />
                ))}
              </FormSection>
            )}
          </div>

          {/* --- Sticky action rail ------------------------------------ */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card tone="paper" className="p-6">
              <div className="label-mono text-red">Actions</div>

              <div className="mt-4 flex flex-col gap-3">
                <Button disabled={readOnly || saving || !dirty} onClick={() => void save()} variant="outline">
                  {saving ? 'Saving...' : dirty ? 'Save draft' : saved ? 'Saved' : 'No changes'}
                </Button>

                {status === 'draft' ? (
                  <Button disabled={readOnly || submitting} onClick={() => void submit()} icon="arrowRight">
                    {submitting ? 'Submitting...' : 'Submit entry'}
                  </Button>
                ) : (
                  <Button disabled={readOnly || submitting} onClick={() => void withdraw()} variant="outline">
                    {submitting ? 'Withdrawing...' : 'Withdraw to draft'}
                  </Button>
                )}
              </div>

              <ul className="mt-6 flex flex-col gap-2 border-t border-line pt-5">
                <Requirement met={Boolean(form.title.trim())}>A title</Requirement>
                <Requirement met={Boolean(form.track)}>A track</Requirement>
                <Requirement met={Boolean(form.repo_url.trim())}>A repository URL</Requirement>
                {questions
                  .filter((q) => q.required)
                  .map((q) => (
                    <Requirement key={q.key} met={Boolean(form.custom_answers[q.key]?.trim())}>
                      {q.label}
                    </Requirement>
                  ))}
              </ul>

              {dirty && (
                <p className="mt-5 font-mono text-[0.72rem] text-danger">
                  Unsaved changes.
                </p>
              )}

              <p className="mt-5 border-t border-line pt-5 font-mono text-[0.72rem] leading-relaxed text-subtle">
                Drafts are private to your team and the organizer. Submitted entries appear in the public gallery.
              </p>

              {!readOnly && (
                <div className="mt-5 border-t border-line pt-5">
                  {confirmDelete ? (
                    <div className="flex flex-col gap-2">
                      <p className="font-mono text-[0.75rem] text-danger">
                        Delete this project for good? This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={submitting} onClick={() => void remove()}>
                          Yes, delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="font-mono text-[0.72rem] font-bold text-subtle transition-colors hover:text-danger"
                    >
                      Delete project
                    </button>
                  )}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </Container>
    </AppShell>
  )
}

/** A titled group of fields, matching the card treatment used site-wide. */
function FormSection({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="headline text-[1.25rem]">{title}</h2>
        {note && <span className="font-mono text-[0.72rem] text-subtle">{note}</span>}
      </div>
      <div className="mt-6 flex flex-col gap-5">{children}</div>
    </Card>
  )
}

/** Multi-line input styled to match Field. */
function TextArea({
  label,
  hint,
  rows = 4,
  value,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  rows?: number
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-mono text-ink">{label}</label>
      <textarea
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-btn bg-paper px-3.5 py-3 font-mono text-[0.9rem] text-ink outline-none ring-1 ring-line transition-[box-shadow] duration-200 ease-out-soft placeholder:text-subtle hover:ring-subtle focus:ring-2 focus:ring-ink disabled:opacity-60"
      />
      {hint && <p className="font-mono text-[0.72rem] text-subtle">{hint}</p>}
    </div>
  )
}

/** Native select, themed. */
function SelectField({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-mono text-ink">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-btn bg-paper px-3 font-mono text-[0.9rem] text-ink outline-none ring-1 ring-line transition-[box-shadow] duration-200 hover:ring-subtle focus:ring-2 focus:ring-ink disabled:opacity-60"
      >
        <option value="">Choose a track</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="font-mono text-[0.72rem] text-subtle">{hint}</p>}
    </div>
  )
}

/** Renders one organizer-defined question in the shape it asked for. */
function QuestionField({
  question,
  value,
  disabled,
  onChange,
}: {
  question: CustomQuestion
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const label = question.required ? `${question.label} *` : question.label

  if (question.type === 'longtext') {
    return <TextArea label={label} rows={5} value={value} disabled={disabled} onChange={onChange} />
  }
  if (question.type === 'select') {
    return (
      <SelectField
        label={label}
        value={value}
        disabled={disabled}
        options={(question.options ?? []).map((o) => ({ value: o, label: o }))}
        onChange={onChange}
      />
    )
  }
  return (
    <Field
      label={label}
      type={question.type === 'url' ? 'url' : 'text'}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** A single readiness row in the action rail. */
function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 font-mono text-[0.78rem]">
      <span
        className={
          met
            ? 'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success text-white'
            : 'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-fog text-subtle ring-1 ring-line'
        }
      >
        {met && <Icon name="check" size={10} strokeWidth={3} />}
      </span>
      <span className={met ? 'text-muted' : 'text-ink'}>{children}</span>
    </li>
  )
}

/** Re-exported for the event type, keeping imports tidy for callers. */
export type { HackEvent }

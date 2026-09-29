/**
 * Gallery — the public, no-login project list. Debounced search + track filter,
 * both served through the API layer, with a detail modal per project.
 * Scores are intentionally hidden until results are published.
 */
import { useEffect, useState } from 'react'
import { api, usingMockData, type Project, type Track } from '../api'
import { useApi } from '../hooks/useApi'
import { Badge, Button, Card, Chip, Dialog, Reveal, SearchField, Section, SectionHeading, cn } from '../ui'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) + ' UTC'

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}


/**
 * Entries cycle through the four block colours rather than all wearing one.
 * A wall of identical cards reads as a table; four rotating colours let the eye
 * find its place in the grid, and they are the same four the rest of the kit
 * uses, so nothing new is invented here.
 *
 * No per-tone brightness filter in dark mode: index.css already swaps in
 * lighter blue/red/green for dark, so filtering on top of that lightened the
 * cards twice and left them looking neon with washed-out white text. The dark
 * palette is the correction; the cards just use it.
 */
type EntryTone = 'blue' | 'yellow' | 'red' | 'green'

const TONE_CYCLE: EntryTone[] = ['blue', 'yellow', 'red', 'green']

const TONE_STYLES: Record<EntryTone, {
  card: string
  chip: string
  meta: string
  body: string
  tag: string
  bubble: string
  liveDot: string
}> = {
  blue: {
    card: '',
    chip: 'bg-white/20 text-white',
    meta: 'text-white/75',
    body: 'text-white/85',
    tag: 'bg-white/15 text-white',
    bubble: 'bg-white text-blue',
    liveDot: 'bg-white',
  },
  yellow: {
    card: '',
    chip: 'bg-on-bright/12 text-on-bright',
    meta: 'text-on-bright/70',
    body: 'text-on-bright/85',
    tag: 'bg-on-bright/12 text-on-bright',
    bubble: 'bg-blue text-white',
    liveDot: 'bg-green',
  },
  red: {
    card: '',
    chip: 'bg-white/20 text-white',
    meta: 'text-white/75',
    body: 'text-white/85',
    tag: 'bg-white/15 text-white',
    bubble: 'bg-white text-red',
    liveDot: 'bg-white',
  },
  green: {
    card: '',
    chip: 'bg-white/20 text-white',
    meta: 'text-white/75',
    body: 'text-white/85',
    tag: 'bg-white/15 text-white',
    bubble: 'bg-white text-green',
    liveDot: 'bg-white',
  },
}

export function Gallery({ tracks, eventId }: { tracks: Track[]; eventId?: string }) {
  const [q, setQ] = useState('')
  const [track, setTrack] = useState('')
  const dq = useDebounced(q)
  // `eventId` narrows the list to one event, which is how /projects?event=<id>
  // arrives from the Events tab. Undefined means every event.
  const { data, loading, error } = useApi(
    () => api.listProjects({ q: dq, track: track || undefined, event_id: eventId }),
    [dq, track, eventId],
  )
  const all = useApi(() => api.listProjects({ event_id: eventId }), [eventId])
  const [open, setOpen] = useState<Project | null>(null)
  /**
   * Newest first, or most-voted first. Sorted here rather than server-side
   * because the list is already in hand and the API's own order (newest) is
   * the one most pages want -- adding a sort parameter for one control would
   * push ranking logic into three more places.
   */
  const [sort, setSort] = useState<'recent' | 'votes'>('recent')
  const shown =
    sort === 'votes' ? [...(data ?? [])].sort((a, b) => b.vote_count - a.vote_count) : (data ?? [])
  /**
   * The track's name. `tracks` only covers the event whose chips are on
   * screen, so a project from another event would previously render its raw
   * Mongo id -- the populated `track_name` off the project itself is the
   * reliable source, and the lookup is only a fallback.
   */
  const trackName = (p: { track: string; track_name?: string }) =>
    p.track_name || tracks.find((t) => t.id === p.track)?.name || 'Track'
  const countFor = (id: string) => (all.data ?? []).filter((p) => !id || p.track === id).length

  return (
    <Section id="gallery">
      <SectionHeading label="Public gallery" title="Browse every entry." tail="No account needed.">
        Scores stay hidden until the organizers publish results.
      </SectionHeading>

      <Reveal className="mt-12 flex flex-col items-center gap-5">
        <SearchField id="gallery-search" label="Search entries" placeholder="Search by title, team or stack" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-lg" />
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Filter by track">
          {[{ id: '', name: 'All' }, ...tracks].map((t) => (
            <Chip key={t.id || 'all'} active={track === t.id} onClick={() => setTrack(t.id)} count={all.data ? countFor(t.id) : undefined}>
              {t.name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Sort entries">
          <Chip active={sort === 'recent'} onClick={() => setSort('recent')}>
            Newest
          </Chip>
          <Chip active={sort === 'votes'} onClick={() => setSort('votes')}>
            Most voted
          </Chip>
        </div>
        <div className="flex items-center gap-3 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-subtle" aria-live="polite">
          {error ? 'Could not load entries. Check the API is running, then refresh.' : loading && !data ? 'Loading…' : `${data?.length ?? 0} entries`}
          {usingMockData && <Badge variant="outline">Sample data</Badge>}
        </div>
      </Reveal>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((p, i) => {
          const tone = TONE_CYCLE[i % TONE_CYCLE.length]
          const t = TONE_STYLES[tone]
          return (
          <li key={p.id} className="animate-[rise_0.6s_var(--ease-out-soft)_both]" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Card tone={tone} tilt className={cn('h-full', t.card)}>
              <button type="button" onClick={() => setOpen(p)} className="flex h-full w-full flex-col p-5 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('rounded-full px-2.5 py-1 text-[0.72rem]', t.chip)}>{trackName(p)}</span>
                  <span className={cn('flex items-center gap-1.5 font-mono text-[0.64rem] uppercase tracking-[0.1em]', t.meta)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', p.submitted_at ? t.liveDot : 'opacity-50 ' + t.liveDot)} />
                    {p.submitted_at ? 'Submitted' : 'Draft'}
                  </span>
                </div>
                <h3 className="mt-6 text-[1.45rem] font-medium leading-tight tracking-[-0.04em]">{p.title}</h3>
                <div className={cn('flex items-center justify-between gap-2 text-sm', t.meta)}>
                  <span>{p.team}</span>
                  {/* Community applause, shown once it exists. The judged
                      score never appears on a card; this number is public. */}
                  {p.vote_count > 0 && (
                    <span className="flex items-center gap-1 font-mono text-[0.68rem]" title={`${p.vote_count} community votes`}>
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                        <path d="M12 4l8 14H4z" />
                      </svg>
                      {p.vote_count}
                    </span>
                  )}
                </div>
                <p className={cn('mt-3 flex-1 text-sm', t.body)}>{p.summary}</p>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {p.tags?.map((tag) => (
                      <span key={tag} className={cn('rounded-full px-2 py-0.5 font-mono text-[0.64rem]', t.tag)}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform duration-500 ease-spring group-hover/tilt:rotate-45', t.bubble)} aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M7 17L17 7M9 7h8v8" />
                    </svg>
                  </span>
                </div>
              </button>
            </Card>
          </li>
          )
        })}
      </ul>
      {data && data.length === 0 && (
        <div className="mx-auto mt-10 max-w-md rounded-card bg-fog p-8 text-center">
          <p className="text-muted">No entries match “{q}”. Try a stack like Rust, or pick All tracks.</p>
          <Button variant="dark" size="sm" className="mt-4" onClick={() => { setQ(''); setTrack('') }}>
            Clear filters
          </Button>
        </div>
      )}

      <Dialog open={!!open} onClose={() => setOpen(null)} label={open?.title ?? 'Project'}>
        {open && (
          <div className="p-6 sm:p-8">
            <span className="rounded-full bg-blue-mist px-2.5 py-1 text-[0.72rem] text-blue-ink">{trackName(open)}</span>
            <h3 className="mt-5 text-[2.2rem] font-medium leading-none tracking-[-0.05em]">{open.title}</h3>
            <div className="mt-2 text-muted">by {open.team}</div>
            <p className="mt-5 text-[1.02rem]">{open.summary}</p>
            <dl className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-[16px] bg-fog p-4">
                <dt className="font-mono text-[0.64rem] uppercase tracking-[0.12em] text-subtle">Status</dt>
                <dd className="mt-1 text-sm">{open.submitted_at ? `Submitted ${when(open.submitted_at)}` : 'Draft, still editable'}</dd>
              </div>
              <div className="rounded-[16px] bg-fog p-4">
                <dt className="font-mono text-[0.64rem] uppercase tracking-[0.12em] text-subtle">Score</dt>
                <dd className="mt-1 flex items-center gap-2 text-sm">
                  <span className="h-4 w-10 rounded bg-ink" aria-hidden="true" /> Hidden until results
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button href={`/projects/${open.id}`} icon="arrowRight">
                Open full page
              </Button>
              {open.repo_url && (
                <Button href={open.repo_url} target="_blank" rel="noreferrer" variant="outline" icon="arrowUpRight">
                  Repository
                </Button>
              )}
              <Button variant="ghost" onClick={() => setOpen(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Section>
  )
}

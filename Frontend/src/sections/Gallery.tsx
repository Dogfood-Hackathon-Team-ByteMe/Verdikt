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


export function Gallery({ tracks }: { tracks: Track[] }) {
  const [q, setQ] = useState('')
  const [track, setTrack] = useState('')
  const dq = useDebounced(q)
  const { data, loading, error } = useApi(() => api.listProjects({ q: dq, track: track || undefined }), [dq, track])
  const all = useApi(() => api.listProjects())
  const [open, setOpen] = useState<Project | null>(null)
  const trackName = (id: string) => tracks.find((t) => t.id === id)?.name ?? id
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
        <div className="flex items-center gap-3 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-subtle" aria-live="polite">
          {error ? 'Could not load entries. Check the API is running, then refresh.' : loading && !data ? 'Loading…' : `${data?.length ?? 0} entries`}
          {usingMockData && <Badge variant="outline">Sample data</Badge>}
        </div>
      </Reveal>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(data ?? []).map((p, i) => (
          <li key={p.id} className="animate-[rise_0.6s_var(--ease-out-soft)_both]" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Card tone="paper" tilt className="h-full ring-1 ring-line">
              <button type="button" onClick={() => setOpen(p)} className="flex h-full w-full flex-col p-5 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-blue-mist px-2.5 py-1 text-[0.72rem] text-blue-ink">{trackName(p.track)}</span>
                  <span className={cn('flex items-center gap-1.5 font-mono text-[0.64rem] uppercase tracking-[0.1em]', p.submitted_at ? 'text-success' : 'text-subtle')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', p.submitted_at ? 'bg-success' : 'bg-subtle')} />
                    {p.submitted_at ? 'Submitted' : 'Draft'}
                  </span>
                </div>
                <h3 className="mt-6 text-[1.45rem] font-medium leading-tight tracking-[-0.04em]">{p.title}</h3>
                <div className="text-sm text-muted">{p.team}</div>
                <p className="mt-3 flex-1 text-sm text-muted">{p.summary}</p>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {p.tags?.map((t) => (
                      <span key={t} className="rounded-full bg-fog px-2 py-0.5 font-mono text-[0.64rem]">
                        {t}
                      </span>
                    ))}
                  </div>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-yellow transition-transform duration-500 ease-spring group-hover/tilt:rotate-45" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M7 17L17 7M9 7h8v8" />
                    </svg>
                  </span>
                </div>
              </button>
            </Card>
          </li>
        ))}
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
            <span className="rounded-full bg-blue-mist px-2.5 py-1 text-[0.72rem] text-blue-ink">{trackName(open.track)}</span>
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

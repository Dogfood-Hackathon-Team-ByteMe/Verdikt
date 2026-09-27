/**
 * LiveBoard — the hero illustration: a small live leaderboard card, standing
 * in for what Verdikt actually does rather than an abstract tier diagram.
 *
 * Three things make it read as "live" rather than a static screenshot:
 *  - the card tilts toward the pointer (Card's built-in `tilt`)
 *  - one row's score quietly drifts every couple of seconds, as if a ballot
 *    just landed, and the bar animates to match
 *  - hovering a row lifts it and swaps its number for the exact score, the
 *    same raw-vs-precise distinction the real standings table makes
 *
 * Ranks are recomputed from score on every render, so a drift can reorder the
 * board -- the leaderboard reshuffling itself is the point.
 */
import { useEffect, useRef, useState } from 'react'
import { Badge, Card, Icon, cn } from '../ui'

interface Row {
  code: string
  track: string
  color: string
  score: number
}

const INITIAL: Row[] = [
  { code: 'Quorum', track: 'Judging Engines', color: 'var(--color-yellow)', score: 91 },
  { code: 'Blindfold', track: 'Judging Engines', color: 'var(--color-blue)', score: 87 },
  { code: 'Diffscope', track: 'Developer Tools', color: 'var(--color-red)', score: 82 },
  { code: 'Kettle', track: 'Infrastructure', color: 'var(--color-green)', score: 76 },
]

const clamp = (n: number) => Math.min(99, Math.max(52, n))

export function LiveBoard({ className }: { className?: string }) {
  const [rows, setRows] = useState(INITIAL)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pulse, setPulse] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)

  // Every so often, one entry gets a new ballot: its score drifts a little and
  // the board re-sorts around it. Paused while a row is being inspected, so
  // hovering to read a number doesn't get interrupted by it changing.
  useEffect(() => {
    timer.current = setInterval(() => {
      if (hovered) return
      setRows((prev) => {
        const i = Math.floor(Math.random() * prev.length)
        const next = [...prev]
        next[i] = { ...next[i], score: clamp(next[i].score + (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 5)) }
        setPulse(next[i].code)
        return next
      })
    }, 2200)
    return () => clearInterval(timer.current)
  }, [hovered])

  useEffect(() => {
    if (!pulse) return
    const t = setTimeout(() => setPulse(null), 900)
    return () => clearTimeout(t)
  }, [pulse])

  const ranked = [...rows].sort((a, b) => b.score - a.score)
  const top = ranked[0]?.score ?? 100

  return (
    <Card tone="paper" tilt className={cn('p-6 sm:p-7', className)}>
      <div className="flex items-center justify-between">
        <Badge variant="green" dot>
          Live standings
        </Badge>
        <span className="flex items-center gap-1.5 font-mono text-[0.68rem] text-subtle">
          <Icon name="chart" size={13} strokeWidth={2.2} />
          normalized
        </span>
      </div>

      <ul className="mt-5 flex flex-col gap-2.5">
        {ranked.map((row, i) => {
          const isHovered = hovered === row.code
          const width = `${Math.max(8, (row.score / top) * 100)}%`
          return (
            <li key={row.code}>
              <button
                type="button"
                onMouseEnter={() => setHovered(row.code)}
                onMouseLeave={() => setHovered((h) => (h === row.code ? null : h))}
                onFocus={() => setHovered(row.code)}
                onBlur={() => setHovered((h) => (h === row.code ? null : h))}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-btn px-2.5 py-2 text-left transition-[transform,background-color] duration-300 ease-out-soft',
                  isHovered ? '-translate-y-0.5 bg-fog' : hovered ? 'opacity-55' : '',
                )}
              >
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[0.68rem] font-bold tnum transition-colors duration-300',
                    i === 0 ? 'bg-yellow text-on-bright' : 'bg-fog text-ink',
                  )}
                >
                  {i + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[0.82rem] font-bold text-ink">{row.code}</span>
                    <span className="tnum shrink-0 font-mono text-[0.78rem] font-bold text-ink">
                      {isHovered ? row.score.toFixed(1) : Math.round(row.score)}%
                    </span>
                  </span>
                  <span className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-fog">
                    <span
                      className={cn(
                        'block h-full rounded-full transition-[width] duration-700 ease-out-soft',
                        row.code === pulse && 'animate-landed',
                      )}
                      style={{ width, background: row.color }}
                    />
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-5 flex items-center gap-1.5 border-t border-line pt-4 font-mono text-[0.68rem] text-subtle">
        <Icon name="bolt" size={12} strokeWidth={2.4} />
        Recomputed from every ballot, on every read.
      </p>
    </Card>
  )
}

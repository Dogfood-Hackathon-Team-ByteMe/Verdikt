/**
 * Scoring — the weighted rubric plus an interactive demo of score normalization.
 * The "Normalize" button rescales three judges' raw scores (one harsh, one
 * generous) so their averages line up; the dots animate to their new positions.
 */
import { useState } from 'react'
import { Button, Card, Reveal, Section, SectionHeading } from '../ui'

// Three judges score the same six projects. One is harsh, one is generous.
const JUDGES = [
  { id: 'J-07', note: 'harsh', raw: [1.5, 2.0, 2.5, 1.8, 2.2, 2.7] },
  { id: 'J-19', note: 'middle', raw: [2.6, 3.1, 3.4, 2.8, 3.0, 3.5] },
  { id: 'J-23', note: 'generous', raw: [3.8, 4.4, 4.6, 4.0, 4.2, 4.9] },
]
// Project dot colours, from the theme so they stay visible in both modes.
const DOTS = ['var(--color-ink)', 'var(--color-blue)', 'var(--color-yellow)', 'var(--color-blue-soft)', 'var(--color-red)', 'var(--color-green)']

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
const sd = (a: number[]) => Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / a.length)
const normalize = (a: number[]) => a.map((x) => Math.min(5, Math.max(1, 3 + ((x - mean(a)) / (sd(a) || 1)) * 0.6)))

const W = 560
const X0 = 84
const X1 = 540
const ROW = 58
const x = (v: number) => X0 + ((v - 1) / 4) * (X1 - X0)

export function Scoring() {
  const [on, setOn] = useState(false)
  const rows = JUDGES.map((j) => ({ ...j, vals: on ? normalize(j.raw) : j.raw }))
  const means = rows.map((r) => mean(r.vals))
  const gap = Math.max(...means) - Math.min(...means)
  const H = 24 + ROW * JUDGES.length + 28

  return (
    <Section id="scoring">
      <SectionHeading label="Scoring" title="Weighted by the organizer." tail="Fair across every judge." />

      <div className="mt-14">
        <Reveal className="min-w-0" delay={100}>
          <Card tone="fog" className="flex h-full flex-col p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-[1.5rem] font-medium tracking-[-0.04em]">A harsh judge shouldn’t sink you.</h3>
                <p className="mt-1 max-w-md text-sm text-muted">Each judge is rescaled against their own habits before scores are combined.</p>
              </div>
              <Button variant="dark" size="sm" onClick={() => setOn((v) => !v)} aria-pressed={on}>
                {on ? 'Show raw' : 'Normalize'}
              </Button>
            </div>

            <div className="mt-6 overflow-x-auto">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[440px]" role="img" aria-label={on ? 'Normalized: judge averages line up' : 'Raw: judge averages are far apart'}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <g key={v}>
                    <line x1={x(v)} x2={x(v)} y1={14} y2={H - 24} stroke="var(--color-line)" />
                    <text x={x(v)} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--color-subtle)" fontFamily="Space Mono, monospace">
                      {v}
                    </text>
                  </g>
                ))}
                {rows.map((r, ri) => {
                  const cy = 24 + ri * ROW + ROW / 2
                  return (
                    <g key={r.id}>
                      <text x={0} y={cy - 3} fontSize="13" fontWeight="600" fill="var(--color-ink)" fontFamily="Space Mono, monospace">
                        {r.id}
                      </text>
                      <text x={0} y={cy + 13} fontSize="11" fill="var(--color-subtle)" fontFamily="Space Mono, monospace">
                        {r.note}
                      </text>
                      <line x1={X0} x2={X1} y1={cy} y2={cy} stroke="var(--color-line)" strokeDasharray="2 4" />
                      <rect x={-12} y={cy - 16} width={24} height={32} rx={12} fill="var(--color-yellow)" style={{ transform: `translateX(${x(means[ri])}px)`, transition: 'transform 0.9s cubic-bezier(0.34,1.56,0.64,1)' }} />
                      {r.vals.map((v, pi) => (
                        <circle
                          key={pi}
                          cx={0}
                          cy={cy}
                          r={7}
                          fill={DOTS[pi]}
                          stroke="var(--color-fog)"
                          strokeWidth="2"
                          style={{ transform: `translateX(${x(v)}px)`, transition: `transform 0.9s cubic-bezier(0.34,1.56,0.64,1) ${pi * 45}ms` }}
                        />
                      ))}
                    </g>
                  )
                })}
              </svg>
            </div>

            <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
              <div>
                <div className="text-sm text-muted">Gap between judge averages</div>
                <div className="tnum text-[2.4rem] leading-none tracking-[-0.05em]">{gap.toFixed(2)}</div>
              </div>
              <p className="max-w-[16rem] text-right font-mono text-[0.66rem] uppercase tracking-[0.1em] text-subtle">Dots are projects. Lime pill is each judge’s average.</p>
            </div>
          </Card>
        </Reveal>
      </div>
    </Section>
  )
}

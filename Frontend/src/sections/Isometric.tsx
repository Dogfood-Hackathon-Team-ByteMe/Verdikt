/**
 * Isometric — the hero illustration: the four tiers drawn as stacked 3D blocks
 * in the primary colours (toy-brick art, but it's Verdikt's own tier ladder).
 * Pure SVG on an isometric grid.
 *
 * Interactive, not just decorative: hovering (or focusing) a tier lifts it,
 * dims the others and names what that tier is, so the stack reads as the
 * product's own ladder rather than a logo. The shipped tiers sit under a green
 * "shipped" chip; the rest are outlined. Status comes from content/dogfood.ts,
 * the same source the Tiers section uses, so the hero cannot claim a tier the
 * page below says is unbuilt.
 */
import { useState } from 'react'
import { tiers } from '../content/dogfood'
import { cn } from '../ui'

// Isometric projection: map a 3D point (x, y, z) in block units to 2D screen px.
const U = 34 // one block unit, in pixels
const iso = (x: number, y: number, z: number) => ({
  sx: (x - y) * U * 0.98,
  sy: (x + y) * U * 0.5 - z * U,
})

interface Tier {
  id: string
  x: number
  y: number
  z: number
  w: number
  d: number
  h: number
  color: string
  dark: string
  darker: string
  labelAt?: 'corner' | 'center'
}

/** Base to apex. Each tier steps in by ~0.6 units and up by its own height. */
const BLOCKS: Tier[] = [
  { id: 'T1', x: -2, y: -2, z: 0, w: 4, d: 4, h: 0.7, color: '#ff4b3e', dark: '#d63a2e', darker: '#b02a20' },
  { id: 'T2', x: -1.4, y: -1.4, z: 0.7, w: 2.8, d: 2.8, h: 0.7, color: '#ffd23f', dark: '#e6b420', darker: '#c99a10' },
  { id: 'T3', x: -0.85, y: -0.85, z: 1.4, w: 1.7, d: 1.7, h: 0.7, color: '#1f3ae0', dark: '#1a2fbd', darker: '#12237f' },
  { id: 'T4', x: -0.4, y: -0.4, z: 2.1, w: 0.8, d: 0.8, h: 0.7, color: '#1fa463', dark: '#178a52', darker: '#0f6e40', labelAt: 'center' },
]

/** One extruded cuboid: a lit top face plus two darker sides. */
function Block({
  tier,
  active,
  dimmed,
  onEnter,
  onLeave,
}: {
  tier: Tier
  active: boolean
  dimmed: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  const { x, y, z, w, d, h, color, dark, darker, id, labelAt = 'corner' } = tier
  const p = (px: number, py: number, pz: number) => {
    const { sx, sy } = iso(px, py, pz)
    return `${sx},${sy}`
  }
  const top = `${p(x, y, z + h)} ${p(x + w, y, z + h)} ${p(x + w, y + d, z + h)} ${p(x, y + d, z + h)}`
  const left = `${p(x, y + d, z)} ${p(x, y + d, z + h)} ${p(x + w, y + d, z + h)} ${p(x + w, y + d, z)}`
  const right = `${p(x + w, y, z)} ${p(x + w, y, z + h)} ${p(x + w, y + d, z + h)} ${p(x + w, y + d, z)}`
  // Label sits on the strip of top face each tier leaves exposed (the tier
  // above is stepped in by ~0.6 units, so 0.3 lands in the middle of it).
  // The top tier has nothing above it, so its label goes in the centre.
  const tag = labelAt === 'center' ? iso(x + w / 2, y + d / 2, z + h) : iso(x + w - 0.3, y + d - 0.3, z + h)

  return (
    <g
      tabIndex={0}
      role="img"
      aria-label={`Tier ${id.slice(1)}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={cn(
        'cursor-pointer outline-none transition-[transform,opacity] duration-300 ease-out-soft',
        active ? '-translate-y-2' : 'hover:-translate-y-1',
        dimmed ? 'opacity-45' : 'opacity-100',
      )}
    >
      <polygon points={left} fill={darker} stroke="var(--color-ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={right} fill={dark} stroke="var(--color-ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={top} fill={color} stroke="var(--color-ink)" strokeWidth={active ? 2.6 : 1.6} strokeLinejoin="round" />
      <text
        x={tag.sx}
        y={tag.sy + 1}
        textAnchor="middle"
        fontFamily="Space Mono, monospace"
        fontWeight="700"
        fontSize="12"
        fill="var(--color-on-bright)"
      >
        {id}
      </text>
    </g>
  )
}

export function Isometric({ className }: { className?: string }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const meta = tiers.find((t) => t.id === (hovered ?? 'T1'))
  const shipped = tiers.filter((t) => t.status === 'done').length

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox="-200 -170 400 330"
        className="w-full overflow-visible"
        role="group"
        aria-label="The four tiers drawn as stacked blocks, T1 at the base up to T4"
      >
        <ellipse cx="0" cy="86" rx="116" ry="26" fill="var(--color-shadow)" />
        {/* Drawn back to front: T1 is the wide base, each tier steps in and up. */}
        {BLOCKS.map((tier) => (
          <Block
            key={tier.id}
            tier={tier}
            active={hovered === tier.id}
            dimmed={hovered !== null && hovered !== tier.id}
            onEnter={() => setHovered(tier.id)}
            onLeave={() => setHovered((h) => (h === tier.id ? null : h))}
          />
        ))}
      </svg>

      {/* The caption reads the hovered tier, so the stack explains itself. */}
      <div className="mx-auto mt-2 max-w-[19rem] text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="label-mono text-subtle">{hovered ? meta?.id : `${shipped} of ${tiers.length} tiers shipped`}</span>
          {hovered && meta?.status === 'done' && (
            <span className="rounded-btn bg-green px-2 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.08em] text-white">
              Shipped
            </span>
          )}
          {hovered && meta?.status === 'planned' && (
            <span className="rounded-btn px-2 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.08em] text-subtle ring-1 ring-line">
              Not started
            </span>
          )}
        </div>
        <p className="mt-1 min-h-[2.4rem] font-mono text-[0.78rem] leading-snug text-muted">
          {hovered ? `${meta?.name} — ${meta?.note}` : 'Hover a tier to see what it covers.'}
        </p>
      </div>
    </div>
  )
}

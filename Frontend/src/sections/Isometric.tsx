/**
 * Isometric — the hero illustration: the four tiers drawn as stacked 3D blocks
 * in the primary colours (toy-brick art, but it's Verdikt's own tier ladder).
 * Pure SVG on an isometric grid; each block lifts on hover and a few little
 * "score bubble" chips float around it.
 */
import { cn } from '../ui'

// Isometric projection: map a 3D point (x, y, z) in block units to 2D screen px.
const U = 34 // one block unit, in pixels
const iso = (x: number, y: number, z: number) => ({
  sx: (x - y) * U * 0.98,
  sy: (x + y) * U * 0.5 - z * U,
})

interface BlockProps {
  x: number
  y: number
  z: number
  w: number
  d: number
  h: number
  color: string
  dark: string
  darker: string
  label: string
  /** 'corner' puts the label on the strip of top face the tier above leaves
   *  exposed; 'center' is for the top tier, which nothing covers. */
  labelAt?: 'corner' | 'center'
}

/** One extruded cuboid: a lit top face plus two darker sides. */
function Block({ x, y, z, w, d, h, color, dark, darker, label, labelAt = 'corner' }: BlockProps) {
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
    <g className="transition-transform duration-300 ease-out-soft hover:-translate-y-1">
      <polygon points={left} fill={darker} stroke="var(--color-ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={right} fill={dark} stroke="var(--color-ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={top} fill={color} stroke="var(--color-ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <text x={tag.sx} y={tag.sy + 1} textAnchor="middle" fontFamily="Space Mono, monospace" fontWeight="700" fontSize="12" fill="var(--color-on-bright)">
        {label}
      </text>
    </g>
  )
}

/**
 * Small floating chip (a score bubble).
 * The position goes on the outer <g> as an SVG attribute, so the CSS float
 * animation on the inner <g> can own `transform` without fighting it.
 */
function Chip({ x, y, children, delay, tone }: { x: number; y: number; children: string; delay: number; tone: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="animate-float" style={{ animationDelay: `${delay}s` }}>
        <rect x={-34} y={-15} width={68} height={30} rx={9} fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="1.6" />
        <circle cx={-20} cy={0} r={4.5} fill={tone} />
        <text x={6} y={4} textAnchor="middle" fontFamily="Space Mono, monospace" fontWeight="700" fontSize="12" fill="var(--color-ink)">
          {children}
        </text>
      </g>
    </g>
  )
}

export function Isometric({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <svg viewBox="-200 -160 400 330" className="w-full animate-float-slow overflow-visible" role="img" aria-label="The four tiers drawn as stacked blocks, T1 at the base up to T4">
        <ellipse cx="0" cy="86" rx="116" ry="26" fill="var(--color-shadow)" />
        {/* Drawn back to front: T1 is the wide base, each tier steps in and up. */}
        <Block x={-2} y={-2} z={0} w={4} d={4} h={0.7} color="#ff4b3e" dark="#d63a2e" darker="#b02a20" label="T1" />
        <Block x={-1.4} y={-1.4} z={0.7} w={2.8} d={2.8} h={0.7} color="#ffd23f" dark="#e6b420" darker="#c99a10" label="T2" />
        <Block x={-0.85} y={-0.85} z={1.4} w={1.7} d={1.7} h={0.7} color="#1f3ae0" dark="#1a2fbd" darker="#12237f" label="T3" />
        <Block x={-0.4} y={-0.4} z={2.1} w={0.8} d={0.8} h={0.7} color="#1fa463" dark="#178a52" darker="#0f6e40" label="T4" labelAt="center" />
        <Chip x={-132} y={-92} delay={0} tone="#1fa463">4.8</Chip>
        <Chip x={138} y={-46} delay={1.4} tone="#ff4b3e">3.1</Chip>
        <Chip x={126} y={92} delay={0.7} tone="#1f3ae0">σ 0.31</Chip>
      </svg>
    </div>
  )
}

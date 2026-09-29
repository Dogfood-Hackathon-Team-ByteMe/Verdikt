/**
 * Logo — the Verdikt wordmark: a gavel in a rounded badge, next to the name in
 * bold Space Grotesk.
 *
 * A gavel is the one object that says "a judgement was made here" without a
 * word of explanation, which is the whole product. The drawing is bold enough
 * to hold up small -- nothing finer than ~1.5px of stroke on a 28-unit
 * viewBox -- and scales cleanly up to the 40px the header renders it at.
 *
 *   - The head is a mallet, not a bar: a centre barrel with two flared end
 *     caps, which is what makes it read as "gavel" instead of "hammer".
 *   - The handle tapers into a small pommel so it looks turned on a lathe.
 *   - It is drawn mid-strike -- rotated as one piece, with three red impact
 *     sparks where the cap meets the block, so the mark has a moment in it
 *     rather than a still life.
 *   - The sound block is two-tier (the strike plate on its base), level, so
 *     the gavel's angle has something to be angled against.
 *
 * Palette is the kit's own: blue badge, cream gavel, yellow block, red spark.
 * The badge outline uses --color-ink so it separates from the page in either
 * theme, but everything inside the badge is fixed cream-on-dark-outline:
 * those tokens invert in dark mode, which would turn the head into a dark
 * blob on the (always blue) badge.
 */
import { cn } from './cn'

export function Logo({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'white' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', tone === 'white' ? 'text-white' : 'text-ink', className)}>
      <GavelMark className="h-10 w-10" />
      <span className="font-display text-[1.75rem] font-bold tracking-[-0.03em]">Verdikt</span>
    </span>
  )
}

/**
 * The badge on its own, exported for places that want the mark without the
 * word -- the certificate header, a favicon-sized corner.
 */
export function GavelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="23" height="23" rx="6" fill="var(--color-blue)" stroke="var(--color-ink)" strokeWidth="2" />

      {/* Gavel, rotated as one piece so head, caps and handle stay square. */}
      <g transform="rotate(-34 14 12.5)">
        {/* handle: shaft, then a pommel at the end so it reads as turned wood */}
        <rect x="13" y="10.6" width="2.4" height="7.4" rx="1.2" fill="#faf8f2" stroke="#16150f" strokeWidth="1.3" />
        <circle cx="14.2" cy="18.7" r="1.7" fill="#faf8f2" stroke="#16150f" strokeWidth="1.3" />
        {/* head: centre barrel between two flared end caps */}
        <rect x="9" y="6.7" width="10.4" height="4.6" fill="#faf8f2" stroke="#16150f" strokeWidth="1.3" />
        <rect x="6.4" y="5.8" width="3" height="6.4" rx="1.2" fill="#faf8f2" stroke="#16150f" strokeWidth="1.3" />
        <rect x="19" y="5.8" width="3" height="6.4" rx="1.2" fill="#faf8f2" stroke="#16150f" strokeWidth="1.3" />
      </g>

      {/* Impact sparks, in the gap the striking cap is closing on. */}
      <g stroke="var(--color-red)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6.6 16.6l-1.4-1.1" />
        <path d="M4.9 18.6h1.8" />
      </g>

      {/* The two-tier sound block, under the cap. Level, so the angle reads. */}
      <rect x="6.4" y="19.4" width="7" height="2" rx="1" fill="#ffd23f" stroke="#16150f" strokeWidth="1.3" />
      <rect x="5" y="21.4" width="11.2" height="2.4" rx="1.2" fill="#ffd23f" stroke="#16150f" strokeWidth="1.3" />
    </svg>
  )
}

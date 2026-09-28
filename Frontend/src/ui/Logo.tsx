/**
 * Logo — the Verdikt wordmark: a gavel in a rounded badge, next to the name in
 * bold Space Grotesk.
 *
 * A gavel is the one object that says "a judgement was made here" without a
 * word of explanation, which is the whole product. It is drawn as three solid
 * shapes on the blue badge -- head, handle, and the block it strikes -- because
 * at 28px anything finer turns to mush. The head sits at a slight angle so it
 * reads as mid-strike rather than as a stray rectangle, and the block stays
 * level so the angle has something to be angled against.
 *
 * Palette is the kit's own: blue badge, cream gavel, yellow block. The badge
 * outline uses --color-ink so it separates from the page in either theme, but
 * the gavel itself is fixed cream-on-dark-outline: those tokens invert in dark
 * mode, which turned the head into a dark blob on the (always blue) badge.
 */
import { cn } from './cn'

export function Logo({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'white' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', tone === 'white' ? 'text-white' : 'text-ink', className)}>
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
        <rect x="2.5" y="2.5" width="23" height="23" rx="6" fill="var(--color-blue)" stroke="var(--color-ink)" strokeWidth="2" />

        {/* Gavel: rotated as one piece so head and handle stay square to each other. */}
        <g transform="rotate(-32 14 13)">
          {/* handle */}
          <rect x="12.7" y="10" width="2.6" height="10.4" rx="1.3" fill="#faf8f2" stroke="#16150f" strokeWidth="1.4" />
          {/* head */}
          <rect x="7.4" y="6" width="13.2" height="5.6" rx="2.2" fill="#faf8f2" stroke="#16150f" strokeWidth="1.4" />
        </g>

        {/* The block it comes down on. Level, so the gavel's angle reads. */}
        <rect x="7" y="20.4" width="14" height="2.9" rx="1.45" fill="#ffd23f" stroke="#16150f" strokeWidth="1.4" />
      </svg>
      <span className="font-display text-[1.3rem] font-bold tracking-[-0.03em]">Verdikt</span>
    </span>
  )
}

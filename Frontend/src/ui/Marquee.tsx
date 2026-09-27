/**
 * Marquee — infinite horizontal scroller. Duplicates its children so the loop
 * is seamless, pauses on hover, and fades out at both edges.
 */
import type { ReactNode } from 'react'
import { cn } from './cn'

/** Infinite horizontal scroller. Pauses on hover. Edges fade out. */
export function Marquee({ children, duration = 40, className, label }: { children: ReactNode; duration?: number; className?: string; label?: string }) {
  return (
    <div
      className={cn('group/marquee relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]', className)}
      aria-label={label}
    >
      <div className="flex w-max animate-marquee group-hover/marquee:[animation-play-state:paused]" style={{ ['--marquee-duration' as string]: `${duration}s` }}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  )
}

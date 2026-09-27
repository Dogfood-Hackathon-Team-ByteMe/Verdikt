/**
 * Ring — a slowly rotating 3D drum of cards, like the floating UI cards in the
 * hero. Cards are placed evenly around a cylinder whose radius is computed from
 * the card size and count. Hover pauses it; cards facing away are hidden.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from './cn'

// Tracks a media query in React state, so the ring can shrink on small screens.
function useNarrow(query = '(max-width: 640px)') {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return m
}

export function Ring({ items, duration = 80, className }: { items: ReactNode[]; duration?: number; className?: string }) {
  const narrow = useNarrow()
  const w = narrow ? 112 : 150 // card width
  const h = narrow ? 144 : 188 // card height
  const gap = narrow ? 14 : 22 // gap between neighbouring cards
  const n = items.length
  // Radius so n cards of width (w + gap) sit edge to edge around the circle:
  // each card spans an angle of 2π/n, and half a card's width = R·tan(π/n).
  const R = Math.round((w + gap) / (2 * Math.tan(Math.PI / n)))

  return (
    // `perspective` gives the 3D depth; pull the whole drum back by R and tilt it
    // slightly so we look at it from a touch above.
    <div className={cn('relative w-full', className)} style={{ height: h + 70, perspective: narrow ? 900 : 1500, perspectiveOrigin: '50% 10%' }}>
      <div className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d', transform: `translateZ(-${R}px) rotateX(-7deg)` }}>
        {/* This inner layer is what actually spins (see the `ring` keyframes in index.css). */}
        <div className="animate-ring hover:[animation-play-state:paused]" style={{ transformStyle: 'preserve-3d', animationDuration: `${duration}s` }}>
          {items.map((item, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                width: w,
                height: h,
                left: -w / 2,
                top: -h / 2,
                // Rotate each card to its own slot, then push it out to the rim.
                transform: `rotateY(${(360 / n) * i}deg) translateZ(${R}px)`,
                // Hide cards once they turn to face away from us.
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

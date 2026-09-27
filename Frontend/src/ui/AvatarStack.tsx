/**
 * AvatarStack — overlapping circles of initials for a team. Spreads apart on
 * hover. `names` are display names; initials are derived from them.
 */
import { cn } from './cn'

const fills = ['bg-blue text-white', 'bg-yellow text-on-bright', 'bg-slab text-slab-fg', 'bg-blue-soft text-on-bright', 'bg-red text-white']

const initials = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

/** Overlapping initials. Spreads apart on hover. */
export function AvatarStack({ names, max = 4, size = 32, className }: { names: string[]; max?: number; size?: number; className?: string }) {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <div className={cn('group/avatars flex items-center', className)}>
      {shown.map((n, i) => (
        <span
          key={n + i}
          title={n}
          className={cn(
            'grid place-items-center rounded-full font-mono text-[0.62rem] font-semibold ring-2 ring-paper transition-[margin] duration-300 ease-out-soft',
            i > 0 && '-ml-2.5 group-hover/avatars:-ml-1',
            fills[i % fills.length],
          )}
          style={{ width: size, height: size }}
        >
          {initials(n)}
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2.5 grid place-items-center rounded-full bg-fog font-mono text-[0.62rem] ring-2 ring-paper group-hover/avatars:-ml-1" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </div>
  )
}

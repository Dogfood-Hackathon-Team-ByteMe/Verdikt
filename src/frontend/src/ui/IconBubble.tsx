/**
 * IconBubble — a round icon sized to the surrounding text, so it can sit inline
 * inside a headline. Nudges and scales on hover.
 */
import { cn } from './cn'
import { Icon, type IconName } from './Icon'

const tones = {
  blue: 'bg-blue text-white',
  yellow: 'bg-yellow text-on-bright',
  red: 'bg-red text-white',
  green: 'bg-green text-white',
  ink: 'bg-slab text-yellow',
} as const

/** Round icon that sits inline inside a headline, sized to the text. */
export function IconBubble({ icon, tone = 'blue', className }: { icon: IconName; tone?: keyof typeof tones; className?: string }) {
  return (
    <span
      className={cn(
        'mx-[0.06em] inline-grid h-[0.92em] w-[0.92em] -translate-y-[0.06em] place-items-center rounded-full align-middle transition-transform duration-500 ease-spring hover:rotate-[20deg] hover:scale-110',
        tones[tone],
        className,
      )}
      aria-hidden="true"
    >
      <Icon name={icon} size={1} strokeWidth={2.2} style={{ width: '0.5em', height: '0.5em' }} />
    </span>
  )
}

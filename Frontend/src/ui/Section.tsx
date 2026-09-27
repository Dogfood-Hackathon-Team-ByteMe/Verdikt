/**
 * Section building blocks:
 *  - Section: vertical rhythm + optional Container wrapper.
 *  - SectionHeading: a "// LABEL" mono eyebrow above a bold Space Grotesk title,
 *    with the tail continued in blue (the accent).
 *  - SectionLabel: the small "// LABEL" mono eyebrow on its own.
 */
import type { ReactNode } from 'react'
import { cn } from './cn'
import { Container } from './Container'
import { Reveal } from './Reveal'

export function SectionLabel({ children, className, tone = 'ink' }: { children: ReactNode; className?: string; tone?: 'ink' | 'white' | 'on-color' }) {
  return (
    <div className={cn('label-mono flex items-center gap-2', tone === 'white' ? 'text-white/80' : 'text-red', className)}>
      <span aria-hidden="true">//</span>
      <span className={tone === 'white' ? 'text-white/80' : tone === 'on-color' ? 'text-band-fg/70' : 'text-muted'}>{children}</span>
    </div>
  )
}

export function SectionHeading({
  label,
  title,
  tail,
  children,
  align = 'center',
  className,
  onColor,
}: {
  label: ReactNode
  title: ReactNode
  tail?: ReactNode
  children?: ReactNode
  align?: 'center' | 'left'
  className?: string
  /** Set on the full-width colour band (the tier section), so the supporting
   *  text uses --color-band-fg and stays readable in both themes. */
  onColor?: boolean
}) {
  return (
    <Reveal className={cn('flex flex-col gap-4', align === 'center' ? 'items-center text-center' : 'items-start', className)}>
      <SectionLabel tone={onColor ? 'on-color' : 'ink'}>{label}</SectionLabel>
      <h2 className={cn('headline max-w-[20ch] text-[clamp(2rem,4.6vw,3.4rem)]', align === 'center' && 'mx-auto')}>
        {title} {tail && <span className="text-blue">{tail}</span>}
      </h2>
      {children && <p className={cn('max-w-xl text-[0.98rem]', onColor ? 'text-band-fg/75' : 'text-muted', align === 'center' && 'mx-auto')}>{children}</p>}
    </Reveal>
  )
}

export function Section({ id, children, className, container = true }: { id?: string; children: ReactNode; className?: string; container?: boolean }) {
  return (
    <section id={id} className={cn('scroll-mt-24 py-20 sm:py-28', className)}>
      {container ? <Container>{children}</Container> : children}
    </section>
  )
}

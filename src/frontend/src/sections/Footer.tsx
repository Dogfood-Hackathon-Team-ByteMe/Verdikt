/**
 * Footer — sign-off: the mark and a line about the project, link
 * columns, then the oversized wordmark and the legal row.
 */
import { Link } from 'react-router-dom'
import { Container, Logo, cn } from '../ui'
import { isAnchor, navLinks } from './Nav'

const WORDMARK_FILLS = ['group-hover:text-blue', 'group-hover:text-red', 'group-hover:text-yellow']

const columns = [
  { title: 'Explore', links: navLinks.slice(0, 3) },
  { title: 'Learn', links: navLinks.slice(3) },
  {
    title: 'Elsewhere',
    links: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '#ui-kit', label: 'UI kit' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t-2 border-ink pb-10 pt-16">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 font-mono text-[0.85rem] leading-relaxed text-muted">
              Open, self-hostable hackathon submissions and judging. Host an event, enter one, or judge — all in one place.
            </p>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <div className="label-mono text-red">{col.title}</div>
              <ul className="mt-4 flex flex-col gap-2">
                {col.links.map((l) => {
                  // inline-block + vertical padding, so the hit area clears the
                  // 24px minimum without the link text moving. The list's own
                  // gap-2 absorbs the extra height.
                  const className =
                    'inline-block py-[3px] font-mono text-[0.85rem] text-muted transition-colors hover:text-blue'
                  const external = l.href.startsWith('http')
                  return (
                    <li key={l.href}>
                      {isAnchor(l.href) || external ? (
                        <a
                          href={l.href}
                          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                          className={className}
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link to={l.href} className={className}>
                          {l.label}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </nav>
          ))}
        </div>

        {/* Oversized wordmark, outlined so it reads as a graphic rather than a
            heading. On hover each letter fills in turn, cycling the kit's
            three primaries. */}
        <div
          className="group headline mt-16 select-none text-center text-[clamp(4rem,20vw,16rem)] leading-[0.8] text-transparent"
          style={{ WebkitTextStroke: '2px var(--color-ink)' }}
          aria-hidden="true"
        >
          {'Verdikt'.split('').map((ch, i) => (
            <span
              key={i}
              className={cn('transition-colors duration-500', WORDMARK_FILLS[i % WORDMARK_FILLS.length])}
              style={{ transitionDelay: `${i * 45}ms` }}
            >
              {ch}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-4 border-t-2 border-ink pt-6 font-mono text-[0.72rem] uppercase tracking-[0.05em] text-subtle">
          <span>© 2026 Team Verdikt · MIT</span>
        </div>
      </Container>
    </footer>
  )
}

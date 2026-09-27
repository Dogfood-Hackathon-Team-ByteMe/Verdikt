/**
 * Footer — MLH-style sign-off: the mark and a line about the project, link
 * columns, then the oversized wordmark and the legal row.
 */
import { Container, Logo } from '../ui'
import { navLinks } from './Nav'

const columns = [
  { title: 'The event', links: navLinks.slice(0, 4) },
  { title: 'Details', links: navLinks.slice(4) },
  {
    title: 'Elsewhere',
    links: [
      { href: 'https://dogfoodhack.com', label: 'dogfoodhack.com' },
      { href: 'https://discord.gg/xfYPDZYqeh', label: 'Discord' },
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
              Open, self-hostable hackathon submissions and judging. Built by team Verdikt for DOGFOOD 2026.
            </p>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <div className="label-mono text-red">{col.title}</div>
              <ul className="mt-4 flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className="font-mono text-[0.85rem] text-muted transition-colors hover:text-blue"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Oversized wordmark, outlined so it reads as a graphic rather than a heading */}
        <div
          className="headline mt-16 select-none text-center text-[clamp(4rem,20vw,16rem)] leading-[0.8] text-transparent transition-all duration-500 hover:text-yellow"
          style={{ WebkitTextStroke: '2px var(--color-ink)' }}
          aria-hidden="true"
        >
          Verdikt
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-4 border-t-2 border-ink pt-6 font-mono text-[0.72rem] uppercase tracking-[0.05em] text-subtle">
          <span>© 2026 Team Verdikt · MIT</span>
          <span>Not affiliated with Hackathon Raptors or MLH</span>
        </div>
      </Container>
    </footer>
  )
}

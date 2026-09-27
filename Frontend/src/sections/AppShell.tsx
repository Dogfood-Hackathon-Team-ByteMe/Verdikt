/**
 * AppShell — chrome for every page that is not the landing page.
 *
 * A slimmer header than the landing Nav: wordmark, a couple of destinations,
 * theme switch and the account menu. Same tokens, same ink rules, so the
 * signed-in app reads as the same product as the marketing page.
 */
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Container, Logo, ThemeToggle, cn } from '../ui'
import { useAuth } from '../auth/AuthProvider'
import { AccountMenu } from './AccountMenu'

/**
 * "Organize" is a verb here, not a rank. Hosting an event is something any
 * signed-in account can do, so the link is never gated on already organising
 * one -- that was a chicken-and-egg which made the first event impossible to
 * create from the UI, even though the API allowed it all along.
 */
const links = [
  { to: '/projects', label: 'Projects' },
  { to: '/events', label: 'Events' },
  { to: '/dashboard', label: 'Dashboard', authOnly: true },
  { to: '/judge', label: 'Judge', authOnly: true },
  { to: '/organizer', label: 'Organize', authOnly: true },
]

export function AppShell({
  children,
  /** Rendered full-bleed above the container, for page-specific banners. */
  banner,
}: {
  children: ReactNode
  banner?: ReactNode
}) {
  const { user } = useAuth()
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b-2 border-ink bg-cream/95 backdrop-blur-md">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/" aria-label="Verdikt home" className="transition-transform duration-200 hover:-translate-y-0.5">
              <Logo />
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
              {links
                .filter((l) => !l.authOnly || user)
                .map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={cn(
                      'group relative rounded-md px-3 py-2 font-mono text-[0.78rem] font-bold transition-colors duration-200',
                      pathname === l.to ? 'text-blue' : 'text-ink hover:text-blue',
                    )}
                  >
                    {l.label}
                    <span
                      className={cn(
                        'absolute inset-x-3 bottom-1 h-[2px] origin-left bg-blue transition-transform duration-300 ease-out-soft',
                        pathname === l.to ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
                      )}
                      aria-hidden="true"
                    />
                  </Link>
                ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <AccountMenu />
          </div>
        </Container>
      </header>

      {banner}

      <main className="flex-1">{children}</main>

      <footer className="border-t-2 border-ink py-6">
        <Container className="flex flex-wrap items-center justify-between gap-3 font-mono text-[0.72rem] uppercase tracking-[0.05em] text-subtle">
          <span>Verdikt &middot; MIT</span>
          <Link to="/" className="hover:text-blue">
            Back to the event page
          </Link>
        </Container>
      </footer>
    </div>
  )
}

/**
 * Page title block, matching the landing page's section heading treatment:
 * a red "// LABEL" eyebrow over a bold Space Grotesk line with a blue tail.
 */
export function PageHeading({
  label,
  title,
  tail,
  children,
  actions,
}: {
  label: string
  title: ReactNode
  tail?: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <div className="label-mono flex items-center gap-2 text-red">
          <span aria-hidden="true">//</span>
          <span className="text-muted">{label}</span>
        </div>
        <h1 className="headline mt-4 text-[clamp(1.9rem,4.4vw,3rem)]">
          {title} {tail && <span className="text-blue">{tail}</span>}
        </h1>
        {children && <p className="mt-3 max-w-xl font-mono text-[0.9rem] text-muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  )
}

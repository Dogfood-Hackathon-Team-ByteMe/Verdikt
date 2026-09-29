/**
 * AppShell — chrome for every page that is not the landing page.
 *
 * A slimmer header than the landing Nav: wordmark, a couple of destinations,
 * theme switch and the account menu. Same tokens, same ink rules, so the
 * signed-in app reads as the same product as the marketing page.
 */
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Container, Logo, ThemeCord, cn } from '../ui'
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
  { to: '/community', label: 'Community' },
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
      <header className="sticky top-0 z-50 border-b-2 border-ink bg-nav/95 backdrop-blur-md print:hidden">
        <Container className="flex h-18 items-center justify-between gap-4">
          <div className="flex h-full items-center gap-5">
            {/* Full header height and starting at the logo, so ThemeCord can
                hang from the bottom of the gavel badge. */}
            <div className="relative flex h-full shrink-0 items-center">
              <Link
                to="/"
                aria-label="Verdikt home"
                className="flex items-center transition-transform duration-200 hover:-translate-y-0.5"
              >
                <Logo />
              </Link>
              <ThemeCord />
            </div>

            <span className="hidden h-7 w-px shrink-0 bg-line sm:block" aria-hidden="true" />

            {/* Pills rather than underlines: every link is the same height and
                the same shape, so the row reads as one set of controls. */}
            <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
              {links
                .filter((l) => !l.authOnly || user)
                .map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    aria-current={pathname === l.to ? 'page' : undefined}
                    className={cn(
                      'flex h-10 items-center rounded-btn px-3.5 font-mono text-[0.82rem] font-bold leading-none transition-colors duration-200',
                      pathname === l.to
                        ? 'bg-blue-mist text-blue-ink ring-1 ring-blue/30'
                        : 'text-ink hover:bg-fog hover:text-blue',
                    )}
                  >
                    {l.label}
                  </Link>
                ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <AccountMenu />
          </div>
        </Container>
      </header>

      {banner}

      <main className="flex-1">{children}</main>

      <footer className="border-t-2 border-ink py-6 print:hidden">
        <Container className="flex flex-wrap items-center justify-between gap-3 font-mono text-[0.72rem] uppercase tracking-[0.05em] text-subtle">
          <span>Verdikt &middot; MIT</span>
          {/* -my-1 keeps the footer the same height while the padding lifts
              the hit area over the 24px minimum. */}
          <Link to="/" className="-my-1 inline-block py-1 hover:text-blue">
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

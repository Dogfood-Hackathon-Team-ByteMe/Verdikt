/**
 * Nav — fixed top navigation on the paper ground: logo, mono links, and the
 * yellow "Host an event" action. Gains a border and blur once you scroll.
 * Collapses to a menu button on small screens.
 * `navLinks` is exported so the footer reuses the same list.
 */
import { useEffect, useState } from 'react'
import { Button, Container, Icon, Logo, ThemeToggle, cn } from '../ui'
import { useAuth } from '../auth/AuthProvider'
import { AccountMenu } from './AccountMenu'

export const navLinks = [
  { href: '#about', label: 'About' },
  { href: '#tiers', label: 'Tiers' },
  { href: '#scoring', label: 'Scoring' },
  { href: '#gallery', label: 'Gallery' },
  { href: '#timeline', label: 'Timeline' },
  { href: '#prizes', label: 'Prizes' },
  { href: '#faq', label: 'FAQ' },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { user, signOut } = useAuth()

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 z-50 transition-colors duration-300',
        scrolled || open ? 'border-b-2 border-ink bg-cream/95 backdrop-blur-md' : 'border-b-2 border-transparent',
      )}
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#top" aria-label="Verdikt home" className="transition-transform duration-200 hover:-translate-y-0.5">
          <Logo />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative rounded-md px-3 py-2 font-mono text-[0.78rem] font-bold text-ink transition-colors duration-200 hover:text-blue"
            >
              {l.label}
              {/* underline grows in from the left on hover */}
              <span className="absolute inset-x-3 bottom-1 h-[2px] origin-left scale-x-0 bg-blue transition-transform duration-300 ease-out-soft group-hover:scale-x-100" aria-hidden="true" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Always visible: the theme switch is a top-level control, not a menu item */}
          <ThemeToggle />
          <AccountMenu />
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-btn bg-paper ring-2 ring-ink lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'x' : 'plus'} size={16} strokeWidth={2.4} />
          </button>
        </div>
      </Container>

      <div
        id="mobile-nav"
        className={cn(
          'grid overflow-hidden bg-cream transition-all duration-400 ease-out-soft lg:hidden',
          open ? 'grid-rows-[1fr] border-t-2 border-ink opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
        )}
      >
        <nav aria-label="Mobile" className="min-h-0">
          <Container>
            <ul className="flex flex-col py-2">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between border-b border-line py-3 font-mono text-[0.95rem] font-bold"
                  >
                    {l.label}
                    <Icon name="arrowRight" size={16} className="text-subtle" />
                  </a>
                </li>
              ))}
              <li className="flex flex-col gap-2 py-4">
                {user ? (
                  <>
                    <Button href="#host" icon="arrowRight" className="w-full" onClick={() => setOpen(false)}>
                      Host an event
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => { setOpen(false); void signOut() }}>
                      Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button href="/signup" icon="arrowRight" className="w-full" onClick={() => setOpen(false)}>
                      Create account
                    </Button>
                    <Button href="/login" variant="outline" className="w-full" onClick={() => setOpen(false)}>
                      Sign in
                    </Button>
                  </>
                )}
              </li>
            </ul>
          </Container>
        </nav>
      </div>
    </header>
  )
}

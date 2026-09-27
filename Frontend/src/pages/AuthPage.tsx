/**
 * AuthPage — sign in and sign up, sharing one layout and one form engine.
 *
 * Paper card on the left, blue Panel on the right carrying the pitch (and, on
 * mock data, the demo accounts). Same tokens, same Button/Card/Field kit and
 * the same graph-paper ground as the landing page, so it reads as one site.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, usingMockData } from '../api'
import { DEMO_PASSWORD } from '../api/mockAuth'
import { useAuth } from '../auth/AuthProvider'
import { globalBadgeFor, initialsFor } from '../auth/roles'
import { Alert, Button, Container, Field, Icon, Logo, Panel, ThemeToggle } from '../ui'

export type AuthMode = 'signin' | 'signup'

const copy = {
  signin: {
    label: 'Sign in',
    title: 'Welcome',
    tail: 'back.',
    blurb: 'Pick up your drafts, your team and your ballots.',
    submit: 'Sign in',
    swapText: 'No account yet?',
    swapLabel: 'Create one',
    swapHash: '/signup',
  },
  signup: {
    label: 'Sign up',
    title: 'Make an',
    tail: 'account.',
    blurb: 'One account covers competing, judging and organising.',
    submit: 'Create account',
    swapText: 'Already registered?',
    swapLabel: 'Sign in',
    swapHash: '/login',
  },
} as const

const DEMO_ACCOUNTS = [
  { role: 'Participant', email: 'participant@verdikt.dev' },
  { role: 'Judge', email: 'judge@verdikt.dev' },
  { role: 'Organizer', email: 'organizer@verdikt.dev' },
]

type Errors = Partial<Record<'name' | 'email' | 'password', string>>

/** Client-side checks, mirroring what the backend enforces server-side. */
function validate(mode: AuthMode, values: { name: string; email: string; password: string }): Errors {
  const errors: Errors = {}
  if (mode === 'signup' && !values.name.trim()) errors.name = 'Tell us what to call you.'
  if (!values.email.trim()) errors.email = 'An email address is required.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'That does not look like an email address.'
  if (!values.password) errors.password = 'A password is required.'
  else if (mode === 'signup' && values.password.length < 8) errors.password = 'Use at least 8 characters.'
  return errors
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { user, status, pending, signIn, signUp, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const t = copy[mode]

  // RequireAuth and the invite page stash where the person was headed, so
  // signing in returns them there instead of dumping them on the dashboard.
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  /** Set on first submit, so errors appear then rather than on first keystroke. */
  const [submitted, setSubmitted] = useState(false)

  // Arriving from a mid-page anchor would otherwise keep the old scroll offset.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [mode])

  // Switching between the two modes should not carry errors across.
  useEffect(() => {
    setErrors({})
    setFormError(null)
    setSubmitted(false)
  }, [mode])

  const live = useMemo(() => validate(mode, { name, email, password }), [mode, name, email, password])
  const shown: Errors = submitted ? { ...live, ...errors } : errors

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setFormError(null)
    setErrors({})

    const found = validate(mode, { name, email, password })
    if (Object.keys(found).length > 0) return

    try {
      if (mode === 'signup') await signUp({ name: name.trim(), email: email.trim(), password })
      else await signIn({ email: email.trim(), password })
      navigate(from, { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.field) setErrors({ [error.field]: error.message })
      else if (error instanceof Error) setFormError(error.message)
      else setFormError('Something went wrong. Try again.')
    }
  }

  return (
    <div className="min-h-dvh">
      {/* Minimal chrome: the full nav would be noise on a focused task. */}
      <header className="border-b-2 border-ink">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link to="/" aria-label="Verdikt home" className="transition-transform duration-200 hover:-translate-y-0.5">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button href="/" variant="ghost" size="sm">
              Back to site
            </Button>
          </div>
        </Container>
      </header>

      <Container className="py-12 sm:py-16">
        <div className="mx-auto grid max-w-[1050px] items-stretch gap-8 lg:grid-cols-[1fr_0.85fr]">
          {/* Form */}
          <div className="rounded-card bg-paper p-6 ring-1 ring-ink sm:p-9">
            {status === 'authed' && user ? (
              <SignedIn
                initials={initialsFor(user)}
                name={user.name || user.email}
                role={globalBadgeFor(user) ?? user.email}
                pending={pending}
                onSignOut={() => void signOut()}
              />
            ) : (
              <>
                <div className="label-mono flex items-center gap-2 text-red">
                  <span aria-hidden="true">//</span>
                  <span className="text-muted">{t.label}</span>
                </div>
                <h1 className="headline mt-4 text-[clamp(1.9rem,4vw,2.7rem)]">
                  {t.title} <span className="text-blue">{t.tail}</span>
                </h1>
                <p className="mt-3 font-mono text-[0.88rem] text-muted">{t.blurb}</p>

                <form className="mt-7 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
                  {formError && <Alert>{formError}</Alert>}

                  {mode === 'signup' && (
                    <Field
                      label="Name"
                      icon="user"
                      autoComplete="name"
                      placeholder="Ada Okafor"
                      value={name}
                      error={shown.name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}

                  <Field
                    label="Email"
                    type="email"
                    icon="mail"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    error={shown.email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <Field
                    label="Password"
                    icon="lock"
                    reveal
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder="Your password"
                    value={password}
                    error={shown.password}
                    hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <Button type="submit" size="lg" icon="arrowRight" disabled={pending} className="mt-2 w-full">
                    {pending ? 'Working...' : t.submit}
                  </Button>
                </form>

                <p className="mt-6 border-t border-line pt-5 font-mono text-[0.82rem] text-muted">
                  {t.swapText}{' '}
                  <Link to={t.swapHash} state={location.state} className="font-bold text-blue underline-offset-4 hover:underline">
                    {t.swapLabel}
                  </Link>
                </p>
              </>
            )}
          </div>

          {/* Side panel */}
          <Panel className="p-7 sm:p-9">
            <div className="flex h-full flex-col">
              <div className="label-mono flex items-center gap-2 text-white/80">
                <span aria-hidden="true">//</span> One account
              </div>
              <h2 className="headline mt-4 text-[clamp(1.4rem,2.6vw,1.9rem)] text-white">
                Compete, judge or <span className="text-yellow">run the whole event.</span>
              </h2>

              <ul className="mt-6 flex flex-col gap-3 font-mono text-[0.85rem] text-white/90">
                {[
                  'Drafts you can edit until the deadline',
                  'Team invites by shareable link',
                  'Judges never see another ballot',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-yellow text-on-bright">
                      <Icon name="check" size={11} strokeWidth={3} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>

              {usingMockData && <DemoAccounts />}

              <p className="mt-auto pt-8 font-mono text-[0.72rem] leading-relaxed text-white/55">
                Verdikt stores your password hashed with bcrypt and keeps the session in an httpOnly cookie. No
                third-party sign-in, no tracking.
              </p>
            </div>
          </Panel>
        </div>
      </Container>
    </div>
  )
}

/** Shown on mock data only: the seeded accounts, one per role. */
function DemoAccounts() {
  return (
    <div className="mt-7 rounded-card bg-slab p-4 text-slab-fg ring-1 ring-ink">
      <div className="label-mono text-yellow">Demo accounts</div>
      <p className="mt-2 font-mono text-[0.72rem] leading-relaxed text-white/60">
        Running on sample data. Any of these, password <span className="font-bold text-white">{DEMO_PASSWORD}</span>.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.email} className="flex items-center justify-between gap-3 font-mono text-[0.72rem]">
            <span className="text-white/50">{a.role}</span>
            <span className="truncate">{a.email}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Reached by opening #signin while already signed in. */
function SignedIn({
  initials,
  name,
  role,
  pending,
  onSignOut,
}: {
  initials: string
  name: string
  role: string
  pending: boolean
  onSignOut: () => void
}) {
  return (
    <div className="flex flex-col items-start">
      <div className="label-mono flex items-center gap-2 text-red">
        <span aria-hidden="true">//</span>
        <span className="text-muted">Signed in</span>
      </div>
      <div className="mt-6 flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-yellow font-mono text-[1rem] font-bold text-on-bright ring-2 ring-ink">
          {initials}
        </span>
        <div className="min-w-0">
          <div className="headline truncate text-[1.35rem]">{name}</div>
          <div className="label-mono mt-1 text-muted">{role}</div>
        </div>
      </div>
      <p className="mt-6 font-mono text-[0.88rem] text-muted">You are already signed in on this browser.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Button href="/dashboard" size="lg" icon="arrowRight">
          Go to dashboard
        </Button>
        <Button variant="outline" size="lg" disabled={pending} onClick={onSignOut}>
          {pending ? 'Signing out...' : 'Sign out'}
        </Button>
      </div>
    </div>
  )
}

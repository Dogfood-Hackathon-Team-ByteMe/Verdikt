/**
 * Route guards.
 *
 * These are a convenience, not a security boundary -- the backend enforces
 * every rule independently, which is what T1 grades. Their job is to avoid
 * showing a signed-out person a broken page full of 401s.
 */
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { AuthRole } from '../api/auth'
import { useAuth } from './AuthProvider'
import { roleFor } from './roles'
import { Container, Logo } from '../ui'

/** Full-page placeholder while the first me() call is in flight. */
function Checking() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Container className="flex flex-col items-center gap-4 text-center">
        <Logo />
        <p className="label-mono text-subtle" role="status">
          Checking your session
        </p>
      </Container>
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Checking />

  if (status === 'anon') {
    // Remember where they were headed so sign-in can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

/**
 * Narrower guard for a specific event role. Not used by any T1 screen yet;
 * the judge and organizer views (T2) are what it exists for.
 */
export function RequireRole({
  eventId,
  eventTrackIds = [],
  allow,
  children,
}: {
  eventId: string
  eventTrackIds?: string[]
  allow: AuthRole[]
  children: ReactNode
}) {
  const { user, status } = useAuth()

  if (status === 'loading') return <Checking />
  if (!user) return <Navigate to="/login" replace />

  if (!allow.includes(roleFor(user, eventId, eventTrackIds))) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

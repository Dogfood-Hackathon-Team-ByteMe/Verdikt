/**
 * AuthProvider — holds the session for the whole app.
 *
 * Asks the API who the viewer is once on mount, then exposes that plus the
 * three actions. Components call useAuth() and never touch the API directly,
 * so the mock/real swap stays invisible to them.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authApi } from '../api'
import type { AuthUser, LoginInput, RegisterInput } from '../api/auth'

/**
 * 'loading' only covers the first `me()` call. Sign-in and sign-up report
 * their own progress through `pending`, so the whole app doesn't blank out
 * while a form is submitting.
 */
export type AuthStatus = 'loading' | 'authed' | 'anon'

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  /** True while a sign-in, sign-up or sign-out is in flight. */
  pending: boolean
  signIn(input: LoginInput): Promise<AuthUser>
  signUp(input: RegisterInput): Promise<AuthUser>
  signOut(): Promise<void>
  /** Re-read the session — after joining a team changes your roles, say. */
  refresh(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [pending, setPending] = useState(false)

  // StrictMode mounts twice in development; this keeps the resolved state from
  // being written back by the first, unmounted run.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const me = await authApi.me()
      if (!alive.current) return
      setUser(me)
      setStatus(me ? 'authed' : 'anon')
    } catch {
      // A network failure is not a signed-in state; treat it as anonymous
      // rather than trapping the app on a spinner.
      if (!alive.current) return
      setUser(null)
      setStatus('anon')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** Shared wrapper so every action reports `pending` and settles the session. */
  const run = useCallback(async <T,>(action: () => Promise<T>, next: (result: T) => void): Promise<T> => {
    setPending(true)
    try {
      const result = await action()
      next(result)
      return result
    } finally {
      if (alive.current) setPending(false)
    }
  }, [])

  const signIn = useCallback(
    (input: LoginInput) =>
      run(
        () => authApi.login(input),
        (me) => {
          setUser(me)
          setStatus('authed')
        },
      ),
    [run],
  )

  const signUp = useCallback(
    (input: RegisterInput) =>
      run(
        () => authApi.register(input),
        (me) => {
          setUser(me)
          setStatus('authed')
        },
      ),
    [run],
  )

  const signOut = useCallback(
    () =>
      run(
        () => authApi.logout(),
        () => {
          setUser(null)
          setStatus('anon')
        },
      ),
    [run],
  )

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, pending, signIn, signUp, signOut, refresh: load }),
    [user, status, pending, signIn, signUp, signOut, load],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

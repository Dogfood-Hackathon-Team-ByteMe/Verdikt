/**
 * Real-backend implementation of AuthApi.
 *
 * The backend has the session-*reading* half already (the Session model and the
 * authenticate middleware); these four endpoints are the issuing half and do
 * not exist yet. Written to the contract we agreed with the backend team, so
 * this file is ready the moment they land:
 *
 *   POST /api/auth/register  { email, password, name } -> Set-Cookie: session=...
 *   POST /api/auth/login     { email, password }       -> Set-Cookie: session=...
 *   POST /api/auth/logout                              -> 204, clears cookie
 *   GET  /api/auth/me                                  -> user, or 401
 *
 * The session cookie is httpOnly, so nothing here reads or stores a token —
 * `credentials: 'include'` is what carries it. That also means the backend
 * must send CORS `credentials: true` with an explicit origin, or the browser
 * silently drops the cookie and every request looks signed-out.
 */
import type { AuthApi, AuthUser, LoginInput, RegisterInput } from './auth'
import { ApiError, unwrap } from './unwrap'

// Change these here only if the backend publishes different paths.
export const authRoutes = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  me: '/api/auth/me',
}

/** The Mongo user document, as the backend serialises it. */
interface UserDoc {
  _id?: string
  id?: string
  email: string
  name?: string
  isAdmin?: boolean
  participatingIn?: Array<string | { _id: string }>
  judgeIn?: Array<string | { _id: string }>
  organiserIn?: Array<string | { _id: string }>
}

/** Ref arrays come back either as raw ids or as populated documents. */
const ids = (refs: Array<string | { _id: string }> | undefined): string[] =>
  (refs ?? []).map((ref) => (typeof ref === 'string' ? ref : ref._id))

/**
 * Mongo document -> AuthUser. The only place `_id`/camelCase leaks across, so
 * a backend field rename is a one-line change here.
 */
export function toAuthUser(doc: UserDoc): AuthUser {
  return {
    id: doc._id ?? doc.id ?? '',
    email: doc.email,
    name: doc.name,
    is_admin: doc.isAdmin ?? false,
    participating_in: ids(doc.participatingIn),
    judge_in: ids(doc.judgeIn),
    organiser_in: ids(doc.organiserIn),
  }
}

export function createHttpAuthApi(baseUrl: string): AuthApi {
  const base = baseUrl.replace(/\/$/, '')

  const send = (path: string, method: 'GET' | 'POST', body?: unknown) =>
    fetch(base + path, {
      method,
      // Carries the httpOnly session cookie. Requires CORS credentials:true.
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })

  return {
    async register(input: RegisterInput) {
      return toAuthUser(await unwrap<UserDoc>(await send(authRoutes.register, 'POST', input)))
    },

    async login(input: LoginInput) {
      return toAuthUser(await unwrap<UserDoc>(await send(authRoutes.login, 'POST', input)))
    },

    async logout() {
      await unwrap<void>(await send(authRoutes.logout, 'POST'))
    },

    async me() {
      try {
        return toAuthUser(await unwrap<UserDoc>(await send(authRoutes.me, 'GET')))
      } catch (error) {
        // No session is the normal case for a visitor, not a failure.
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return null
        throw error
      }
    },
  }
}

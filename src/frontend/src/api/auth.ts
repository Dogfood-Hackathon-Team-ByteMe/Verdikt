/**
 * The authentication contract.
 *
 * The landing page's data layer splits mock/http behind one interface; auth
 * does the same. `mockAuth.ts` runs entirely in the browser so every signed-in
 * screen can be built and demoed today; `httpAuth.ts` is the real client and
 * takes over the moment the backend ships /api/auth/*.
 *
 * Field names stay snake_case to match ./types.ts and the DOGFOOD spec.
 */

/** Coarse role, matching the backend's Session.role enum exactly. */
export type AuthRole = 'visitor' | 'participant' | 'judge' | 'organizer' | 'admin'

/**
 * The signed-in user.
 *
 * Roles here are *per event*, not global: someone can organise one event,
 * judge a track in another and compete in a third. The three id arrays are the
 * source of truth; `roleFor()` in ../auth/roles.ts resolves them for one event.
 */
export interface AuthUser {
  id: string
  email: string
  name?: string
  is_admin: boolean
  /** Profile picture. `/api/images/<id>` for an upload, or any URL. */
  avatar_url?: string
  /** Event ids this user competes in. */
  participating_in: string[]
  /** Track ids this user judges (tracks, not events — see roles.ts). */
  judge_in: string[]
  /** Event ids this user organises. */
  organiser_in: string[]
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  name: string
}

export interface AuthApi {
  /** Create an account. Resolves to the now signed-in user. */
  register(input: RegisterInput): Promise<AuthUser>
  /** Sign in. Throws ApiError(401) on bad credentials. */
  login(input: LoginInput): Promise<AuthUser>
  /** Sign out. Safe to call when already signed out. */
  logout(): Promise<void>
  /** The current user, or null when there is no valid session. Never throws on 401. */
  me(): Promise<AuthUser | null>
  /**
   * Edit your own profile. Only name, email and password are editable --
   * roles and admin are server-controlled and the backend ignores them.
   */
  updateProfile(id: string, input: ProfileInput): Promise<AuthUser>
}

/** The editable part of a profile. Omitted fields are left alone. */
export interface ProfileInput {
  name?: string
  email?: string
  avatar_url?: string
  /** A new password. Requires `current_password` alongside it. */
  password?: string
  /** Proof you know the existing password; required to change it. */
  current_password?: string
}

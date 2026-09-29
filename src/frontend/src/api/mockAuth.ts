/**
 * Browser-only implementation of AuthApi, used until the backend ships
 * /api/auth/*. Accounts and the current session live in localStorage, so a
 * sign-in survives a refresh and every signed-in screen is fully demoable.
 *
 * Deliberately NOT a security boundary: passwords are compared in plain text
 * and anyone can edit localStorage. It exists so the UI can be built against a
 * real state machine. Swapped out automatically once VITE_API_URL is set.
 */
import type { AuthApi, AuthUser, LoginInput, ProfileInput, RegisterInput } from './auth'
import { ApiError } from './unwrap'

const USERS_KEY = 'verdikt-mock-users'
const SESSION_KEY = 'verdikt-mock-session'

/** The shared password for every seeded demo account. */
export const DEMO_PASSWORD = 'dogfood2026'

interface StoredUser extends AuthUser {
  password: string
}

/**
 * Seeded accounts, one per role, so role-gated UI can be checked without
 * touching a database. The ids mirror the mock event/track ids in ./mock.ts.
 */
const seed = (): StoredUser[] => [
  {
    id: 'usr-participant',
    email: 'participant@verdikt.dev',
    name: 'Ada Okafor',
    password: DEMO_PASSWORD,
    is_admin: false,
    participating_in: ['dogfood-2026'],
    judge_in: [],
    organiser_in: [],
  },
  {
    id: 'usr-judge',
    email: 'judge@verdikt.dev',
    name: 'Rafael Lindqvist',
    password: DEMO_PASSWORD,
    is_admin: false,
    participating_in: [],
    judge_in: ['judging', 'security'],
    organiser_in: [],
  },
  {
    id: 'usr-organizer',
    email: 'organizer@verdikt.dev',
    name: 'Mira Devarajan',
    password: DEMO_PASSWORD,
    is_admin: false,
    participating_in: [],
    judge_in: [],
    organiser_in: ['dogfood-2026'],
  },
]

/** localStorage throws in private mode and when site data is blocked. */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: the session simply won't survive a refresh.
  }
}

function loadUsers(): StoredUser[] {
  const users = read<StoredUser[]>(USERS_KEY, [])
  if (users.length > 0) return users
  const seeded = seed()
  write(USERS_KEY, seeded)
  return seeded
}

/** Strip the password before anything leaves this module. */
const publicUser = ({ password: _password, ...user }: StoredUser): AuthUser => user

/** Match the perceptible latency of a real request so loading states are real. */
const delay = <T,>(value: T, ms = 320) => new Promise<T>((r) => setTimeout(() => r(value), ms))

export const mockAuthApi: AuthApi = {
  async register({ email, password, name }: RegisterInput) {
    const users = loadUsers()
    const normalised = email.trim().toLowerCase()

    if (users.some((u) => u.email.toLowerCase() === normalised)) {
      // Mirrors UserService.createUser, which 409s on a duplicate email.
      throw new ApiError('Email already registered', 409, 'email')
    }

    const user: StoredUser = {
      id: `usr-${Date.now().toString(36)}`,
      email: normalised,
      name: name.trim(),
      password,
      is_admin: false,
      participating_in: [],
      judge_in: [],
      organiser_in: [],
    }

    write(USERS_KEY, [...users, user])
    write(SESSION_KEY, user.id)
    return delay(publicUser(user))
  },

  async updateProfile(id: string, input: ProfileInput) {
    const users = loadUsers()
    const found = users.find((u) => u.id === id)
    if (!found) throw new ApiError('User not found', 404)

    if (input.email !== undefined) {
      const normalised = input.email.trim().toLowerCase()
      if (!normalised) throw new ApiError('Email cannot be empty', 400, 'email')
      if (users.some((u) => u.id !== id && u.email.toLowerCase() === normalised)) {
        throw new ApiError('That email is already in use', 409, 'email')
      }
      found.email = normalised
    }
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new ApiError('Name cannot be empty', 400, 'name')
      found.name = input.name.trim()
    }
    if (input.password) found.password = input.password

    // Roles and is_admin are intentionally not touched: the real backend
    // allow-lists the same three fields.
    write(USERS_KEY, users)
    return delay(publicUser(found))
  },

  async login({ email, password }: LoginInput) {
    const users = loadUsers()
    const normalised = email.trim().toLowerCase()
    const found = users.find((u) => u.email.toLowerCase() === normalised && u.password === password)

    if (!found) {
      // One message for both wrong-email and wrong-password, so the form can't
      // be used to discover which addresses have accounts.
      throw new ApiError('Incorrect email or password', 401)
    }

    write(SESSION_KEY, found.id)
    return delay(publicUser(found))
  },

  async logout() {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      // Nothing stored; already signed out.
    }
    return delay(undefined, 120)
  },

  async me() {
    const id = read<string | null>(SESSION_KEY, null)
    if (!id) return delay(null, 80)
    const found = loadUsers().find((u) => u.id === id)
    return delay(found ? publicUser(found) : null, 80)
  },
}

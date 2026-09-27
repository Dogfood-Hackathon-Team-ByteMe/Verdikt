/**
 * The backend wraps every JSON response in { success, data, message }.
 * Everything that talks to it goes through here, so that envelope is stripped
 * in exactly one place and the rest of the app only ever sees `data`.
 */

/** Error carrying the HTTP status, so callers can branch on 401 vs 409 vs 500. */
export class ApiError extends Error {
  readonly status: number
  /** Set when the message clearly belongs against one form field. */
  readonly field?: string

  constructor(message: string, status: number, field?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
  }
}

interface Envelope<T> {
  success?: boolean
  data?: T
  message?: string
  error?: string
}

/**
 * Reads a fetch Response, unwraps the envelope and throws ApiError on failure.
 * Tolerates a bare (un-enveloped) body and an empty 204, so it keeps working
 * if the backend changes shape underneath us.
 */
export async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T

  let body: Envelope<T> | T | null = null
  try {
    body = (await res.json()) as Envelope<T> | T
  } catch {
    // Non-JSON body (an HTML error page, say) — fall through to the status check.
  }

  const envelope = (body ?? {}) as Envelope<T>

  if (!res.ok || envelope.success === false) {
    const message = envelope.message || envelope.error || `Request failed with ${res.status}`
    throw new ApiError(message, res.status, fieldFor(message, res.status))
  }

  // `data` is absent on a bare response; fall back to the whole body.
  return (envelope.data !== undefined ? envelope.data : (body as T)) as T
}

/**
 * Best-effort mapping from a backend message to the form field it concerns, so
 * the error lands under the right input instead of only in the banner.
 * Matches the messages UserService actually produces.
 */
function fieldFor(message: string, status: number): string | undefined {
  const m = message.toLowerCase()
  if (status === 409 || m.includes('already registered')) return 'email'
  if (m.includes('email')) return 'email'
  if (m.includes('password')) return 'password'
  return undefined
}

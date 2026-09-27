/**
 * Role resolution.
 *
 * Roles in this platform are per *event*, not global: the same person can
 * organise one event, judge a track in a second and compete in a third. So the
 * useful question is never "what is this user?" but "what is this user here?".
 *
 * One wrinkle from the data model: `judge_in` holds TRACK ids, while
 * `organiser_in` and `participating_in` hold EVENT ids. Deciding whether
 * someone judges a given event therefore needs that event's track ids, which
 * the caller passes in — the landing page already loads them on HackEvent.
 */
import type { AuthRole, AuthUser } from '../api/auth'

/**
 * The user's role for one event, highest first:
 * admin > organizer > judge > participant > visitor.
 *
 * @param eventTrackIds Track ids belonging to this event. Omit and the judge
 *   check is skipped — a judge then reads as participant or visitor, so only
 *   omit it where that distinction does not gate anything.
 */
export function roleFor(user: AuthUser | null, eventId: string, eventTrackIds: string[] = []): AuthRole {
  if (!user) return 'visitor'
  if (user.is_admin) return 'admin'
  if (user.organiser_in.includes(eventId)) return 'organizer'
  if (eventTrackIds.length > 0 && user.judge_in.some((trackId) => eventTrackIds.includes(trackId))) return 'judge'
  if (user.participating_in.includes(eventId)) return 'participant'
  return 'visitor'
}

/**
 * A coarse role across the whole platform, for chrome like the nav badge.
 * Never use it to gate anything event-specific — use roleFor() for that.
 */
export function primaryRole(user: AuthUser | null): AuthRole {
  if (!user) return 'visitor'
  if (user.is_admin) return 'admin'
  if (user.organiser_in.length > 0) return 'organizer'
  if (user.judge_in.length > 0) return 'judge'
  if (user.participating_in.length > 0) return 'participant'
  // Signed in but not yet attached to an event.
  return 'participant'
}

/** Initials for the avatar, from the name when there is one, else the email. */
export function initialsFor(user: AuthUser): string {
  const source = user.name?.trim() || user.email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0])
  return letters.join('').toUpperCase() || '?'
}

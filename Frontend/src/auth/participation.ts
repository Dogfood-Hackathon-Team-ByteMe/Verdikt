/**
 * Client-side mirror of backend/utils/eventRoles.js.
 *
 * This exists only so the UI can say "you cannot enter this event, and here is
 * why" before someone clicks, instead of letting them press Join and reading a
 * 403 back. The server is still the enforcement -- if the two ever disagree,
 * the server wins and the message it returns is what gets shown.
 *
 * Keep the two rule sets in step: the order of the checks here matches the
 * order there, so the reason strings line up.
 */
import type { AuthUser } from '../api/auth'
import type { HackEvent } from '../api/types'

/** The viewer's standing in one event, for labelling. */
export type EventStanding = 'admin' | 'organizer' | 'judge' | 'participant' | 'visitor'

export function standingIn(user: AuthUser | null | undefined, event: HackEvent): EventStanding {
  if (!user) return 'visitor'
  if (user.is_admin) return 'admin'
  if (user.organiser_in.includes(event.id)) return 'organizer'
  if (event.judge_ids.includes(user.id)) return 'judge'
  // judge_in holds TRACK ids, so compare against this event's tracks.
  if (event.tracks.some((t) => user.judge_in.includes(t.id))) return 'judge'
  if (user.participating_in.includes(event.id)) return 'participant'
  return 'visitor'
}

/**
 * Why this user may not compete in this event, or null if they may.
 * A signed-out visitor gets null: they are not blocked, they just need to sign
 * in first, which is a different message.
 */
export function participationBlockFor(
  user: AuthUser | null | undefined,
  event: HackEvent | null | undefined,
): string | null {
  if (!user || !event) return null

  switch (standingIn(user, event)) {
    case 'admin':
      return 'Admins cannot join teams or take part in events'
    case 'organizer':
      return 'Organisers cannot join a team in an event they are organising'
    case 'judge':
      return 'Judges cannot join a team in an event they are judging'
    default:
      return null
  }
}

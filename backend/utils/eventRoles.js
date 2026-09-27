/**
 * Who is allowed to compete in an event.
 *
 * The rule is "you cannot judge or run the contest you are entering", plus
 * "admins are staff, not entrants". It has to hold on every road into a team --
 * creating one, accepting an invite link, asking to join, being added directly
 * -- because a check attached to one of those only protects that one.
 *
 * Two shapes of "judge" exist in the data model and both count:
 *   - `event.judgeIds` holds USER ids (an event-level judge)
 *   - `user.judgeIn`   holds TRACK ids (a track-level judge)
 * A user who matches either one is judging the event.
 */

/** Ids from a ref array, whether the refs arrived raw or populated. */
export const idsOf = (refs) => (refs ?? []).map((ref) => (ref && ref._id ? ref._id : ref).toString());

/**
 * Roles are per event, never global -- `admin` is the only thing a person is
 * everywhere at once. Organising one hackathon does not make you an organiser
 * of somebody else's, so these always take the event in question.
 */
export const isOrganiserOf = (user, eventId) =>
	Boolean(user && eventId && idsOf(user.organiserIn).includes(eventId.toString()));

/** Event-level judge (event.judgeIds) or track-level judge (user.judgeIn). */
export const isJudgeOf = (user, event) => {
	if (!user || !event) return false;
	if (idsOf(event.judgeIds).includes(user._id.toString())) return true;
	const eventTrackIds = idsOf(event.tracks);
	return idsOf(user.judgeIn).some((trackId) => eventTrackIds.includes(trackId));
};

/**
 * Why this user may not compete in this event, or null if they may.
 *
 * Returns the reason rather than throwing so callers that only want to *show*
 * the restriction (an invite preview, a disabled button) can ask without
 * handling an exception.
 */
export const participationBlockFor = (user, event) => {
	if (!user || !event) return null;

	// Admins are platform staff. Letting one enter would put a person who can
	// edit any record after the deadline on a competing team.
	if (user.isAdmin) {
		return "Admins cannot join teams or take part in events";
	}

	const eventId = event._id.toString();

	if (idsOf(user.organiserIn).includes(eventId)) {
		return "Organisers cannot join a team in an event they are organising";
	}

	if (idsOf(event.judgeIds).includes(user._id.toString())) {
		return "Judges cannot join a team in an event they are judging";
	}

	// Track-level judges: judgeIn holds track ids, so compare against the
	// event's own tracks.
	const eventTrackIds = idsOf(event.tracks);
	if (idsOf(user.judgeIn).some((trackId) => eventTrackIds.includes(trackId))) {
		return "Judges cannot join a team in an event they are judging";
	}

	return null;
};

/** Throw 403 if this user may not compete in this event. */
export const assertCanParticipate = (user, event) => {
	const reason = participationBlockFor(user, event);
	if (reason) throw Object.assign(new Error(reason), { statusCode: 403 });
};

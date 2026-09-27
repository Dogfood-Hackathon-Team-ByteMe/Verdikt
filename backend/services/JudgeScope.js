/**
 * What a judge may score in an event.
 *
 * Being a judge of an event is not a licence to score everything in it. The
 * scope narrows in the order an organizer would expect:
 *
 *   1. assigned  The event has batch assignments, so a judge scores exactly
 *                the entries assigned to them. Nothing else, including other
 *                entries in their own track.
 *   2. tracks    No assignments yet, and the judge was appointed to specific
 *                tracks: entries in those tracks. An entry with no track
 *                belongs to no track, so any judge of the event may score it.
 *   3. all       A judge listed on the event with no track of theirs in it.
 *
 * Everyone else -- participants, organisers, admins, strangers -- gets `none`.
 * Admin status grants nothing here: admins are platform staff, not panel
 * members, and a ballot from someone who is not on the panel would quietly
 * become part of the result.
 *
 * Enforced where ballots are written (ScoreService) and where the judging queue
 * is read, so the page and the API cannot disagree about what a judge may open.
 */
import Assignment from "../models/Assignment.js";
import { idsOf, isJudgeOf } from "../utils/eventRoles.js";

const idOf = (ref) => String(ref?._id ?? ref ?? "");

export const scopeFor = async (user, event) => {
	if (!user || !event || !isJudgeOf(user, event)) return { mode: "none" };

	if (await Assignment.exists({ eventId: event._id })) {
		const mine = await Assignment.find({ eventId: event._id, judgeId: user._id }).distinct("projectId");
		return { mode: "assigned", projectIds: new Set(mine.map(String)) };
	}

	const eventTracks = idsOf(event.tracks);
	const myTracks = idsOf(user.judgeIn).filter((t) => eventTracks.includes(t));
	if (myTracks.length > 0) return { mode: "tracks", trackIds: new Set(myTracks) };

	return { mode: "all" };
};

export const inScope = (scope, project) => {
	switch (scope.mode) {
		case "all":
			return true;
		case "assigned":
			return scope.projectIds.has(idOf(project._id));
		case "tracks":
			return !project.trackId || scope.trackIds.has(idOf(project.trackId));
		default:
			return false;
	}
};

/** Why a project is out of scope, phrased for the judge who hit it. */
export const outOfScopeReason = (scope) =>
	scope.mode === "assigned"
		? "This entry is not in your judging batch"
		: scope.mode === "tracks"
			? "This entry is in a track you are not judging"
			: "You are not a judge for this event";

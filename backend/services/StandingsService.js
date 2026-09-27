/**
 * The live leaderboard for one event.
 *
 * Organizer-only, and scoped to the event they actually run -- the same rule as
 * reading ballots, for the same reason: standings are built out of every judge's
 * ballot, so anyone who can read them can infer what individual judges scored.
 * An organiser of event A must not be able to see event B's, and a judge must
 * not see the aggregate either, because with a couple of requests that reveals
 * their peers' opinions.
 *
 * Nothing is stored. See utils/standings.js for why, and utils/normalization.js
 * for how the normalized column is produced.
 */
import Assignment from "../models/Assignment.js";
import Event from "../models/Event.js";
import Project from "../models/Project.js";
import Score from "../models/Score.js";
// Registered here, not assumed: projects are populated with their team below.
import "../models/Team.js";
import Track from "../models/Track.js";
import User from "../models/User.js";
import { idsOf, isOrganiserOf } from "../utils/eventRoles.js";
import { METHODS, judgingProgress, rankProjects, scoreBallots, summariseProjects } from "../utils/standings.js";

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/** Load the event and assert the caller runs it. Shared with ExportService. */
export const loadEventAsOrganiser = async (eventId, requestingUser, what = "read its results") => {
	if (!eventId) throw fail("eventId is required", 400);

	const event = await Event.findById(eventId).populate("tracks");
	if (!event) throw fail("Event not found", 404);

	if (!requestingUser?.isAdmin && !isOrganiserOf(requestingUser, eventId)) {
		throw fail(`Only the organiser of this event can ${what}`, 403);
	}
	return event;
};

/** Everything the standings are computed from, loaded once. */
export const loadJudgingData = async (event) => {
	const eventId = event._id;

	// Only submitted entries. A draft is not in the running, and including one
	// would put a team on the leaderboard for work they have not handed in.
	const projects = await Project.find({ eventId, status: "submitted" })
		.populate("teamId", "name")
		.populate("trackId", "topic");

	const scores = await Score.find({ eventId });
	const assignments = await Assignment.find({ eventId });

	// The panel, from both places a judge can be listed: on the event, and on
	// one of its tracks -- plus anyone holding an assignment or a ballot, so a
	// judge removed mid-event still shows up next to the work they did.
	const trackJudgeIds = idsOf((await Track.find({ eventId }).select("judges")).flatMap((t) => t.judges ?? []));
	const judgeIds = [
		...new Set([
			...idsOf(event.judgeIds),
			...trackJudgeIds,
			...idsOf(assignments.map((a) => a.judgeId)),
			...idsOf(scores.map((s) => s.judgeId)),
		]),
	];
	const judges = await User.find({ _id: { $in: judgeIds } }).select("name email");

	return { projects, scores, assignments, judges };
};

export const getStandings = async (eventId, requestingUser, { method } = {}) => {
	if (method === undefined) method = "normalized";
	if (!METHODS.includes(method)) throw fail(`method must be one of: ${METHODS.join(", ")}`, 400);

	const event = await loadEventAsOrganiser(eventId, requestingUser);
	const { projects, scores, assignments, judges } = await loadJudgingData(event);

	const scored = scoreBallots({ projects, scores, criteria: event.criteria });
	const rows = rankProjects(
		summariseProjects({ projects, scores, criteria: event.criteria, assignments, scored }),
		method,
	);

	return {
		eventId: String(event._id),
		eventName: event.name,
		method,
		criteria: event.criteria,
		judgingClosed: Boolean(event.submissionsClose) && new Date() > new Date(event.submissionsClose),
		normalization: {
			// How many separately-comparable groups the panel splits into. More
			// than one means some judges never overlapped, and bias BETWEEN those
			// groups cannot be measured, only bias within each.
			groups: scored.groups ?? 0,
			correctedBallots: scored.ballots.filter((b) => b.corrected).length,
			ballots: scored.ballots.length,
		},
		standings: rows,
		progress: judgingProgress({ projects, scores, judges, assignments, scored }),
		computedAt: new Date().toISOString(),
	};
};

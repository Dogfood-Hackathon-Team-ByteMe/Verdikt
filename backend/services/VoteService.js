/**
 * Community voting.
 *
 * The rules are about who may NOT vote, because that is where a poll is won
 * dishonestly. Your own team cannot vote for its project; the event's judges
 * and organiser cannot vote at all in that event, because the people running
 * the official ranking must not also have a thumb on the popular one; and an
 * admin does not vote, for the same reason the referee does not. Everyone else
 * signed in gets exactly one vote per project, enforced by a unique index
 * rather than a check a race could slip past.
 *
 * Votes never touch standings. `summariseVotes` feeds a separate leaderboard,
 * and nothing in utils/standings.js knows this collection exists.
 */
import Vote from "../models/Vote.js";
import Event from "../models/Event.js";
import * as projectRepository from "../repositories/ProjectRepository.js";

const notFound = (what) => Object.assign(new Error(`${what} not found`), { statusCode: 404 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

/** The project, only if it is public. A draft cannot be voted on -- or probed for. */
const loadSubmitted = async (projectId) => {
	const project = await projectRepository.findById(projectId);
	// A draft answers exactly like a missing project on purpose: a 403 would
	// confirm to an outsider that the id exists.
	if (!project || project.status !== "submitted") throw notFound("Project");
	return project;
};

/** Why this user may not vote on this project, or null if they may. */
export const voteBlockFor = (project, event, user) => {
	if (user.isAdmin) return "Admins do not vote";

	if (event) {
		const uid = user._id.toString();
		if (user.organiserIn && user.organiserIn.some((id) => id.toString() === event._id.toString())) {
			return "The organiser of an event does not vote in it";
		}
		if (event.judgeIds && event.judgeIds.some((id) => id.toString() === uid)) {
			return "Judges of an event do not vote in it";
		}
	}

	const members = project.teamId && project.teamId.members;
	if (members && members.some((m) => (m._id ? m._id.toString() : m.toString()) === user._id.toString())) {
		return "You cannot vote for your own project";
	}

	return null;
};

export const castVote = async (projectId, requestingUser) => {
	const project = await loadSubmitted(projectId);
	const event = project.eventId ? await Event.findById(project.eventId) : null;

	const block = voteBlockFor(project, event, requestingUser);
	if (block) throw forbidden(block);

	try {
		await Vote.create({
			projectId: project._id,
			eventId: project.eventId,
			userId: requestingUser._id,
		});
	} catch (error) {
		// The unique index caught a second vote, simultaneous or not.
		if (error.code === 11000) throw conflict("You have already voted for this project");
		throw error;
	}
	return await countFor(project._id);
};

export const withdrawVote = async (projectId, requestingUser) => {
	const project = await loadSubmitted(projectId);
	const gone = await Vote.findOneAndDelete({ projectId: project._id, userId: requestingUser._id });
	if (!gone) throw notFound("Vote");
	return await countFor(project._id);
};

const countFor = async (projectId) => ({
	projectId,
	voteCount: await Vote.countDocuments({ projectId }),
});

/**
 * Vote counts for a batch of projects, plus whether this viewer voted for
 * each. One aggregation and one lookup, whatever the gallery's size.
 */
export const tallyFor = async (projectIds, user) => {
	if (projectIds.length === 0) return { counts: new Map(), mine: new Set() };

	const rows = await Vote.aggregate([
		{ $match: { projectId: { $in: projectIds } } },
		{ $group: { _id: "$projectId", count: { $sum: 1 } } },
	]);
	const counts = new Map(rows.map((r) => [r._id.toString(), r.count]));

	const mine = new Set();
	if (user) {
		const own = await Vote.find({ projectId: { $in: projectIds }, userId: user._id }, { projectId: 1 });
		for (const v of own) mine.add(v.projectId.toString());
	}
	return { counts, mine };
};

/**
 * The event's poll, ranked by votes. Public: it orders projects the public
 * gallery already shows, by a number the cards already carry.
 */
export const summariseVotes = async (eventId) => {
	const event = await Event.findById(eventId);
	if (!event) throw notFound("Event");

	const projects = await projectRepository.findByEventId(eventId);
	const submitted = projects.filter((p) => p.status === "submitted");
	const { counts } = await tallyFor(submitted.map((p) => p._id), null);

	const rows = submitted
		.map((p) => ({
			projectId: p._id,
			title: p.title,
			teamName: p.teamId?.name ?? null,
			track: p.trackId?.topic ?? null,
			voteCount: counts.get(p._id.toString()) ?? 0,
		}))
		.sort((a, b) => b.voteCount - a.voteCount || a.title.localeCompare(b.title));

	// Competition ranking, same convention as the judged standings: tied counts
	// share a rank and the next rank skips.
	let rank = 0;
	let prev = null;
	rows.forEach((row, index) => {
		if (row.voteCount !== prev) {
			rank = index + 1;
			prev = row.voteCount;
		}
		row.rank = rank;
	});

	return { eventId: event._id, totalVotes: rows.reduce((sum, r) => sum + r.voteCount, 0), standings: rows };
};

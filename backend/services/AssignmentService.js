/**
 * Batch assignment: deal the submitted entries out to the panel so that every
 * entry gets N independent reviews and no judge carries more than their share.
 *
 * The rules, in the order they bind:
 *
 *   1. Eligibility. A judge only ever receives entries from a track they were
 *      appointed to (or any entry, if they judge the event with no track), and
 *      never an entry from an event they compete in. Assignment does not widen
 *      what a judge may see -- it narrows it.
 *   2. Existing ballots are adopted, not stranded. A judge who already scored
 *      an entry they may still judge gets it assigned (source "ballot"), so
 *      turning on assignments never locks anyone out of a ballot they can
 *      still stand behind. A ballot on a track the judge has since been taken
 *      off is left as it is: it still counts, but is not handed back.
 *   3. Balance. Entries with the fewest eligible judges are dealt first (they
 *      have the least room to manoeuvre), and each goes to the eligible judges
 *      carrying the lightest load so far.
 *   4. Honesty about shortfall. If a track has fewer judges than the reviews
 *      asked for, those entries get every judge the track has and the gap is
 *      reported. The assigner does not borrow judges from other tracks to make
 *      the number up -- that would quietly break rule 1.
 *
 * Re-running tops up: existing assignments are kept and only the missing
 * reviews are dealt, so it is safe to run again after new entries arrive or
 * new judges join.
 */
import Assignment from "../models/Assignment.js";
import Event from "../models/Event.js";
import Project from "../models/Project.js";
import Score from "../models/Score.js";
import Track from "../models/Track.js";
import User from "../models/User.js";
import { idsOf, isOrganiserOf } from "../utils/eventRoles.js";
import { runInTransaction } from "../utils/transaction.js";
import { inScope, scopeFor } from "./JudgeScope.js";

export const MAX_REVIEWS = 10;

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const idOf = (ref) => String(ref?._id ?? ref ?? "");

const loadEventAsOrganiser = async (eventId, user) => {
	const event = await Event.findById(eventId).populate("tracks");
	if (!event) throw fail("Event not found", 404);
	if (!user.isAdmin && !isOrganiserOf(user, eventId)) {
		throw fail("Only the organiser of this event can manage judge assignments", 403);
	}
	return event;
};

/**
 * The panel, with the tracks each judge covers in this event.
 *
 * `tracks: null` means an event-wide judge. Anyone competing in or organising
 * the event is left out even if a stale record lists them -- appointment
 * already refuses those, this is the belt to that brace.
 */
const panelFor = async (event) => {
	const eventId = idOf(event._id);
	const eventTracks = idsOf(event.tracks);

	const trackJudgeIds = (await Track.find({ eventId }).select("judges")).flatMap((t) => idsOf(t.judges));
	const ids = [...new Set([...idsOf(event.judgeIds), ...trackJudgeIds])];
	const users = await User.find({ _id: { $in: ids } }).select("name email judgeIn participatingIn organiserIn");

	return users
		.filter((u) => !idsOf(u.participatingIn).includes(eventId) && !idsOf(u.organiserIn).includes(eventId))
		.map((u) => {
			const mine = idsOf(u.judgeIn).filter((t) => eventTracks.includes(t));
			return { id: idOf(u._id), name: u.name ?? null, email: u.email ?? null, tracks: mine.length ? new Set(mine) : null };
		});
};

const eligible = (judge, project) =>
	judge.tracks === null || !project.trackId || judge.tracks.has(idOf(project.trackId));

/**
 * Deal (or top up) the assignments for an event.
 *
 * Returns what happened, so the organiser sees the outcome rather than a bare
 * "done": how many were dealt, how many ballots were adopted, each judge's
 * load, and every entry left short of the reviews asked for, with the reason.
 */
export const autoAssign = async (eventId, { reviewsPerProject } = {}, user) => {
	const event = await loadEventAsOrganiser(eventId, user);

	const reviews = Number(reviewsPerProject);
	if (!Number.isInteger(reviews) || reviews < 1 || reviews > MAX_REVIEWS) {
		throw fail(`Reviews per entry must be a whole number from 1 to ${MAX_REVIEWS}`, 400);
	}

	const projects = await Project.find({ eventId, status: "submitted" }).populate("trackId", "topic").sort({ _id: 1 });
	const panel = await panelFor(event);
	if (panel.length === 0) throw fail("There are no judges on this event yet. Appoint some first.", 400);
	if (projects.length === 0) throw fail("Nothing has been submitted yet, so there is nothing to assign.", 400);

	const onPanel = new Map(panel.map((j) => [j.id, j]));
	const live = new Map(projects.map((p) => [idOf(p._id), p]));

	const existing = await Assignment.find({ eventId });
	const have = new Map(projects.map((p) => [idOf(p._id), new Set()]));
	const load = new Map(panel.map((j) => [j.id, 0]));
	for (const a of existing) {
		const p = idOf(a.projectId);
		const j = idOf(a.judgeId);
		if (!have.has(p)) continue;
		have.get(p).add(j);
		if (load.has(j)) load.set(j, load.get(j) + 1);
	}

	const toCreate = [];
	const add = (judgeId, projectId, source) => {
		have.get(projectId).add(judgeId);
		load.set(judgeId, (load.get(judgeId) ?? 0) + 1);
		toCreate.push({ eventId: event._id, judgeId, projectId, source, createdBy: user._id });
	};

	// Rule 2: adopt ballots already cast by judges still on the panel -- but
	// only where that judge may still judge the entry. A judge taken off a
	// track keeps the ballots they cast there (they count), yet must not have
	// the entries handed back by the next run of the assigner; adopting without
	// this check quietly undid the removal.
	let adopted = 0;
	for (const ballot of await Score.find({ eventId }).select("judgeId projectId")) {
		const p = idOf(ballot.projectId);
		const j = idOf(ballot.judgeId);
		if (!live.has(p) || !onPanel.has(j) || have.get(p).has(j)) continue;
		if (!eligible(onPanel.get(j), live.get(p))) continue;
		add(j, p, "ballot");
		adopted++;
	}

	// Rule 3: hardest entries first -- fewest eligible judges, then fewest
	// reviews so far -- with id as the final tie-break so a re-run with the same
	// inputs deals the same way.
	const order = projects
		.map((p) => ({ p, room: panel.filter((j) => eligible(j, p)).length }))
		.sort((a, b) => a.room - b.room || have.get(idOf(a.p._id)).size - have.get(idOf(b.p._id)).size || idOf(a.p._id).localeCompare(idOf(b.p._id)));

	let dealt = 0;
	for (const { p } of order) {
		const pid = idOf(p._id);
		const need = reviews - have.get(pid).size;
		if (need <= 0) continue;

		const candidates = panel
			.filter((j) => eligible(j, p) && !have.get(pid).has(j.id))
			.sort((a, b) => load.get(a.id) - load.get(b.id) || a.id.localeCompare(b.id));

		for (const judge of candidates.slice(0, need)) {
			add(judge.id, pid, "auto");
			dealt++;
		}
	}

	if (toCreate.length > 0) {
		await runInTransaction(async (session) => {
			await Assignment.insertMany(toCreate, { session });
		});
	}

	// Rule 4: say which entries fell short, and why.
	const shortfall = projects
		.filter((p) => have.get(idOf(p._id)).size < reviews)
		.map((p) => ({
			projectId: idOf(p._id),
			title: p.title,
			trackName: p.trackId?.topic ?? null,
			assigned: have.get(idOf(p._id)).size,
			wanted: reviews,
			eligibleJudges: panel.filter((j) => eligible(j, p)).length,
		}));

	return {
		reviewsPerProject: reviews,
		dealt,
		adopted,
		total: [...have.values()].reduce((n, s) => n + s.size, 0),
		shortfall,
		perJudge: panel
			.map((j) => ({ judgeId: j.id, name: j.name, email: j.email, assigned: load.get(j.id) ?? 0 }))
			.sort((a, b) => b.assigned - a.assigned || String(a.name).localeCompare(String(b.name))),
	};
};

/** Every assignment in the event, with whether the judge has scored it yet. */
export const listForEvent = async (eventId, user) => {
	await loadEventAsOrganiser(eventId, user);

	const assignments = await Assignment.find({ eventId })
		.populate("judgeId", "name email")
		.populate({ path: "projectId", select: "title trackId status", populate: { path: "trackId", select: "topic" } })
		.sort({ createdAt: 1 });

	const done = new Set((await Score.find({ eventId }).select("judgeId projectId")).map((s) => `${idOf(s.judgeId)}:${idOf(s.projectId)}`));

	return assignments.map((a) => ({
		_id: a._id,
		judgeId: idOf(a.judgeId),
		judgeName: a.judgeId?.name ?? null,
		judgeEmail: a.judgeId?.email ?? null,
		projectId: idOf(a.projectId),
		projectTitle: a.projectId?.title ?? null,
		trackName: a.projectId?.trackId?.topic ?? null,
		source: a.source,
		scored: done.has(`${idOf(a.judgeId)}:${idOf(a.projectId)}`),
		createdAt: a.createdAt,
	}));
};

/** Assign one entry to one judge by hand. Held to the same eligibility rules. */
export const addAssignment = async (eventId, { judgeId, projectId } = {}, user) => {
	const event = await loadEventAsOrganiser(eventId, user);

	const panel = await panelFor(event);
	const judge = panel.find((j) => j.id === String(judgeId));
	if (!judge) throw fail("That person is not on this event's judging panel", 400);

	const project = await Project.findOne({ _id: projectId, eventId });
	if (!project) throw fail("That entry is not part of this event", 400);
	if (project.status !== "submitted") throw fail("That entry has not been submitted yet", 400);

	// A hand assignment does not get to do what the batch assigner may not.
	// To have a judge look at another track, appoint them to that track.
	if (!eligible(judge, project)) {
		throw fail("That entry is in a track this judge was not appointed to", 409);
	}

	if (await Assignment.exists({ judgeId: judge.id, projectId: project._id })) {
		throw fail("That judge is already assigned to this entry", 409);
	}

	return await Assignment.create({ eventId: event._id, judgeId: judge.id, projectId: project._id, source: "manual", createdBy: user._id });
};

/**
 * Take one assignment back. Refused once the judge has scored it: their ballot
 * is part of the result, and unassigning would leave them unable to change a
 * ballot that still counts. Delete the ballot first if that is really intended.
 */
export const removeAssignment = async (assignmentId, user) => {
	const assignment = await Assignment.findById(assignmentId);
	if (!assignment) throw fail("Assignment not found", 404);
	await loadEventAsOrganiser(assignment.eventId, user);

	if (await Score.exists({ judgeId: assignment.judgeId, projectId: assignment.projectId })) {
		throw fail("That judge has already scored this entry, so it cannot be unassigned", 409);
	}

	await assignment.deleteOne();
};

/**
 * Drop every assignment for the event, and with it the batch scope: judges go
 * back to scoring by track. Ballots are untouched.
 */
export const clearAssignments = async (eventId, user) => {
	await loadEventAsOrganiser(eventId, user);
	const { deletedCount } = await Assignment.deleteMany({ eventId });
	return { removed: deletedCount };
};

/**
 * The judge's own queue: the submitted entries they may score in this event,
 * and which scoping rule produced it. The page shows this list verbatim, so the
 * queue a judge sees and the entries the API lets them score cannot disagree.
 */
export const queueFor = async (eventId, user) => {
	const event = await Event.findById(eventId).populate("tracks");
	if (!event) throw fail("Event not found", 404);

	const scope = await scopeFor(user, event);
	if (scope.mode === "none") throw fail("You are not a judge for this event", 403);

	const projects = await Project.find({ eventId, status: "submitted" })
		.populate("teamId", "name")
		.populate("trackId", "topic")
		.sort({ submittedAt: 1, _id: 1 });

	return { mode: scope.mode, projects: projects.filter((p) => inScope(scope, p)) };
};

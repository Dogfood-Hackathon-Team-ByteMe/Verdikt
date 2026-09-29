import * as scoreRepository from "../repositories/ScoreRepository.js";
import * as eventRepository from "../repositories/EventRepository.js";
import Project from "../models/Project.js";
import Track from "../models/Track.js";
import Event from "../models/Event.js";
import { isJudgeOf, isOrganiserOf } from "../utils/eventRoles.js";
import { validateBallot } from "../utils/rubric.js";
import { inScope, outOfScopeReason, scopeFor } from "./JudgeScope.js";
import * as webhookService from "./WebhookService.js";

/**
 * Tell the organizer's webhooks a ballot landed. Deliberately carries no
 * scores: the receiver learns that judging moved, not what anyone scored.
 */
const announceBallot = (eventId, projectId, judgeId) => {
	webhookService.dispatch(eventId, webhookService.TYPES.BALLOT_CAST, {
		projectId,
		judgeId,
	});
};

/**
 * Load the event a project belongs to, and assert this user may score it.
 *
 * Two questions, in order. Is this person on the panel at all (isJudgeOf, which
 * counts track-level judges as well as event-level ones)? And is THIS entry
 * inside what they were asked to judge (JudgeScope: their batch if the event
 * has assignments, otherwise their tracks)? The second is what stops a
 * security-track judge from quietly scoring the devtools entries.
 *
 * Admin status is not a pass. Admins are staff, not panel members, and a
 * ballot from off the panel would become part of the result unannounced.
 */
const assertMayScore = async (projectId, requestingUser) => {
	const project = await Project.findById(projectId);
	if (!project) throw Object.assign(new Error("Project not found"), { statusCode: 404 });

	// A draft is still being written. Scoring one would score something the
	// team has not handed in, and the number would silently go stale the next
	// time they saved.
	if (project.status !== "submitted") {
		throw Object.assign(new Error("This project has not been submitted yet"), { statusCode: 400 });
	}

	const event = await Event.findById(project.eventId).populate("tracks");
	if (!event) throw Object.assign(new Error("Event not found"), { statusCode: 404 });

	if (!isJudgeOf(requestingUser, event)) {
		throw Object.assign(new Error("You are not a judge for this event"), { statusCode: 403 });
	}

	const scope = await scopeFor(requestingUser, event);
	if (!inScope(scope, project)) {
		throw Object.assign(new Error(outOfScopeReason(scope)), { statusCode: 403 });
	}

	return { project, event };
};

export const createScore = async (data, requestingUser) => {
	if (!data.projectId)
		throw Object.assign(new Error("Project ID is required"), { statusCode: 400 });
	if (!data.scores || typeof data.scores !== "object")
		throw Object.assign(new Error("Scores object is required"), { statusCode: 400 });

	const { project, event } = await assertMayScore(data.projectId, requestingUser);

	// Force judgeId to be the requesting user — they cannot score on behalf of someone else
	data.judgeId = requestingUser._id;
	data.eventId = project.eventId;
	data.scores = validateBallot(data.scores, event.criteria);

	// Prevent duplicate scores
	const existing = await scoreRepository.findByJudgeAndProject(
		data.judgeId,
		data.projectId,
	);
	if (existing) {
		throw Object.assign(
			new Error("You have already scored this project. Use update instead."),
			{ statusCode: 409 },
		);
	}

	const created = await scoreRepository.create(data);
	announceBallot(project.eventId, project._id, requestingUser._id);
	return created;
};

/**
 * Create the ballot, or replace it if this judge already cast one.
 *
 * The judging screen has one Save button and no idea whether the ballot on
 * screen came from the server or from an empty form, so making it choose
 * between POST and PUT only invites a race where two saves land and the second
 * gets a 409 for a ballot the judge is looking at.
 */
export const upsertScore = async (data, requestingUser) => {
	if (!data.projectId)
		throw Object.assign(new Error("Project ID is required"), { statusCode: 400 });
	if (!data.scores || typeof data.scores !== "object")
		throw Object.assign(new Error("Scores object is required"), { statusCode: 400 });

	const { project, event } = await assertMayScore(data.projectId, requestingUser);
	const scores = validateBallot(data.scores, event.criteria);
	const comment = typeof data.comment === "string" ? data.comment : "";

	const existing = await scoreRepository.findByJudgeAndProject(
		requestingUser._id,
		data.projectId,
	);

	if (existing) {
		return await scoreRepository.update(existing._id, { scores, comment });
	}

	const created = await scoreRepository.create({
		judgeId: requestingUser._id,
		eventId: project.eventId,
		projectId: data.projectId,
		scores,
		comment,
	});
	announceBallot(project.eventId, project._id, requestingUser._id);
	return created;
};

export const getScoreById = async (id) => {
	const score = await scoreRepository.findById(id);
	if (!score)
		throw Object.assign(new Error("Score not found"), { statusCode: 404 });
	return score;
};

export const getScoresByJudge = async (judgeId) => {
	return await scoreRepository.findByJudgeId(judgeId);
};

export const getScoresByProject = async (projectId) => {
	return await scoreRepository.findByProjectId(projectId);
};

export const getAllScores = async (filter = {}) => {
	return await scoreRepository.findAll(filter);
};

export const updateScore = async (id, updateData, requestingUser) => {
	const score = await scoreRepository.findById(id);
	if (!score)
		throw Object.assign(new Error("Score not found"), { statusCode: 404 });

	// score.judgeId is populated (User doc), so use ._id
	if (score.judgeId._id.toString() !== requestingUser._id.toString()) {
		throw Object.assign(new Error("You can only update your own scores"), {
			statusCode: 403,
		});
	}

	// The same gate as casting a ballot, or PUT /api/scores/:id would be a way
	// round it: a judge moved off a track, or out of a batch, keeps the ballot
	// they already cast but can no longer rewrite it.
	await assertMayScore(score.projectId._id ?? score.projectId, requestingUser);

	// The rubric applies on the way in whichever verb the judge used, or a PUT
	// would be a way round the validation a POST just enforced.
	if (updateData.scores !== undefined) {
		const event = await Event.findById(score.eventId);
		updateData.scores = validateBallot(updateData.scores, event?.criteria ?? []);
	}

	// judgeId, eventId and projectId identify the ballot; letting an update
	// move any of them would turn "edit my score" into "write someone else's".
	const { judgeId, eventId, projectId, ...editable } = updateData;

	return await scoreRepository.update(id, editable);
};

// Issue #9: deleteScore isOrganizer was too permissive (any organizer of any event).
// Now: owner (judge who wrote it) OR admin OR organiser of the specific event
// that the scored project belongs to.
export const deleteScore = async (id, requestingUser) => {
	const score = await scoreRepository.findById(id);
	if (!score)
		throw Object.assign(new Error("Score not found"), { statusCode: 404 });

	if (requestingUser.isAdmin) {
		return await scoreRepository.deleteById(id);
	}

	// Is the requester the judge who wrote this score?
	const isOwner =
		score.judgeId._id.toString() === requestingUser._id.toString();
	if (isOwner) {
		return await scoreRepository.deleteById(id);
	}

	// Is the requester the organiser of the event this project belongs to?
	const project = await Project.findById(score.projectId._id || score.projectId);
	if (project && project.eventId) {
		const isOrganiserOfEvent =
			requestingUser.organiserIn &&
			requestingUser.organiserIn.some(
				(eventId) => eventId.toString() === project.eventId.toString(),
			);
		if (isOrganiserOfEvent) {
			return await scoreRepository.deleteById(id);
		}
	}

	throw Object.assign(
		new Error("You do not have permission to delete this score"),
		{ statusCode: 403 },
	);
};

export const searchScores = async (query, eventId, requestingUser) => {
	if (!eventId) throw Object.assign(new Error("eventId is required"), { statusCode: 400 });
	const filter = { eventId };
	const isAdmin = requestingUser.isAdmin;
	const isOrg = isOrganiserOf(requestingUser, eventId);

	if (!isAdmin && !isOrg) {
		// Judging some other event is not a credential here: the check is
		// against this event's own judges.
		const event = await Event.findById(eventId).populate('tracks');
		if (!isJudgeOf(requestingUser, event)) {
			throw Object.assign(new Error("Only admins, organizers, and judges can search scores"), { statusCode: 403 });
		}
		filter.judgeId = requestingUser._id;
	}
	return await scoreRepository.search(query, filter);
};

import * as scoreRepository from "../repositories/ScoreRepository.js";
import * as eventRepository from "../repositories/EventRepository.js";
import Project from "../models/Project.js";
import Track from "../models/Track.js";
import Event from "../models/Event.js";
import { isJudgeOf, isOrganiserOf } from "../utils/eventRoles.js";

export const createScore = async (data, requestingUser) => {
	if (!data.projectId)
		throw Object.assign(new Error("Project ID is required"), { statusCode: 400 });
	if (!data.scores || typeof data.scores !== "object")
		throw Object.assign(new Error("Scores object is required"), { statusCode: 400 });

	// Force judgeId to be the requesting user — they cannot score on behalf of someone else
	data.judgeId = requestingUser._id;

	const project = await Project.findById(data.projectId);
	data.eventId = project.eventId;

	const event = await eventRepository.findById(project.eventId);
	const isJudgeForEvent = event && event.judgeIds && event.judgeIds.some(id => id.toString() === requestingUser._id.toString());

	if (!isJudgeForEvent && !requestingUser.isAdmin) {
		throw Object.assign(new Error("You are not a judge for this event"), { statusCode: 403 });
	}

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

	return await scoreRepository.create(data);
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

	return await scoreRepository.update(id, updateData);
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

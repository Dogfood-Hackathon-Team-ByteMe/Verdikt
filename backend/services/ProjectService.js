/**
 * Project submission: drafts, edits, the deadline, and who may see what.
 *
 * Two T1 rules drive this file:
 *   - "Deadline enforcement that actually prevents submissions" -> every write
 *     re-reads the event and refuses once submissionsClose has passed.
 *   - "Public gallery with search and filter" -> submitted projects are world
 *     readable; drafts are not.
 */
import * as projectRepository from "../repositories/ProjectRepository.js";
import Event from "../models/Event.js";
import Team from "../models/Team.js";

/** Fields a client may set. Anything else in the body is ignored. */
const WRITABLE_FIELDS = [
	"title",
	"tagline",
	"summary",
	"description",
	"thumbnailUrl",
	"galleryUrls",
	"demoVideoUrl",
	"repoUrl",
	"codeRepoLink",
	"liveUrl",
	"ppts",
	"techTags",
	"trackId",
	"customAnswers",
];

/**
 * Copy only the allow-listed fields.
 *
 * Without this, a participant could PUT {"status":"submitted"} and skip the
 * deadline check in submitProject, or move their project to another team by
 * setting teamId. teamId/eventId/status/submittedAt are set by the server only.
 */
const pickWritable = (data = {}) => {
	const out = {};
	for (const key of WRITABLE_FIELDS) {
		if (data[key] !== undefined) out[key] = data[key];
	}
	// Keep the legacy field in step with the canonical one, so records written
	// through either name resolve the same way.
	if (out.repoUrl && !out.codeRepoLink) out.codeRepoLink = out.repoUrl;
	if (out.codeRepoLink && !out.repoUrl) out.repoUrl = out.codeRepoLink;
	return out;
};

const notFound = (what) => Object.assign(new Error(`${what} not found`), { statusCode: 404 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** True once the event's submission window has closed. */
const isClosed = (event) =>
	Boolean(event && event.submissionsClose && new Date() > new Date(event.submissionsClose));

/** Throw if the event's deadline has passed. `action` completes the message. */
const assertOpen = async (eventId, action) => {
	if (!eventId) return null;
	const event = await Event.findById(eventId);
	if (isClosed(event)) {
		throw forbidden(`Submissions are closed for this event, so you cannot ${action}`);
	}
	return event;
};

/** Is this user a member of the project's team? Handles populated and raw refs. */
const isTeamMember = (project, user) => {
	const members = project.teamId && project.teamId.members;
	if (!members) return false;
	return members.some((m) => (m._id ? m._id.toString() : m.toString()) === user._id.toString());
};

/**
 * Narrow a list of projects to what this viewer may see.
 *
 * A submitted project is public -- that is the whole point of a public gallery,
 * and T1 grades it. Drafts stay private to the team, the event's organiser,
 * its judges, and admins.
 *
 * (This previously returned [] for every anonymous viewer until the deadline
 * passed, which left the public gallery permanently empty.)
 */
const _filterVisibleProjects = async (projects, user) => {
	if (user && user.isAdmin) return projects;

	const eventIds = [...new Set(projects.map((p) => p.eventId?.toString()).filter(Boolean))];
	const events = await Event.find({ _id: { $in: eventIds } });
	const eventMap = new Map(events.map((e) => [e._id.toString(), e]));

	return projects.filter((project) => {
		// Submitted work is public, full stop.
		if (project.status === "submitted") return true;

		// Everything below is about drafts.
		if (!user) return false;

		const event = eventMap.get(project.eventId?.toString());
		if (event) {
			if (user.organiserIn && user.organiserIn.some((id) => id.toString() === event._id.toString())) return true;
			if (event.judgeIds && event.judgeIds.some((id) => id.toString() === user._id.toString())) return true;
		}

		return isTeamMember(project, user);
	});
};

export const createProject = async (data, requestingUser) => {
	if (!data.title) throw badRequest("Project title is required");
	if (!data.teamId) throw badRequest("Team ID is required");

	const team = await Team.findById(data.teamId);
	if (!team) throw notFound("Team");

	if (requestingUser && !requestingUser.isAdmin) {
		const isMember = team.members.some((m) => m.toString() === requestingUser._id.toString());
		if (!isMember) throw forbidden("Only team members can submit projects for their team");
	}

	// The event comes from the team, not the request body: a team cannot enter
	// a project into an event it is not part of.
	const eventId = team.eventId || data.eventId;
	await assertOpen(eventId, "create a project");

	// One project per team. Without this a team could submit several entries.
	const existing = await projectRepository.findByTeamId(data.teamId);
	if (existing.length > 0) {
		throw Object.assign(new Error("This team already has a project"), { statusCode: 409 });
	}

	return await projectRepository.create({
		...pickWritable(data),
		teamId: data.teamId,
		eventId,
		status: "draft",
	});
};

export const getProjectById = async (id, requestingUser) => {
	const project = await projectRepository.findById(id);
	if (!project) throw notFound("Project");
	const [visible] = await _filterVisibleProjects([project], requestingUser);
	if (!visible) throw forbidden("This project is still a draft");
	return project;
};

export const getAllProjects = async (filter = {}, requestingUser) => {
	const projects = await projectRepository.findAll(filter);
	return await _filterVisibleProjects(projects, requestingUser);
};

export const getProjectsByEventId = async (eventId, requestingUser) => {
	const projects = await projectRepository.findByEventId(eventId);
	return await _filterVisibleProjects(projects, requestingUser);
};

export const updateProject = async (id, updateData, requestingUser) => {
	const project = await projectRepository.findById(id);
	if (!project) throw notFound("Project");

	// Admins may correct a record after the deadline; nobody else may.
	if (!requestingUser.isAdmin) {
		await assertOpen(project.eventId, "edit this project");
		if (!isTeamMember(project, requestingUser)) {
			throw forbidden("Only team members can edit this project");
		}
	}

	return await projectRepository.update(id, pickWritable(updateData));
};

/**
 * Move a draft to `submitted`.
 *
 * Separate from updateProject so the deadline and the organizer's required
 * custom questions are checked at exactly the moment of submission.
 */
export const submitProject = async (id, requestingUser) => {
	const project = await projectRepository.findById(id);
	if (!project) throw notFound("Project");

	if (!requestingUser.isAdmin && !isTeamMember(project, requestingUser)) {
		throw forbidden("Only team members can submit this project");
	}

	const event = await assertOpen(project.eventId, "submit this project");

	if (!project.trackId) throw badRequest("Pick a track before submitting");
	if (!project.repoUrl && !project.codeRepoLink) throw badRequest("A repository URL is required before submitting");

	// Every question the organizer marked required must have a non-empty answer.
	for (const question of event?.customQuestions ?? []) {
		if (!question.required) continue;
		const answer = project.customAnswers?.get?.(question.key);
		if (!answer || !String(answer).trim()) {
			throw badRequest(`Answer required: ${question.label}`);
		}
	}

	if (project.status === "submitted") return project; // Submitting twice is a no-op.

	return await projectRepository.update(id, {
		status: "submitted",
		submittedAt: new Date(),
	});
};

/** Pull a submission back to draft, allowed only while the window is open. */
export const unsubmitProject = async (id, requestingUser) => {
	const project = await projectRepository.findById(id);
	if (!project) throw notFound("Project");

	if (!requestingUser.isAdmin) {
		await assertOpen(project.eventId, "withdraw this project");
		if (!isTeamMember(project, requestingUser)) {
			throw forbidden("Only team members can withdraw this project");
		}
	}

	return await projectRepository.update(id, { status: "draft", submittedAt: null });
};

export const deleteProject = async (id, requestingUser) => {
	const project = await projectRepository.findById(id);
	if (!project) throw notFound("Project");

	if (!requestingUser.isAdmin) {
		await assertOpen(project.eventId, "delete this project");
		const members = project.teamId && project.teamId.members;
		if (members && members.length > 0) {
			// The first member is the team leader by convention.
			const leaderId = members[0]._id ? members[0]._id.toString() : members[0].toString();
			if (leaderId !== requestingUser._id.toString()) {
				throw forbidden("Only the team leader can delete this project");
			}
		}
	}

	return await projectRepository.deleteById(id);
};

/**
 * Free-text search, used by the public gallery.
 *
 * Takes the same filters as getAllProjects so search and track filtering can
 * be combined in one request -- the gallery sends both together.
 */
export const searchProjects = async (query, filter = {}, requestingUser) => {
	const results = await projectRepository.search(query, filter);
	return await _filterVisibleProjects(results, requestingUser);
};

import * as projectService from "../services/ProjectService.js";
import * as voteService from "../services/VoteService.js";

/**
 * A project as the API answers it: the document plus its community tally.
 *
 * voteCount and hasVoted ride on every read rather than behind their own
 * endpoint, so the gallery does not need a second round trip per card. One
 * aggregation covers the whole list.
 */
const withVotes = async (projects, user) => {
	const list = Array.isArray(projects) ? projects : [projects];
	const { counts, mine } = await voteService.tallyFor(list.map((p) => p._id), user);
	const dressed = list.map((p) => ({
		...(p.toObject ? p.toObject() : p),
		voteCount: counts.get(p._id.toString()) ?? 0,
		hasVoted: mine.has(p._id.toString()),
	}));
	return Array.isArray(projects) ? dressed : dressed[0];
};

/**
 * Build the structural filter shared by the list and search endpoints.
 * `track` is accepted as an alias for `trackId` because that is what the
 * public gallery sends.
 */
const filterFromQuery = (query) => {
	const filter = {};
	const trackId = query.trackId || query.track;
	if (trackId) filter.trackId = trackId;
	if (query.eventId) filter.eventId = query.eventId;
	if (query.teamId) filter.teamId = query.teamId;
	if (query.status) filter.status = query.status;
	return filter;
};

export const create = async (req, res, next) => {
	try {
		const project = await projectService.createProject(req.body, req.user);
		res.status(201).json({
			success: true,
			data: project,
			message: "Project created successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getById = async (req, res, next) => {
	try {
		const project = await projectService.getProjectById(req.params.id, req.user);
		res.json({
			success: true,
			data: await withVotes(project, req.user),
			message: "Project retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

/**
 * The public gallery endpoint.
 *
 * Handles search and filtering together: `?q=` narrows by text while
 * `?track=`/`?eventId=`/`?status=` narrow structurally, so the gallery's search
 * box and track chips work in a single request.
 */
export const getAll = async (req, res, next) => {
	try {
		const filter = filterFromQuery(req.query);
		const q = req.query.q;

		const projects = q
			? await projectService.searchProjects(q, filter, req.user)
			: await projectService.getAllProjects(filter, req.user);

		res.json({
			success: true,
			data: await withVotes(projects, req.user),
			message: "Projects retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const update = async (req, res, next) => {
	try {
		const project = await projectService.updateProject(req.params.id, req.body, req.user);
		res.json({
			success: true,
			data: project,
			message: "Project updated successfully",
		});
	} catch (error) {
		next(error);
	}
};

/** Draft -> submitted. The deadline and required questions are checked here. */
export const submit = async (req, res, next) => {
	try {
		const project = await projectService.submitProject(req.params.id, req.user);
		res.json({
			success: true,
			data: project,
			message: "Project submitted successfully",
		});
	} catch (error) {
		next(error);
	}
};

/** Submitted -> draft, while the window is still open. */
export const unsubmit = async (req, res, next) => {
	try {
		const project = await projectService.unsubmitProject(req.params.id, req.user);
		res.json({
			success: true,
			data: project,
			message: "Project withdrawn to draft",
		});
	} catch (error) {
		next(error);
	}
};

export const deleteById = async (req, res, next) => {
	try {
		await projectService.deleteProject(req.params.id, req.user);
		res.json({
			success: true,
			data: null,
			message: "Project deleted successfully",
		});
	} catch (error) {
		next(error);
	}
};

/**
 * Kept for the existing /projects/search path. GET /projects?q= is the
 * preferred form because it composes with the other filters.
 */
export const search = async (req, res, next) => {
	try {
		const results = await projectService.searchProjects(req.query.q, filterFromQuery(req.query), req.user);
		res.json({ success: true, data: await withVotes(results, req.user), message: "Search results" });
	} catch (error) {
		next(error);
	}
};

/**
 * Comments on submitted projects.
 *
 * Reading is public, like the gallery the projects sit in. Writing needs an
 * account, and removal is either the author changing their mind or the
 * event's organiser moderating -- and the two leave different placeholders,
 * because "I deleted my comment" and "the organiser removed this" are
 * different facts and readers can tell the difference anyway.
 *
 * Organiser removals land in the audit trail. Author removals do not: taking
 * back your own words is not an exercise of power over anyone else.
 */
import Comment from "../models/Comment.js";
import * as projectRepository from "../repositories/ProjectRepository.js";
import * as webhookService from "./WebhookService.js";

const notFound = (what) => Object.assign(new Error(`${what} not found`), { statusCode: 404 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** Same closed door as voting: a draft answers like a missing project. */
const loadSubmitted = async (projectId) => {
	const project = await projectRepository.findById(projectId);
	if (!project || project.status !== "submitted") throw notFound("Project");
	return project;
};

/** What a reader is shown. A removed comment keeps its place, not its words. */
const publicShape = (comment) => ({
	_id: comment._id,
	projectId: comment.projectId,
	parentId: comment.parentId,
	author: comment.removedAt
		? null
		: comment.authorId && comment.authorId.name !== undefined
			? { _id: comment.authorId._id, name: comment.authorId.name }
			: { _id: comment.authorId },
	body: comment.removedAt
		? comment.removedBy === "organiser"
			? "[removed by the organiser]"
			: "[removed by its author]"
		: comment.body,
	removed: Boolean(comment.removedAt),
	createdAt: comment.createdAt,
});

export const listForProject = async (projectId) => {
	await loadSubmitted(projectId);
	const rows = await Comment.find({ projectId }).sort({ createdAt: 1 }).populate("authorId", "name");
	return rows.map(publicShape);
};

export const addComment = async (projectId, { body, parentId } = {}, requestingUser) => {
	const project = await loadSubmitted(projectId);

	const text = typeof body === "string" ? body.trim() : "";
	if (!text) throw badRequest("A comment needs some words in it");
	if (text.length > 2000) throw badRequest("Comments are capped at 2000 characters");

	let parent = null;
	if (parentId) {
		parent = await Comment.findById(parentId);
		// The parent must be a top-level comment on THIS project. A reply to a
		// reply is refused (threads are one level), and a parent from another
		// project would let a comment appear under work its author never saw.
		if (!parent || parent.projectId.toString() !== project._id.toString()) {
			throw badRequest("That comment is not on this project");
		}
		if (parent.parentId) throw badRequest("Replies cannot be replied to; reply to the top comment instead");
	}

	const made = await Comment.create({
		projectId: project._id,
		eventId: project.eventId,
		authorId: requestingUser._id,
		body: text,
		parentId: parent ? parent._id : null,
	});
	webhookService.dispatch(project.eventId, webhookService.TYPES.COMMENT_CREATED, {
		projectId: project._id,
		commentId: made._id,
		author: requestingUser.name,
	});
	return publicShape(await made.populate("authorId", "name"));
};

/**
 * Remove a comment. Returns who removed it ("author" or "organiser") so the
 * controller can decide whether the act belongs in the audit trail.
 */
export const removeComment = async (commentId, requestingUser) => {
	const comment = await Comment.findById(commentId);
	if (!comment || comment.removedAt) throw notFound("Comment");

	const isAuthor = comment.authorId.toString() === requestingUser._id.toString();
	const isOrganiser =
		requestingUser.isAdmin ||
		(requestingUser.organiserIn &&
			requestingUser.organiserIn.some((id) => id.toString() === comment.eventId.toString()));

	if (!isAuthor && !isOrganiser) {
		throw forbidden("Only the comment's author or the event's organiser can remove it");
	}

	// The author's own removal reads as theirs even if they also organise.
	const removedBy = isAuthor ? "author" : "organiser";
	comment.removedAt = new Date();
	comment.removedBy = removedBy;
	await comment.save();

	return { comment, removedBy };
};

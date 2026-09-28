import * as commentService from "../services/CommentService.js";
import * as auditService from "../services/AuditService.js";
import { ACTIONS } from "../services/AuditService.js";

export const list = async (req, res, next) => {
	try {
		const comments = await commentService.listForProject(req.params.id);
		res.json({ success: true, data: comments });
	} catch (error) {
		next(error);
	}
};

export const add = async (req, res, next) => {
	try {
		const comment = await commentService.addComment(req.params.id, req.body, req.user);
		res.status(201).json({ success: true, data: comment, message: "Comment posted" });
	} catch (error) {
		next(error);
	}
};

export const remove = async (req, res, next) => {
	try {
		const { comment, removedBy } = await commentService.removeComment(req.params.id, req.user);
		// Moderation is an exercise of power over someone else's words, so it
		// goes in the trail. An author deleting their own comment does not.
		if (removedBy === "organiser") {
			await auditService.record(req, ACTIONS.COMMENT_REMOVED, {
				eventId: comment.eventId,
				targetType: "Comment",
				targetId: comment._id,
				meta: { projectId: String(comment.projectId), authorId: String(comment.authorId) },
			});
		}
		res.json({ success: true, data: null, message: "Comment removed" });
	} catch (error) {
		next(error);
	}
};

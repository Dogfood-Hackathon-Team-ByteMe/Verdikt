/**
 * Writing and reading the audit trail.
 *
 * `record` never throws. An audit write failing must not roll back the action
 * it describes -- refusing to appoint a judge because the log was unavailable
 * would turn a logging fault into an outage. The cost is that the trail can
 * have holes, which is the right trade for a hackathon platform and the wrong
 * one for a bank; the failure is logged loudly so the holes are not silent.
 */
import AuditLog from "../models/AuditLog.js";
import * as eventRepository from "../repositories/EventRepository.js";

/**
 * The actions worth keeping. Named as constants so a typo is a crash at import
 * rather than a row nobody can find later.
 */
export const ACTIONS = {
	LOGIN_FAILED: "auth.login.failed",
	LOGIN_BLOCKED: "auth.login.blocked",
	EVENT_UPDATED: "event.updated",
	JUDGE_APPOINTED: "judge.appointed",
	JUDGE_REMOVED: "judge.removed",
	APPLICATION_ACCEPTED: "application.accepted",
	APPLICATION_REJECTED: "application.rejected",
	INVITE_CREATED: "judge_invite.created",
	INVITE_REVOKED: "judge_invite.revoked",
	ASSIGNMENTS_DEALT: "assignments.dealt",
	ASSIGNMENTS_CLEARED: "assignments.cleared",
	COMMENT_REMOVED: "comment.removed",
};

/** The address the request came from, as app.js's proxy setting resolves it. */
const ipOf = (req) => (req ? req.ip || req.socket?.remoteAddress || null : null);

export const record = async (req, action, details = {}) => {
	try {
		await AuditLog.create({
			actorId: details.actorId ?? req?.user?._id ?? null,
			action,
			eventId: details.eventId ?? null,
			targetType: details.targetType ?? null,
			targetId: details.targetId ?? null,
			ip: ipOf(req),
			meta: details.meta ?? {},
		});
	} catch (error) {
		console.error(`audit: failed to record ${action}:`, error.message);
	}
};

/**
 * One event's trail, newest first.
 *
 * Organiser-or-admin, the same rule the event's other organiser-only reads
 * use. A judge must not read it: it names every other judge on the panel and
 * when each was appointed.
 */
export const listForEvent = async (eventId, requestingUser, { limit = 200 } = {}) => {
	const event = await eventRepository.findById(eventId);
	if (!event) throw Object.assign(new Error("Event not found"), { statusCode: 404 });

	const isOrganiser =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some((id) => id.toString() === eventId.toString());

	if (!isOrganiser && !requestingUser.isAdmin) {
		throw Object.assign(new Error("Only the event organiser can read this event's audit trail"), {
			statusCode: 403,
		});
	}

	return await AuditLog.find({ eventId })
		.sort({ createdAt: -1 })
		.limit(Math.min(Number(limit) || 200, 500))
		.populate("actorId", "name email");
};

/** The whole trail, including rows that belong to no event. Admin only. */
export const listAll = async (requestingUser, { limit = 200 } = {}) => {
	if (!requestingUser.isAdmin) {
		throw Object.assign(new Error("Only an admin can read the full audit trail"), { statusCode: 403 });
	}
	return await AuditLog.find({})
		.sort({ createdAt: -1 })
		.limit(Math.min(Number(limit) || 200, 500))
		.populate("actorId", "name email");
};

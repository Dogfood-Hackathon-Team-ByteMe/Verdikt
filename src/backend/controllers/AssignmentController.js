import * as assignmentService from "../services/AssignmentService.js";
import * as auditService from "../services/AuditService.js";
import { ACTIONS } from "../services/AuditService.js";

const handle = (work, { status = 200, message, audit } = {}) => async (req, res, next) => {
	try {
		const data = await work(req);
		// Recorded after the work succeeds, so the trail never claims something
		// that was actually refused.
		if (audit) await auditService.record(req, audit.action, audit.details(req, data));
		res.status(status).json({ success: true, data: data ?? null, message });
	} catch (error) {
		next(error);
	}
};

export const autoAssign = handle(
	(req) => assignmentService.autoAssign(req.params.id, req.body, req.user),
	{
		message: "Assignments dealt",
		audit: {
			action: ACTIONS.ASSIGNMENTS_DEALT,
			details: (req, run) => ({
				eventId: req.params.id,
				meta: { reviewsPerProject: run?.reviewsPerProject, created: run?.created, shortfall: run?.shortfall?.length ?? 0 },
			}),
		},
	},
);

export const list = handle((req) => assignmentService.listForEvent(req.params.id, req.user));

export const add = handle(
	(req) => assignmentService.addAssignment(req.params.id, req.body, req.user),
	{ status: 201, message: "Assignment added" },
);

export const remove = handle(
	(req) => assignmentService.removeAssignment(req.params.id, req.user),
	{ message: "Assignment removed" },
);

export const clear = handle(
	(req) => assignmentService.clearAssignments(req.params.id, req.user),
	{
		message: "Assignments cleared",
		audit: { action: ACTIONS.ASSIGNMENTS_CLEARED, details: (req) => ({ eventId: req.params.id }) },
	},
);

export const queue = handle((req) => assignmentService.queueFor(req.query.eventId, req.user));

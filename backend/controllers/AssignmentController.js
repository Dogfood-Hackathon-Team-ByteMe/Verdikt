import * as assignmentService from "../services/AssignmentService.js";

const handle = (work, { status = 200, message } = {}) => async (req, res, next) => {
	try {
		const data = await work(req);
		res.status(status).json({ success: true, data: data ?? null, message });
	} catch (error) {
		next(error);
	}
};

export const autoAssign = handle(
	(req) => assignmentService.autoAssign(req.params.id, req.body, req.user),
	{ message: "Assignments dealt" },
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
	{ message: "Assignments cleared" },
);

export const queue = handle((req) => assignmentService.queueFor(req.query.eventId, req.user));

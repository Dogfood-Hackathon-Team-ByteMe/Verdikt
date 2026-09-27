import * as judgeInviteService from "../services/JudgeInviteService.js";

const handle = (work, { status = 200, message } = {}) => async (req, res, next) => {
	try {
		const data = await work(req);
		res.status(status).json({ success: true, data: data ?? null, message });
	} catch (error) {
		next(error);
	}
};

export const create = handle(
	(req) => judgeInviteService.createInvite(req.params.id, req.body.email, req.user),
	{ status: 201, message: "Invite created" },
);

export const listForTrack = handle((req) => judgeInviteService.listForTrack(req.params.id, req.user));

export const revoke = handle(
	(req) => judgeInviteService.revokeInvite(req.params.id, req.user),
	{ message: "Invite withdrawn" },
);

export const preview = handle((req) => judgeInviteService.previewInvite(req.params.token));

export const accept = handle(
	(req) => judgeInviteService.acceptInvite(req.params.token, req.user),
	{ message: "You are now a judge on this track" },
);

import * as judgeInviteService from "../services/JudgeInviteService.js";
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

export const create = handle(
	(req) => judgeInviteService.createInvite(req.params.id, req.body.email, req.user),
	{
		status: 201,
		message: "Invite created",
		audit: {
			action: ACTIONS.INVITE_CREATED,
			details: (req, invite) => ({
				eventId: invite?.eventId ?? null,
				targetType: "JudgeInvite",
				targetId: invite?._id,
				meta: { email: req.body?.email, trackId: req.params.id },
			}),
		},
	},
);

export const listForTrack = handle((req) => judgeInviteService.listForTrack(req.params.id, req.user));

export const revoke = handle(
	(req) => judgeInviteService.revokeInvite(req.params.id, req.user),
	{
		message: "Invite withdrawn",
		audit: {
			action: ACTIONS.INVITE_REVOKED,
			details: (req, invite) => ({
				eventId: invite?.eventId ?? null,
				targetType: "JudgeInvite",
				targetId: req.params.id,
			}),
		},
	},
);

export const preview = handle((req) => judgeInviteService.previewInvite(req.params.token));

export const accept = handle(
	(req) => judgeInviteService.acceptInvite(req.params.token, req.user),
	{ message: "You are now a judge on this track" },
);

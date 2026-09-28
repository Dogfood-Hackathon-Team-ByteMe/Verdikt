import * as auditService from "../services/AuditService.js";

export const listForEvent = async (req, res, next) => {
	try {
		const rows = await auditService.listForEvent(req.params.id, req.user, { limit: req.query.limit });
		res.json({ success: true, data: rows });
	} catch (error) {
		next(error);
	}
};

export const listAll = async (req, res, next) => {
	try {
		const rows = await auditService.listAll(req.user, { limit: req.query.limit });
		res.json({ success: true, data: rows });
	} catch (error) {
		next(error);
	}
};

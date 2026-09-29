import * as portabilityService from "../services/PortabilityService.js";

export const exportEvent = async (req, res, next) => {
	try {
		const bundle = await portabilityService.exportEvent(req.params.id, req.user);
		res.setHeader("Content-Disposition", `attachment; filename="verdikt-event-${req.params.id}.json"`);
		res.json(bundle);
	} catch (error) {
		next(error);
	}
};

export const importEvent = async (req, res, next) => {
	try {
		const summary = await portabilityService.importEvent(req.body, req.user);
		res.status(201).json({ success: true, data: summary, message: "Event imported" });
	} catch (error) {
		next(error);
	}
};

import * as resultService from "../services/ResultService.js";

export const create = async (req, res, next) => {
	try {
		const result = await resultService.createResult(req.body, req.user);
		res.status(201).json({
			success: true,
			data: result,
			message: "Result published successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getById = async (req, res, next) => {
	try {
		const result = await resultService.getResultById(req.params.id);
		res.json({
			success: true,
			data: result,
			message: "Result retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getAll = async (req, res, next) => {
	try {
		const filter = {};
		if (req.query.eventId) filter.eventId = req.query.eventId;
		if (req.query.trackId) filter.trackId = req.query.trackId;
		if (req.query.projectId) filter.projectId = req.query.projectId;

		const results = await resultService.getAllResults(filter);
		res.json({
			success: true,
			data: results,
			message: "Results retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const update = async (req, res, next) => {
	try {
		const result = await resultService.updateResult(
			req.params.id,
			req.body,
			req.user,
		);
		res.json({
			success: true,
			data: result,
			message: "Result updated successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const deleteById = async (req, res, next) => {
	try {
		await resultService.deleteResult(req.params.id, req.user);
		res.json({
			success: true,
			data: null,
			message: "Result deleted successfully",
		});
	} catch (error) {
		next(error);
	}
};

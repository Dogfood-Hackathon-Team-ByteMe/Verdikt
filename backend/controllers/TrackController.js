import * as trackService from "../services/TrackService.js";

export const create = async (req, res, next) => {
	try {
		const track = await trackService.createTrack(req.body, req.user);
		res.status(201).json({
			success: true,
			data: track,
			message: "Track created successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getById = async (req, res, next) => {
	try {
		const track = await trackService.getTrackById(req.params.id);
		res.json({
			success: true,
			data: track,
			message: "Track retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getAll = async (req, res, next) => {
	try {
		const filter = {};
		if (req.query.eventId) filter.eventId = req.query.eventId;
		const tracks = await trackService.getAllTracks(filter);
		res.json({
			success: true,
			data: tracks,
			message: "Tracks retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const update = async (req, res, next) => {
	try {
		const track = await trackService.updateTrack(
			req.params.id,
			req.body,
			req.user,
		);
		res.json({
			success: true,
			data: track,
			message: "Track updated successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const deleteById = async (req, res, next) => {
	try {
		await trackService.deleteTrack(req.params.id, req.user);
		res.json({
			success: true,
			data: null,
			message: "Track deleted successfully",
		});
	} catch (error) {
		next(error);
	}
};

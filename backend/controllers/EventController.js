import * as eventService from "../services/EventService.js";

export const create = async (req, res, next) => {
	try {
		const event = await eventService.createEvent(req.body, req.user);
		res.status(201).json({
			success: true,
			data: event,
			message: "Event created successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getById = async (req, res, next) => {
	try {
		const event = await eventService.getEventById(req.params.id);
		res.json({
			success: true,
			data: event,
			message: "Event retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

/**
 * The event the public landing page renders. Public: no auth, no session.
 */
export const getFeatured = async (req, res, next) => {
	try {
		const event = await eventService.getFeaturedEvent();
		res.json({
			success: true,
			data: event,
			message: "Featured event retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getAll = async (req, res, next) => {
	try {
		const events = await eventService.getAllEvents();
		res.json({
			success: true,
			data: events,
			message: "Events retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const update = async (req, res, next) => {
	try {
		const updated = await eventService.updateEvent(
			req.params.id,
			req.body,
			req.user,
		);
		res.json({
			success: true,
			data: updated,
			message: "Event updated successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const deleteById = async (req, res, next) => {
	try {
		await eventService.deleteEvent(req.params.id, req.user);
		res.json({
			success: true,
			data: null,
			message: "Event deleted successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const search = async (req, res, next) => {
	try {
		const tags = req.query.tags ? req.query.tags.split(',') : [];
		const events = await eventService.searchEventsByTags(tags);
		res.json({ success: true, data: events });
	} catch (error) { next(error); }
};

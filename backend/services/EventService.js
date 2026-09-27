import { runInTransaction } from '../utils/transaction.js';
import * as eventRepository from "../repositories/EventRepository.js";
import * as userRepository from "../repositories/UserRepository.js";

// Helper: check if requestingUser is the organiser of a specific event.
// Uses the User's organiserIn array — the single source of truth.
// isAdmin always passes.
const assertIsOrganiserOrAdmin = (requestingUser, eventId, action = "perform this action on") => {
	if (requestingUser.isAdmin) return;

	const isOrganiser =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(id) => id.toString() === eventId.toString(),
		);

	if (!isOrganiser) {
		throw Object.assign(
			new Error(`Only the event organiser can ${action} this event`),
			{ statusCode: 403 },
		);
	}
};

// ─── Issue #23: createEvent ──────────────────────────────────────────────────
export const createEvent = async (data, requestingUser) => {
	// Required fields
	if (!data.name || !data.name.trim())
		throw Object.assign(new Error("Event name is required"), { statusCode: 400 });

	if (!data.description || !data.description.trim())
		throw Object.assign(new Error("Event description is required"), { statusCode: 400 });

	if (!data.submissionsClose)
		throw Object.assign(new Error("submissionsClose is required"), { statusCode: 400 });

	const closeDate = new Date(data.submissionsClose);
	if (isNaN(closeDate.getTime()))
		throw Object.assign(new Error("submissionsClose must be a valid date"), { statusCode: 400 });
	if (closeDate <= new Date())
		throw Object.assign(new Error("submissionsClose must be in the future"), { statusCode: 400 });
	data.submissionsClose = closeDate;

	// Attach organiser
	if (requestingUser && !requestingUser.isAdmin) {
		data.organiserId = requestingUser._id;
	}

	return await runInTransaction(async (session) => {
		const event = await eventRepository.create(data, session);
		if (requestingUser) {
			await userRepository.addOrganiserIn(requestingUser._id, event._id, session);
		}
		return event;
	});
};

export const getEventById = async (id) => {
	const event = await eventRepository.findById(id);
	if (!event)
		throw Object.assign(new Error("Event not found"), { statusCode: 404 });
	return event;
};

export const getAllEvents = async (filter = {}) => {
	return await eventRepository.findAll(filter);
};

/**
 * The event the public landing page features.
 *
 * Prefers the one explicitly flagged isFeatured. Falls back to the event whose
 * submission window is closest to closing but still open, and finally to the
 * most recently created one, so a fresh install always has something to show.
 */
export const getFeaturedEvent = async () => {
	const flagged = await eventRepository.findOne({ isFeatured: true });
	if (flagged) return flagged;

	const open = await eventRepository.findAll({ submissionsClose: { $gt: new Date() } });
	if (open.length > 0) {
		open.sort((a, b) => new Date(a.submissionsClose) - new Date(b.submissionsClose));
		return open[0];
	}

	const all = await eventRepository.findAll({});
	if (all.length === 0) throw Object.assign(new Error("No events exist yet"), { statusCode: 404 });
	all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
	return all[0];
};

// ─── Issue #24: updateEvent — single clean ownership check ──────────────────
export const updateEvent = async (id, updateData, requestingUser) => {
	const event = await eventRepository.findById(id);
	if (!event)
		throw Object.assign(new Error("Event not found"), { statusCode: 404 });

	assertIsOrganiserOrAdmin(requestingUser, id, "update");

	// Validate submissionsClose if being updated
	if (updateData.submissionsClose !== undefined && updateData.submissionsClose !== null && updateData.submissionsClose !== "") {
		const closeDate = new Date(updateData.submissionsClose);
		if (isNaN(closeDate.getTime()))
			throw Object.assign(new Error("submissionsClose must be a valid date"), { statusCode: 400 });
		updateData.submissionsClose = closeDate;
	}

	return await eventRepository.update(id, updateData);
};

// ─── Issue #24: deleteEvent — single clean ownership check ──────────────────
export const deleteEvent = async (id, requestingUser) => {
	const event = await eventRepository.findById(id);
	if (!event)
		throw Object.assign(new Error("Event not found"), { statusCode: 404 });

	assertIsOrganiserOrAdmin(requestingUser, id, "delete");

	await runInTransaction(async (session) => {
		await eventRepository.deleteById(id, session);
		if (event.organiserId) {
			const organiserId = event.organiserId._id || event.organiserId;
			await userRepository.removeOrganiserIn(organiserId, id, session);
		}
	});
};

export const isSubmissionsClosed = async (eventId) => {
	const event = await eventRepository.findById(eventId);
	if (!event)
		throw Object.assign(new Error("Event not found"), { statusCode: 404 });
	if (!event.submissionsClose) return false;
	return new Date() > new Date(event.submissionsClose);
};

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

/**
 * What an organiser may write on their own event.
 *
 * `req.body` used to reach findByIdAndUpdate whole, which let an organiser set
 * organiserId (handing their event to someone else, or taking one), judgeIds
 * (appointing judges around the track flow) and isFeatured (pinning their own
 * event to the public landing page). Same class of hole as BUG-8 on profiles,
 * so it gets the same treatment: name the writable fields, ignore the rest.
 *
 * `tracks` is absent on purpose -- tracks are created and deleted through their
 * own endpoints, which keep Track.eventId and Event.tracks in step.
 */
const EVENT_FIELDS = [
	"name",
	"description",
	"tagline",
	"startsAt",
	"submissionsClose",
	"prizes",
	"customQuestions",
	"criteria",
	"eventTags",
	"minTeamSize",
	"maxTeamSize",
	"bannerUrl",
	"isJudgeApplyOpen",
];

const pickEventFields = (data = {}) => {
	const out = {};
	for (const field of EVENT_FIELDS) {
		if (data[field] !== undefined) out[field] = data[field];
	}
	return out;
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

	if (data.criteria !== undefined) data.criteria = normaliseCriteria(data.criteria);

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

/**
 * Clean a rubric coming off the organiser's form.
 *
 * Rows the organiser started and abandoned (no key, or no label) are dropped
 * rather than rejected -- the form always sends its whole list, and an empty
 * trailing row is a normal thing to leave behind. A duplicate key is refused,
 * though, because Score.scores is keyed by it and the second line would
 * silently overwrite the first on every ballot.
 */
const normaliseCriteria = (rows) => {
	if (!Array.isArray(rows)) throw Object.assign(new Error("criteria must be a list"), { statusCode: 400 });

	const cleaned = rows
		.filter((row) => row && typeof row.key === "string" && typeof row.label === "string")
		.map((row) => ({
			key: row.key.trim(),
			label: row.label.trim(),
			description: typeof row.description === "string" ? row.description.trim() : undefined,
			weight: Number.isFinite(Number(row.weight)) ? Math.max(0, Number(row.weight)) : 1,
			maxScore: Number.isFinite(Number(row.maxScore)) ? Math.max(1, Number(row.maxScore)) : 5,
		}))
		.filter((row) => row.key && row.label);

	const seen = new Set();
	for (const row of cleaned) {
		if (seen.has(row.key)) {
			throw Object.assign(new Error(`Duplicate criterion key "${row.key}"`), { statusCode: 400 });
		}
		seen.add(row.key);
	}

	return cleaned;
};

// ─── Issue #24: updateEvent — single clean ownership check ──────────────────
export const updateEvent = async (id, updateData, requestingUser) => {
	const event = await eventRepository.findById(id);
	if (!event)
		throw Object.assign(new Error("Event not found"), { statusCode: 404 });

	assertIsOrganiserOrAdmin(requestingUser, id, "update");

	const patch = pickEventFields(updateData);

	// Validate submissionsClose if being updated
	if (patch.submissionsClose !== undefined && patch.submissionsClose !== null && patch.submissionsClose !== "") {
		const closeDate = new Date(patch.submissionsClose);
		if (isNaN(closeDate.getTime()))
			throw Object.assign(new Error("submissionsClose must be a valid date"), { statusCode: 400 });
		patch.submissionsClose = closeDate;
	}

	if (patch.criteria !== undefined) patch.criteria = normaliseCriteria(patch.criteria);

	// Only an admin decides which event the landing page features; an organiser
	// setting it on their own event is them choosing to be the front page.
	if (requestingUser.isAdmin && updateData.isFeatured !== undefined) {
		patch.isFeatured = updateData.isFeatured;
	}

	return await eventRepository.update(id, patch);
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

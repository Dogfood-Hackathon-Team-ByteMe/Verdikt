import { runInTransaction } from '../utils/transaction.js';
import { idsOf, isOrganiserOf } from '../utils/eventRoles.js';
import Assignment from '../models/Assignment.js';
import Event from '../models/Event.js';
import Project from '../models/Project.js';
import Score from '../models/Score.js';
import Track from '../models/Track.js';
import * as trackRepository from "../repositories/TrackRepository.js";
import * as eventRepository from "../repositories/EventRepository.js";
import * as userRepository from "../repositories/UserRepository.js";
import * as webhookService from "./WebhookService.js";

/**
 * Hide judges' email addresses from everyone but the people running the event.
 *
 * TrackRepository populates `judges` with name AND email so the organiser's
 * panel screen can show who is who -- but GET /api/tracks is public, which made
 * every judge's address readable by anyone who asked. Same leak BUG-4 fixed for
 * team members, arriving by a different route.
 *
 * The names stay: a judging panel is usually announced, and the organiser tab
 * needs them. Only the address is privileged, and only the organiser of that
 * track's own event (or an admin) gets it.
 */
const redactJudges = (track, requestingUser) => {
	if (!track) return track;

	const doc = typeof track.toObject === "function" ? track.toObject() : { ...track };
	const judges = doc.judges ?? [];
	if (judges.length === 0) return doc;

	const maySeeAddresses =
		Boolean(requestingUser) &&
		(requestingUser.isAdmin || isOrganiserOf(requestingUser, doc.eventId));

	if (maySeeAddresses) return doc;

	doc.judges = judges.map((judge) => {
		if (!judge || typeof judge !== "object") return judge;
		const { email, ...rest } = judge;
		return rest;
	});
	return doc;
};

export const createTrack = async (data, requestingUser) => {
	if (!data.topic)
		throw Object.assign(new Error("Track topic is required"), {
			statusCode: 400,
		});
	if (!data.eventId)
		throw Object.assign(new Error("Event ID is required"), {
			statusCode: 400,
		});

	const isOrganizer =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eventId) => eventId.toString() === data.eventId.toString(),
		);
	if (!requestingUser.isAdmin && !isOrganizer) {
		throw Object.assign(
			new Error("Only event organizers can create tracks"),
			{ statusCode: 403 },
		);
	}

	return await runInTransaction(async (session) => {
		const track = await trackRepository.create(data, session);
		await eventRepository.addTrack(data.eventId, track._id, session);
		return track;
	});
};

export const getTrackById = async (id, requestingUser = null) => {
	const track = await trackRepository.findById(id);
	if (!track)
		throw Object.assign(new Error("Track not found"), { statusCode: 404 });
	return redactJudges(track, requestingUser);
};

// Tracks are public reference data, so an unfiltered list is allowed.
// (This used to 400 without an eventId, which meant the public gallery could
// not render its track chips before it knew an event id.)
export const getAllTracks = async (filter = {}, requestingUser = null) => {
	const tracks = await trackRepository.findAll(filter);
	return tracks.map((track) => redactJudges(track, requestingUser));
};

export const getTracksByEventId = async (eventId) => {
	return await trackRepository.findByEventId(eventId);
};

export const updateTrack = async (id, updateData, requestingUser) => {
	const track = await trackRepository.findById(id);
	if (!track)
		throw Object.assign(new Error("Track not found"), { statusCode: 404 });

	const isOrganizer =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eventId) => eventId.toString() === track.eventId.toString(),
		);
	if (!requestingUser.isAdmin && !isOrganizer) {
		throw Object.assign(
			new Error("Only event organizers can update tracks"),
			{ statusCode: 403 },
		);
	}

	return await trackRepository.update(id, updateData);
};

export const deleteTrack = async (id, requestingUser) => {
	const track = await trackRepository.findById(id);
	if (!track)
		throw Object.assign(new Error("Track not found"), { statusCode: 404 });

	const isOrganizer =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eventId) => eventId.toString() === track.eventId.toString(),
		);
	if (!requestingUser.isAdmin && !isOrganizer) {
		throw Object.assign(
			new Error("Only event organizers can delete tracks"),
			{ statusCode: 403 },
		);
	}

	// Entries filed under a track have nowhere to go if it vanishes: their
	// trackId would point at nothing, no track judge could score them, and they
	// would drop out of every per-track ranking. Make the organiser move them
	// first rather than orphan them silently.
	const filed = await Project.countDocuments({ trackId: id });
	if (filed > 0) {
		throw Object.assign(
			new Error(`${filed} ${filed === 1 ? "entry is" : "entries are"} filed under this track. Move ${filed === 1 ? "it" : "them"} to another track first.`),
			{ statusCode: 409 },
		);
	}

	const judges = (track.judges ?? []).map((j) => j._id ?? j);

	await runInTransaction(async (session) => {
		await trackRepository.deleteById(id, session);
		await userRepository.removeJudgeInForAll(id, session);
		// The event kept pointing at the deleted track, and its judges stayed on
		// the event with no track -- which the scope rules read as event-wide.
		await Event.updateOne({ _id: track.eventId }, { $pull: { tracks: track._id } }, { session });
		for (const judgeId of judges) await releaseIfOffPanel(track.eventId, judgeId, session);
	});
};

/**
 * The one way anybody becomes a judge.
 *
 * Direct appointment by the organiser, an accepted judge application and an
 * accepted judge invite all end here, so the rules cannot drift apart between
 * them -- which they had: the application path skipped the participation check
 * entirely, so someone who applied and THEN joined a team was still appointed.
 *
 * Writes the appointment to all three places that record it (the track, the
 * user, the event) inside the caller's transaction.
 */
export const appointJudge = async (track, judge, session = null) => {
	const eventId = String(track.eventId?._id ?? track.eventId);

	// "You cannot judge what you are entering", from this side. The team side
	// (participationBlockFor) stops a judge joining a team; this stops a
	// competitor being made a judge.
	if (idsOf(judge.participatingIn).includes(eventId)) {
		throw Object.assign(
			new Error("That person is competing in this event, so they cannot judge it"),
			{ statusCode: 409 },
		);
	}

	if (idsOf(judge.organiserIn).includes(eventId)) {
		throw Object.assign(
			new Error("The organiser of an event cannot also judge it"),
			{ statusCode: 409 },
		);
	}

	await trackRepository.addJudge(track._id, judge._id, session);
	await userRepository.addJudgeIn(judge._id, track._id, session);
	await eventRepository.addJudge(eventId, judge._id, session);
};

/**
 * After a judge loses a track, take them off the event too if that was their
 * last track in it.
 *
 * Without this they stayed in event.judgeIds with no track -- and a judge on
 * the event with no track of theirs is, by the scope rules, an event-wide
 * judge. Removing someone from the panel widened what they could score to
 * every entry in the event.
 *
 * Their unscored assignments go with them, so coverage stops counting a
 * reviewer who is no longer coming. Ballots they already cast stay: they were
 * cast legitimately, and deleting them is a separate, deliberate act.
 */
const releaseIfOffPanel = async (eventId, judgeId, session = null) => {
	const remaining = await Track.countDocuments({ eventId, judges: judgeId }).session(session);
	if (remaining > 0) return;

	await Event.updateOne({ _id: eventId }, { $pull: { judgeIds: judgeId } }, { session });

	const scored = await Score.find({ eventId, judgeId }).session(session).distinct('projectId');
	await Assignment.deleteMany({ eventId, judgeId, projectId: { $nin: scored } }, { session });
};

/**
 * The user to appoint, given either an id or an email address.
 *
 * Email is what an organiser actually has to hand. Resolving it HERE rather
 * than in the controller matters: this runs after the organiser check above, so
 * "does this address have an account?" is only answerable by someone who
 * already runs the event, instead of by anyone who can reach the endpoint.
 */
const resolveJudge = async (idOrEmail) => {
	const value = String(idOrEmail ?? "").trim();
	if (!value) throw Object.assign(new Error("A judge is required"), { statusCode: 400 });

	const found = value.includes("@")
		? await userRepository.findByEmail(value.toLowerCase())
		: await userRepository.findById(value);

	if (!found) throw Object.assign(new Error("No account with that email"), { statusCode: 404 });
	return found;
};

// ─── assignJudge: sync judgeIn ───────────────────────────────────────────────
export const assignJudge = async (trackId, judgeId, requestingUser) => {
	const track = await trackRepository.findById(trackId);
	if (!track)
		throw Object.assign(new Error("Track not found"), { statusCode: 404 });

	const isOrganizer =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eventId) => eventId.toString() === track.eventId.toString(),
		);
	if (!requestingUser.isAdmin && !isOrganizer) {
		throw Object.assign(
			new Error("Only event organizers can assign judges"),
			{ statusCode: 403 },
		);
	}

	const judge = await resolveJudge(judgeId);

	await runInTransaction((session) => appointJudge(track, judge, session));

	webhookService.dispatch(track.eventId, webhookService.TYPES.JUDGE_APPOINTED, {
		trackId: track._id,
		trackName: track.topic,
		judgeName: judge.name,
	});

	return redactJudges(await trackRepository.findById(trackId), requestingUser);
};

// ─── removeJudge: sync judgeIn ───────────────────────────────────────────────
export const removeJudge = async (trackId, judgeId, requestingUser) => {
	const track = await trackRepository.findById(trackId);
	if (!track)
		throw Object.assign(new Error("Track not found"), { statusCode: 404 });

	const isOrganizer =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eventId) => eventId.toString() === track.eventId.toString(),
		);
	if (!requestingUser.isAdmin && !isOrganizer) {
		throw Object.assign(
			new Error("Only event organizers can remove judges"),
			{ statusCode: 403 },
		);
	}

	await runInTransaction(async (session) => {
		await trackRepository.removeJudge(trackId, judgeId, session);
		await userRepository.removeJudgeIn(judgeId, trackId, session);
		await releaseIfOffPanel(track.eventId, judgeId, session);
	});

	webhookService.dispatch(track.eventId, webhookService.TYPES.JUDGE_REMOVED, {
		trackId: track._id,
		trackName: track.topic,
	});

	return redactJudges(await trackRepository.findById(trackId), requestingUser);
};

export const getTracksByJudgeId = async (judgeId) => {
	return await trackRepository.findTracksByJudgeId(judgeId);
};

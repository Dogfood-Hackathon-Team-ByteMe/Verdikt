import { runInTransaction } from '../utils/transaction.js';
import * as trackRepository from "../repositories/TrackRepository.js";
import * as eventRepository from "../repositories/EventRepository.js";
import * as userRepository from "../repositories/UserRepository.js";

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

export const getTrackById = async (id) => {
	const track = await trackRepository.findById(id);
	if (!track)
		throw Object.assign(new Error("Track not found"), { statusCode: 404 });
	return track;
};

// Tracks are public reference data, so an unfiltered list is allowed.
// (This used to 400 without an eventId, which meant the public gallery could
// not render its track chips before it knew an event id.)
export const getAllTracks = async (filter = {}) => {
	return await trackRepository.findAll(filter);
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

	await runInTransaction(async (session) => {
		await trackRepository.deleteById(id, session);
		await userRepository.removeJudgeInForAll(id, session);
	});
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

	await runInTransaction(async (session) => {
		await trackRepository.addJudge(trackId, judgeId, session);
		await userRepository.addJudgeIn(judgeId, trackId, session);
		await eventRepository.addJudge(track.eventId, judgeId, session);
	});

	return trackRepository.findById(trackId);
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
	});

	return trackRepository.findById(trackId);
};

export const getTracksByJudgeId = async (judgeId) => {
	return await trackRepository.findTracksByJudgeId(judgeId);
};

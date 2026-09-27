import * as resultRepository from "../repositories/ResultRepository.js";

export const createResult = async (data, requestingUser) => {
	if (!data.eventId)
		throw Object.assign(new Error("Event ID is required"), {
			statusCode: 400,
		});
	if (!data.projectId)
		throw Object.assign(new Error("Project ID is required"), {
			statusCode: 400,
		});

	const isOrganizer =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eventId) => eventId.toString() === data.eventId.toString(),
		);
	if (!requestingUser.isAdmin && !isOrganizer) {
		throw Object.assign(
			new Error("Only event organizers can create results"),
			{ statusCode: 403 },
		);
	}

	return await resultRepository.create(data);
};

export const getResultById = async (id) => {
	const result = await resultRepository.findById(id);
	if (!result)
		throw Object.assign(new Error("Result not found"), { statusCode: 404 });
	return result;
};

export const getResultsByEvent = async (eventId) => {
	return await resultRepository.findByEventId(eventId);
};

export const getResultsByTrack = async (trackId) => {
	return await resultRepository.findByTrackId(trackId);
};

export const getAllResults = async (filter = {}) => {
	return await resultRepository.findAll(filter);
};

export const updateResult = async (id, updateData, requestingUser) => {
	const result = await resultRepository.findById(id);
	if (!result)
		throw Object.assign(new Error("Result not found"), { statusCode: 404 });

	const isOrganizer =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eventId) => eventId.toString() === result.eventId.toString(),
		);
	if (!requestingUser.isAdmin && !isOrganizer) {
		throw Object.assign(
			new Error("Only event organizers can update results"),
			{ statusCode: 403 },
		);
	}

	return await resultRepository.update(id, updateData);
};

export const deleteResult = async (id, requestingUser) => {
	const result = await resultRepository.findById(id);
	if (!result)
		throw Object.assign(new Error("Result not found"), { statusCode: 404 });

	const isOrganizer =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eventId) => eventId.toString() === result.eventId.toString(),
		);
	if (!requestingUser.isAdmin && !isOrganizer) {
		throw Object.assign(
			new Error("Only event organizers can delete results"),
			{ statusCode: 403 },
		);
	}

	return await resultRepository.deleteById(id);
};

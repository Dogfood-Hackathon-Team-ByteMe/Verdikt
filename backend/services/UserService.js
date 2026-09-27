import bcrypt from "bcrypt";
import * as userRepository from "../repositories/UserRepository.js";
import Track from "../models/Track.js";

const SALT_ROUNDS = 12;

// Admin-only account creation (POST /api/users). Self-service signup is
// POST /api/auth/register, which does not go through here.
//
// Two holes closed: this used to take no requestingUser at all, so any signed-in
// user could call it; and it spread the whole request body into the model, so
// that caller could also pass "isAdmin": true and promote themselves.
export const createUser = async (data, requestingUser) => {
	if (!requestingUser || !requestingUser.isAdmin)
		throw Object.assign(new Error("Only admins can create users directly"), { statusCode: 403 });

	if (!data.email)
		throw Object.assign(new Error("Email is required"), { statusCode: 400 });
	if (!data.password)
		throw Object.assign(new Error("Password is required"), { statusCode: 400 });

	const email = String(data.email).trim().toLowerCase();

	const existing = await userRepository.findByEmail(email);
	if (existing)
		throw Object.assign(new Error("Email already registered"), { statusCode: 409 });

	// Explicit allow-list. isAdmin is honoured only because the caller is
	// already an admin, checked above.
	return await userRepository.create({
		email,
		password: await bcrypt.hash(data.password, SALT_ROUNDS),
		name: data.name ? String(data.name).trim() : undefined,
		isAdmin: data.isAdmin === true,
		participatingIn: [],
		judgeIn: [],
		organiserIn: [],
	});
};

export const getUserById = async (id) => {
	const user = await userRepository.findById(id);
	if (!user)
		throw Object.assign(new Error("User not found"), { statusCode: 404 });
	return user;
};

export const getUserByEmail = async (email) => {
	const user = await userRepository.findByEmail(email);
	if (!user)
		throw Object.assign(new Error("User not found"), { statusCode: 404 });
	return user;
};

export const getAllUsers = async (filter = {}) => {
	return await userRepository.findAll(filter);
};

export const updateUser = async (id, updateData, requestingUser) => {
	if (
		!requestingUser.isAdmin &&
		requestingUser._id.toString() !== id.toString()
	) {
		throw Object.assign(new Error("You can only update your own profile"), {
			statusCode: 403,
		});
	}

	// Hash new password if being updated
	if (updateData.password) {
		updateData.password = await bcrypt.hash(updateData.password, SALT_ROUNDS);
	}

	const user = await userRepository.update(id, updateData);
	if (!user)
		throw Object.assign(new Error("User not found"), { statusCode: 404 });
	return user;
};

export const deleteUser = async (id, requestingUser) => {
	if (!requestingUser.isAdmin) {
		throw Object.assign(new Error("Only admins can delete users"), {
			statusCode: 403,
		});
	}
	const user = await userRepository.deleteById(id);
	if (!user)
		throw Object.assign(new Error("User not found"), { statusCode: 404 });
	return user;
};

// Get all participants of a specific event.
// Access: admin, organiser of that event, participant of that event,
// or judge of any track belonging to that event.
export const getEventParticipants = async (eventId, requestingUser) => {
	if (requestingUser.isAdmin) {
		return await userRepository.findByEventId(eventId);
	}

	// Is organiser of this specific event?
	const isOrganiser =
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(id) => id.toString() === eventId.toString(),
		);

	// Is participant of this specific event?
	const isParticipant =
		requestingUser.participatingIn &&
		requestingUser.participatingIn.some(
			(id) => id.toString() === eventId.toString(),
		);

	// Is judge of any track belonging to this specific event?
	let isJudge = false;
	if (requestingUser.judgeIn && requestingUser.judgeIn.length > 0) {
		const judgeTrack = await Track.findOne({
			_id: { $in: requestingUser.judgeIn },
			eventId: eventId,
		});
		isJudge = !!judgeTrack;
	}

	if (!isOrganiser && !isParticipant && !isJudge) {
		throw Object.assign(new Error("You are not a member of this event"), {
			statusCode: 403,
		});
	}

	return await userRepository.findByEventId(eventId);
};

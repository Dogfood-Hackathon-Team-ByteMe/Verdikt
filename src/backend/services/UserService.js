import bcrypt from "bcrypt";
import * as userRepository from "../repositories/UserRepository.js";
import Track from "../models/Track.js";
import { toPublicUser } from "../utils/sanitize.js";

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
	const created = await userRepository.create({
		email,
		password: await bcrypt.hash(data.password, SALT_ROUNDS),
		name: data.name ? String(data.name).trim() : undefined,
		isAdmin: data.isAdmin === true,
		participatingIn: [],
		judgeIn: [],
		organiserIn: [],
	});
	return toPublicUser(created);
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

/**
 * What a profile edit may touch. Everything else about a User -- isAdmin and
 * the three per-event role arrays -- is set by the server as a side effect of
 * doing something (creating an event, accepting an invite), never by asking.
 *
 * Without this allow-list the whole body reached findByIdAndUpdate, so
 * `PUT /api/users/:id {"isAdmin":true}` promoted the caller to admin, and
 * `{"organiserIn":[id]}` handed them an event they had no claim on. Registration
 * was already guarded against exactly this; the update path was not.
 */
const PROFILE_FIELDS = ["name", "email", "password", "avatarUrl"];

const pickProfile = (data = {}) => {
	const out = {};
	for (const key of PROFILE_FIELDS) {
		if (data[key] !== undefined) out[key] = data[key];
	}
	return out;
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

	// Admins are no exception: `isAdmin` is deliberately not settable over HTTP
	// at all, which is the promise the README makes. Promote in the database.
	const safe = pickProfile(updateData);

	if (safe.email !== undefined) {
		safe.email = String(safe.email).trim().toLowerCase();
		if (!safe.email) {
			throw Object.assign(new Error("Email cannot be empty"), { statusCode: 400 });
		}
		const clash = await userRepository.findByEmail(safe.email);
		if (clash && clash._id.toString() !== id.toString()) {
			throw Object.assign(new Error("That email is already in use"), { statusCode: 409 });
		}
	}

	if (safe.name !== undefined && !String(safe.name).trim()) {
		throw Object.assign(new Error("Name cannot be empty"), { statusCode: 400 });
	}

	// Changing a password requires proving you know the current one. A live
	// session is not enough on its own: a borrowed laptop or a stolen cookie
	// would otherwise be a permanent account takeover, because the new password
	// locks the real owner out.
	// Only for your OWN account: an admin resetting someone else's password
	// cannot be expected to know it.
	const isSelf = requestingUser._id.toString() === id.toString();
	if (safe.password && isSelf) {
		const current = String(updateData.currentPassword ?? "");
		if (!current) {
			throw Object.assign(new Error("Enter your current password to set a new one"), {
				statusCode: 400,
				field: "currentPassword",
			});
		}

		// Read the hash explicitly: every other read strips it.
		const withHash = await userRepository.findByEmailWithPassword(
			(await userRepository.findById(id))?.email,
		);
		const ok = withHash && (await bcrypt.compare(current, withHash.password));
		if (!ok) {
			throw Object.assign(new Error("Your current password is not correct"), {
				statusCode: 403,
				field: "currentPassword",
			});
		}

		safe.password = await bcrypt.hash(safe.password, SALT_ROUNDS);
	}

	const user = await userRepository.update(id, safe);
	if (!user)
		throw Object.assign(new Error("User not found"), { statusCode: 404 });
	// The update returns the full document, bcrypt hash included.
	return toPublicUser(user);
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

import { runInTransaction } from '../utils/transaction.js';
import * as teamRepository from "../repositories/TeamRepository.js";
import * as userRepository from "../repositories/UserRepository.js";
import * as eventRepository from "../repositories/EventRepository.js";

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Load the event and assert it exists.
 */
const _getEvent = async (eventId) => {
	const event = await eventRepository.findById(eventId);
	if (!event)
		throw Object.assign(new Error("Event not found"), { statusCode: 404 });
	return event;
};

/**
 * Return true if the user has an elevated role (organiser, judge, or admin)
 * with respect to the given event.
 * Judges are checked via their judgeIn tracks — we only have trackIds here,
 * so we check that the user judges at least one track belonging to this event.
 * Because Track documents are populated on the event, we compare by eventId
 * on each track (populated by EventRepository.findById → populate('tracks')).
 */
const _isElevatedRoleForEvent = (user, event) => {
	if (user.isAdmin) return true;

	const eventId = event._id.toString();

	const isOrganiser =
		user.organiserIn &&
		user.organiserIn.some((id) => id.toString() === eventId);
	if (isOrganiser) return true;

	// judgeIn holds trackIds. The event's tracks array is populated.
	const eventTrackIds = (event.tracks || []).map((t) =>
		(t._id || t).toString(),
	);
	const isJudge =
		user.judgeIn &&
		user.judgeIn.some((tid) => eventTrackIds.includes(tid.toString()));
	return isJudge;
};

/**
 * After any member count change, recalculate and persist hasMinimumMembers.
 */
const _syncFlag = async (teamId, event, session) => {
	await teamRepository.syncHasMinimumMembers(teamId, event.minTeamSize, session);
};

// ─── Issue #18: createTeam ────────────────────────────────────────────────────
export const createTeam = async (data, requestingUser) => {
	if (!data.name)
		throw Object.assign(new Error("Team name is required"), {
			statusCode: 400,
		});
	if (!data.eventId)
		throw Object.assign(new Error("Event ID is required"), {
			statusCode: 400,
		});

	const event = await _getEvent(data.eventId);

	// Issue #18 — organisers, judges, and admins cannot create participant teams
	if (event.judgeIds && event.judgeIds.some(id => id.toString() === requestingUser._id.toString())) {
		throw Object.assign(new Error("Judges cannot participate in the event they are judging"), { statusCode: 403 });
	}

	if (_isElevatedRoleForEvent(requestingUser, event)) {
		throw Object.assign(
			new Error(
				"Organisers, judges, and admins cannot create participant teams",
			),
			{ statusCode: 403 },
		);
	}

	// Prevent creating a second team in the same event
	const existing = await teamRepository.findByMember(requestingUser._id);
	const alreadyInEvent = existing.some(
		(t) => t.eventId && t.eventId.toString() === data.eventId.toString(),
	);
	if (alreadyInEvent)
		throw Object.assign(
			new Error("You are already in a team for this event"),
			{ statusCode: 409 },
		);

	// Creator becomes the first member (leader)
	data.members = [requestingUser._id];

	return await runInTransaction(async (session) => {
		const team = await teamRepository.create(data, session);
		await userRepository.addParticipatingIn(requestingUser._id, data.eventId, session);
		await _syncFlag(team._id, event, session);
		return teamRepository.findById(team._id, session);
	});
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getTeamById = async (id) => {
	const team = await teamRepository.findById(id);
	if (!team)
		throw Object.assign(new Error("Team not found"), { statusCode: 404 });
	return team;
};

export const getAllTeams = async (filter = {}) => {
	return await teamRepository.findAll(filter);
};

export const getTeamsByEventId = async (eventId) => {
	return await teamRepository.findByEventId(eventId);
};

export const getTeamsByMember = async (userId) => {
	return await teamRepository.findByMember(userId);
};

// ─── Issue #16: updateTeam — strip members from payload ──────────────────────
export const updateTeam = async (id, updateData, requestingUser) => {
	const team = await teamRepository.findById(id);
	if (!team)
		throw Object.assign(new Error("Team not found"), { statusCode: 404 });

	// Only the leader (first member) or admin can update metadata
	const isLeader =
		team.members.length > 0 &&
		team.members[0]._id.toString() === requestingUser._id.toString();
	if (!requestingUser.isAdmin && !isLeader) {
		throw Object.assign(
			new Error("Only the team leader can update the team"),
			{ statusCode: 403 },
		);
	}

	// Issue #16 — members array must only be mutated via the dedicated
	// addMember / removeMember endpoints, never through a raw update.
	if ("members" in updateData) {
		throw Object.assign(
			new Error(
				"Use the /members endpoints to add or remove team members",
			),
			{ statusCode: 400 },
		);
	}

	// Also guard against changing the team's event after creation
	if ("eventId" in updateData) {
		throw Object.assign(new Error("Cannot change the event of a team"), {
			statusCode: 400,
		});
	}

	return await teamRepository.update(id, updateData);
};

// ─── Issue #16: deleteTeam — organiser can also delete ───────────────────────
export const deleteTeam = async (id, requestingUser) => {
	const team = await teamRepository.findById(id);
	if (!team)
		throw Object.assign(new Error("Team not found"), { statusCode: 404 });

	const isLeader =
		team.members.length > 0 &&
		team.members[0]._id.toString() === requestingUser._id.toString();

	// Issue #16 — additionally allow the event organiser to delete
	const event = await eventRepository.findById(team.eventId);
	const isOrganiserOfEvent =
		event &&
		requestingUser.organiserIn &&
		requestingUser.organiserIn.some(
			(eid) => eid.toString() === event._id.toString(),
		);

	if (!requestingUser.isAdmin && !isLeader && !isOrganiserOfEvent) {
		throw Object.assign(
			new Error(
				"Only the team leader, the event organiser, or an admin can delete the team",
			),
			{ statusCode: 403 },
		);
	}

	return await teamRepository.deleteById(id);
};

// ─── Member management — dynamic limits + hasMinimumMembers sync ──────────────

export const addMember = async (teamId, userId, requestingUser) => {
	const team = await teamRepository.findById(teamId);
	if (!team)
		throw Object.assign(new Error("Team not found"), { statusCode: 404 });

	const isLeader =
		team.members.length > 0 &&
		team.members[0]._id.toString() === requestingUser._id.toString();
	if (!requestingUser.isAdmin && !isLeader) {
		throw Object.assign(
			new Error("Only the team leader can add members directly"),
			{ statusCode: 403 },
		);
	}

	// Dynamic max from the event instead of hardcoded 4
	const event = await _getEvent(team.eventId);
	if (event.judgeIds && event.judgeIds.some(id => id.toString() === userId.toString())) {
		throw Object.assign(new Error("Judges cannot participate in the event they are judging"), { statusCode: 403 });
	}

	if (team.members.length >= event.maxTeamSize) {
		throw Object.assign(
			new Error(
				`Team cannot have more than ${event.maxTeamSize} members`,
			),
			{ statusCode: 400 },
		);
	}

	// Check if user is already a member
	const isMember = team.members.some(
		(m) => m._id.toString() === userId.toString(),
	);
	if (isMember)
		throw Object.assign(new Error("User is already a team member"), {
			statusCode: 409,
		});

	await runInTransaction(async (session) => {
		await teamRepository.addMember(teamId, userId, session);
		await userRepository.addParticipatingIn(userId, team.eventId, session);
		await _syncFlag(teamId, event, session);
	});

	return teamRepository.findById(teamId);
};

export const removeMember = async (teamId, userId, requestingUser) => {
	const team = await teamRepository.findById(teamId);
	if (!team)
		throw Object.assign(new Error("Team not found"), { statusCode: 404 });

	const isLeader =
		team.members.length > 0 &&
		team.members[0]._id.toString() === requestingUser._id.toString();

	// A member may always remove THEMSELVES -- that is how you leave a team.
	// Anyone else can only be removed by the leader or an admin.
	const isSelf = requestingUser._id.toString() === userId.toString();

	if (!requestingUser.isAdmin && !isLeader && !isSelf) {
		throw Object.assign(
			new Error("Only the team leader can remove other members"),
			{ statusCode: 403 },
		);
	}

	// The leader cannot be removed, including by themselves: it would orphan
	// the team. Delete the team instead.
	if (
		team.members.length > 0 &&
		team.members[0]._id.toString() === userId.toString()
	) {
		throw Object.assign(
			new Error("The team leader cannot leave. Delete the team instead."),
			{ statusCode: 400 },
		);
	}

	await runInTransaction(async (session) => {
		await teamRepository.removeMember(teamId, userId, session);
		if (team.eventId) {
			const otherTeams = await teamRepository.findByMember(userId, session);
			const stillInEvent = otherTeams.some(
				(t) => t.eventId && t.eventId.toString() === team.eventId.toString(),
			);
			if (!stillInEvent) {
				await userRepository.removeParticipatingIn(userId, team.eventId, session);
			}
		}
		const event = await _getEvent(team.eventId);
		await _syncFlag(teamId, event, session);
	});

	return teamRepository.findById(teamId);
};

export const searchTeams = async (query, eventId, requestingUser) => {
	if (!eventId) throw Object.assign(new Error("eventId is required"), { statusCode: 400 });
	const event = await _getEvent(eventId);
	
	const isAdmin = requestingUser.isAdmin;
	const isOrg = requestingUser.organiserIn && requestingUser.organiserIn.some(id => id.toString() === eventId.toString());
	const isJudge = event.judgeIds && event.judgeIds.some(id => id.toString() === requestingUser._id.toString());
	const isParticipant = requestingUser.participatingIn && requestingUser.participatingIn.some(id => id.toString() === eventId.toString());
	
	if (!isAdmin && !isOrg && !isJudge && !isParticipant) {
		throw Object.assign(new Error("Only participants, judges, organizers, or admins can search teams for this event"), { statusCode: 403 });
	}
	
	return await teamRepository.search(query, eventId);
};

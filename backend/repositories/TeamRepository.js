import Team from '../models/Team.js';

export const create = async (data, session = null) => {
    const team = new Team(data);
    return await team.save({ session });
};

export const findById = async (id, session = null) => {
    return await Team.findById(id).populate('members', 'name').populate('projectId').session(session);
};

export const findAll = async (filter = {}, session = null) => {
    return await Team.find(filter).populate('members', 'name').session(session);
};

export const findByEventId = async (eventId, session = null) => {
    return await Team.find({ eventId }).populate('members', 'name').session(session);
};

export const findByMember = async (userId, session = null) => {
    return await Team.find({ members: userId }).populate('members', 'name').session(session);
};

export const update = async (id, updateData, session = null) => {
    return await Team.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const search = async (query, eventId, session = null) => {
    const regex = new RegExp(query, 'i');
    return await Team.find({ name: regex, eventId }).populate('members', 'name').session(session);
};
export const deleteById = async (id, session = null) => {
    return await Team.findByIdAndDelete(id, { session });
};

export const addMember = async (teamId, userId, session = null) => {
    return await Team.findByIdAndUpdate(teamId, { $addToSet: { members: userId } }, { new: true, session });
};

export const removeMember = async (teamId, userId, session = null) => {
    return await Team.findByIdAndUpdate(teamId, { $pull: { members: userId } }, { new: true, session });
};

/**
 * Recalculate and persist `hasMinimumMembers` for a team.
 * @param {string} teamId
 * @param {number} minTeamSize - from the event document
 */
export const syncHasMinimumMembers = async (teamId, minTeamSize, session = null) => {
    const team = await Team.findById(teamId).session(session);
    if (!team) return null;
    const flag = team.members.length >= minTeamSize;
    return await Team.findByIdAndUpdate(teamId, { hasMinimumMembers: flag }, { new: true, session });
};

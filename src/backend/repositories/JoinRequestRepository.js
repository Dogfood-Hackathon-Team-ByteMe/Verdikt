import JoinRequest from '../models/JoinRequest.js';

export const create = async (data, session = null) => {
    const doc = new JoinRequest(data);
    return await doc.save({ session });
};

export const findById = async (id, session = null) => {
    return await JoinRequest.findById(id).populate('teamId', 'name eventId members').populate('userId', 'name email').session(session);
};

export const findByTeamId = async (teamId, session = null) => {
    return await JoinRequest.find({ teamId }).populate('userId', 'name email').session(session);
};

export const findPendingByUserAndTeam = async (userId, teamId, session = null) => {
    return await JoinRequest.findOne({ userId, teamId, status: 'pending' }).session(session);
};

export const update = async (id, updateData, session = null) => {
    return await JoinRequest.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const deleteById = async (id, session = null) => {
    return await JoinRequest.findByIdAndDelete(id, { session });
};

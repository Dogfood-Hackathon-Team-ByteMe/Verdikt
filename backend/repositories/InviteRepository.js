import Invite from '../models/Invite.js';

export const create = async (data, session = null) => {
    const invite = new Invite(data);
    return await invite.save({ session });
};

export const findById = async (id, session = null) => {
    return await Invite.findById(id).populate('teamId', 'name members').populate('createdBy', 'name email').session(session);
};

export const findByToken = async (token, session = null) => {
    return await Invite.findOne({ token }).populate('teamId', 'name members eventId').populate('createdBy', 'name email').session(session);
};

export const findAll = async (filter = {}, session = null) => {
    return await Invite.find(filter).populate('teamId', 'name').populate('createdBy', 'name email').session(session);
};

export const findByTeamId = async (teamId, session = null) => {
    return await Invite.find({ teamId }).session(session);
};

export const update = async (id, updateData, session = null) => {
    return await Invite.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const deleteById = async (id, session = null) => {
    return await Invite.findByIdAndDelete(id, { session });
};

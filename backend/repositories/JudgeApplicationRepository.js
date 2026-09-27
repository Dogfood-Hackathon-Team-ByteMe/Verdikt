import JudgeApplication from '../models/JudgeApplication.js';

export const create = async (data, session = null) => {
    const doc = new JudgeApplication(data);
    return await doc.save({ session });
};

export const findById = async (id, session = null) => {
    return await JudgeApplication.findById(id).populate('eventId').populate('userId', 'name email').session(session);
};

export const findPendingByUserAndEvent = async (userId, eventId, session = null) => {
    return await JudgeApplication.findOne({ userId, eventId, status: 'pending' }).session(session);
};

export const findByEventId = async (eventId, session = null) => {
    return await JudgeApplication.find({ eventId }).populate('userId', 'name email').populate('trackId', 'topic').session(session);
};

export const update = async (id, updateData, session = null) => {
    return await JudgeApplication.findByIdAndUpdate(id, updateData, { new: true, session });
};

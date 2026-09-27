import Notification from '../models/Notification.js';

export const create = async (data, session = null) => {
    const doc = new Notification(data);
    return await doc.save({ session });
};

export const findById = async (id, session = null) => {
    return await Notification.findById(id).session(session);
};

export const findByUserId = async (userId, session = null) => {
    return await Notification.find({ userId }).sort({ createdAt: -1 }).session(session);
};

export const update = async (id, updateData, session = null) => {
    return await Notification.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const deleteById = async (id, session = null) => {
    return await Notification.findByIdAndDelete(id, { session });
};

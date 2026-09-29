import Event from '../models/Event.js';

export const create = async (data, session = null) => {
    const event = new Event(data);
    return await event.save({ session });
};

export const findById = async (id, session = null) => {
    return await Event.findById(id).populate('organiserId', 'name email').populate('tracks').session(session);
};

export const searchByTags = async (tags, session = null) => {
    return await Event.find({ eventTags: { $in: tags } }).populate('organiserId', 'name email').populate('tracks').session(session);
};
// Single event by arbitrary criteria, populated like findById so callers get
// the same shape either way.
export const findOne = async (filter = {}, session = null) => {
    return await Event.findOne(filter).populate('organiserId', 'name email').populate('tracks').session(session);
};

export const findAll = async (filter = {}, session = null) => {
    return await Event.find(filter).populate('organiserId', 'name email').populate('tracks').session(session);
};

export const update = async (id, updateData, session = null) => {
    return await Event.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const deleteById = async (id, session = null) => {
    return await Event.findByIdAndDelete(id, { session });
};

export const addTrack = async (eventId, trackId, session = null) => {
    return await Event.findByIdAndUpdate(eventId, { $addToSet: { tracks: trackId } }, { new: true, session });
};

export const addJudge = async (eventId, judgeId, session = null) => {
    return await Event.findByIdAndUpdate(eventId, { $addToSet: { judgeIds: judgeId } }, { new: true, session });
};

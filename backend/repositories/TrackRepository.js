import Track from '../models/Track.js';

export const create = async (data, session = null) => {
    const track = new Track(data);
    return await track.save({ session });
};

export const findById = async (id, session = null) => {
    return await Track.findById(id).populate('judges', 'name email').session(session);
};

export const findAll = async (filter = {}, session = null) => {
    return await Track.find(filter).populate('judges', 'name email').session(session);
};

export const findByEventId = async (eventId, session = null) => {
    return await Track.find({ eventId }).populate('judges', 'name email').session(session);
};

export const update = async (id, updateData, session = null) => {
    return await Track.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const deleteById = async (id, session = null) => {
    return await Track.findByIdAndDelete(id, { session });
};

export const addJudge = async (trackId, judgeId, session = null) => {
    return await Track.findByIdAndUpdate(trackId, { $addToSet: { judges: judgeId } }, { new: true, session });
};

export const removeJudge = async (trackId, judgeId, session = null) => {
    return await Track.findByIdAndUpdate(trackId, { $pull: { judges: judgeId } }, { new: true, session });
};

export const findTracksByJudgeId = async (judgeId, session = null) => {
    return await Track.find({ judges: judgeId }).session(session);
};

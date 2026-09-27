import Result from '../models/Result.js';

export const create = async (data, session = null) => {
    const result = new Result(data);
    return await result.save({ session });
};

export const findById = async (id, session = null) => {
    return await Result.findById(id)
        .populate('teamId', 'name')
        .populate('projectId', 'title summary')
        .populate('trackId', 'topic').session(session);
};

export const findAll = async (filter = {}, session = null) => {
    return await Result.find(filter)
        .populate('teamId', 'name')
        .populate('projectId', 'title summary')
        .populate('trackId', 'topic')
        .sort({ trackPosition: 1 }).session(session);
};

export const findByEventId = async (eventId, session = null) => {
    return await Result.find({ eventId })
        .populate('teamId', 'name')
        .populate('projectId', 'title summary')
        .populate('trackId', 'topic')
        .sort({ trackPosition: 1 }).session(session);
};

export const findByTrackId = async (trackId, session = null) => {
    return await Result.find({ trackId })
        .populate('teamId', 'name')
        .populate('projectId', 'title summary')
        .sort({ trackPosition: 1 }).session(session);
};

export const update = async (id, updateData, session = null) => {
    return await Result.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const deleteById = async (id, session = null) => {
    return await Result.findByIdAndDelete(id, { session });
};

export const deleteByEventId = async (eventId, session = null) => {
    return await Result.deleteMany({ eventId });
};

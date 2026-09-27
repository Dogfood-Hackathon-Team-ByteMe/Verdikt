import Score from '../models/Score.js';

export const create = async (data, session = null) => {
    const score = new Score(data);
    return await score.save({ session });
};

export const findById = async (id, session = null) => {
    return await Score.findById(id)
        .populate('judgeId', 'name email')
        .populate('projectId', 'title summary').session(session);
};

export const findAll = async (filter = {}, session = null) => {
    return await Score.find(filter)
        .populate('judgeId', 'name email')
        .populate('projectId', 'title summary').session(session);
};

export const findByJudgeId = async (judgeId, session = null) => {
    return await Score.find({ judgeId })
        .populate('projectId', 'title summary trackId').session(session);
};

export const findByProjectId = async (projectId, session = null) => {
    return await Score.find({ projectId })
        .populate('judgeId', 'name email').session(session);
};

export const findByJudgeAndProject = async (judgeId, projectId, session = null) => {
    return await Score.findOne({ judgeId, projectId }).session(session);
};

export const search = async (query, filter, session = null) => {
    const regex = new RegExp(query, 'i');
    return await Score.find({ ...filter, comment: regex }).populate('judgeId', 'name email').populate('projectId').session(session);
};
export const update = async (id, updateData, session = null) => {
    return await Score.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const upsertByJudgeAndProject = async (judgeId, projectId, data, session = null) => {
    return await Score.findOneAndUpdate(
        { judgeId, projectId },
        { ...data, judgeId, projectId },
        { new: true, upsert: true }
    );
};

export const deleteById = async (id, session = null) => {
    return await Score.findByIdAndDelete(id, { session });
};

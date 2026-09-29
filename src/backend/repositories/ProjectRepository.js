import Project from '../models/Project.js';

export const create = async (data, session = null) => {
    const project = new Project(data);
    return await project.save({ session });
};

export const findById = async (id, session = null) => {
    return await Project.findById(id)
        .populate('teamId', 'name members')
        .populate('trackId', 'topic').session(session);
};

export const findAll = async (filter = {}, session = null) => {
    return await Project.find(filter)
        .populate('teamId', 'name members')
        .populate('trackId', 'topic')
        .sort({ submittedAt: -1, createdAt: -1 })
        .session(session);
};

export const findByTeamId = async (teamId, session = null) => {
    return await Project.find({ teamId }).session(session);
};

export const findByTrackId = async (trackId, session = null) => {
    return await Project.find({ trackId }).session(session);
};

export const findByEventId = async (eventId, session = null) => {
    return await Project.find({ eventId })
        .populate('teamId', 'name members')
        .populate('trackId', 'topic').session(session);
};

export const update = async (id, updateData, session = null) => {
    return await Project.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const deleteById = async (id, session = null) => {
    return await Project.findByIdAndDelete(id, { session });
};

// Free-text search over the fields a visitor would reasonably search by,
// combined with the same structural filters getAll accepts (track, event,
// status) so the gallery can search and filter in one request.
//
// The query is escaped before becoming a RegExp: an unescaped user string is
// both a crash risk and a ReDoS vector.
export const search = async (query, filter = {}, session = null) => {
    const criteria = { ...filter };

    if (query && String(query).trim()) {
        const escaped = String(query).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(escaped, 'i');
        criteria.$or = [
            { title: searchRegex },
            { tagline: searchRegex },
            { summary: searchRegex },
            { description: searchRegex },
            { techTags: searchRegex },
        ];
    }

    return await Project.find(criteria)
        .populate('teamId', 'name members')
        .populate('trackId', 'topic')
        .sort({ submittedAt: -1, createdAt: -1 })
        .session(session);
};

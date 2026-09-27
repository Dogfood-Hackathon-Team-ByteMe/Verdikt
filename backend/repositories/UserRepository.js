import User from '../models/User.js';

export const create = async (data, session = null) => {
    const user = new User(data);
    return await user.save({ session });
};

// Password hygiene: every read EXCEPT findByEmailWithPassword excludes the
// hash. Without this, authenticate() attached the bcrypt hash to req.user on
// every request and GET /api/users handed every user's hash to any caller.
export const findById = async (id, session = null) => {
    return await User.findById(id).select('-password').session(session);
};

export const findByEmail = async (email, session = null) => {
    return await User.findOne({ email }).select('-password').session(session);
};

// The one read that keeps the hash, used only by AuthService.login for
// bcrypt.compare. Never return this document to a client.
export const findByEmailWithPassword = async (email, session = null) => {
    return await User.findOne({ email }).session(session);
};

export const findAll = async (filter = {}, session = null) => {
    return await User.find(filter).select('-password').session(session);
};

export const update = async (id, updateData, session = null) => {
    return await User.findByIdAndUpdate(id, updateData, { new: true, session });
};

export const search = async (query, session = null) => {
    const regex = new RegExp(query, 'i');
    return await User.find({ $or: [{name: regex}, {email: regex}] }).select('-password').session(session);
};

export const deleteById = async (id, session = null) => {
    return await User.findByIdAndDelete(id, { session });
};

// Find all users participating in a given event
export const findByEventId = async (eventId, session = null) => {
    return await User.find({ participatingIn: eventId }).select('-password').session(session);
};

// ─── participatingIn ────────────────────────────────────────────────────────
export const addParticipatingIn = async (userId, eventId, session = null) => {
    return await User.findByIdAndUpdate(
        userId,
        { $addToSet: { participatingIn: eventId } },
        { new: true, session }
    );
};

export const removeParticipatingIn = async (userId, eventId, session = null) => {
    return await User.findByIdAndUpdate(
        userId,
        { $pull: { participatingIn: eventId } },
        { new: true, session }
    );
};

// ─── judgeIn ────────────────────────────────────────────────────────────────
export const addJudgeIn = async (userId, trackId, session = null) => {
    return await User.findByIdAndUpdate(
        userId,
        { $addToSet: { judgeIn: trackId } },
        { new: true, session }
    );
};

export const removeJudgeIn = async (userId, trackId, session = null) => {
    return await User.findByIdAndUpdate(
        userId,
        { $pull: { judgeIn: trackId } },
        { new: true, session }
    );
};

// Remove a trackId from every user who has it in judgeIn (used on track delete)
export const removeJudgeInForAll = async (trackId, session = null) => {
    return await User.updateMany(
        { judgeIn: trackId }, { $pull: { judgeIn: trackId } }
    , { session });
};

// ─── organiserIn ─────────────────────────────────────────────────────────────
export const addOrganiserIn = async (userId, eventId, session = null) => {
    return await User.findByIdAndUpdate(
        userId,
        { $addToSet: { organiserIn: eventId } },
        { new: true, session }
    );
};

export const removeOrganiserIn = async (userId, eventId, session = null) => {
    return await User.findByIdAndUpdate(
        userId,
        { $pull: { organiserIn: eventId } },
        { new: true, session }
    );
};

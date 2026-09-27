import Session from '../models/Session.js';

/**
 * Sessions are opaque random tokens stored server-side; the browser only ever
 * holds the token in an httpOnly cookie. The Session schema carries a 24h TTL
 * index on createdAt, so expired rows are reaped by MongoDB itself.
 */

export const create = async (data, session = null) => {
    const doc = new Session(data);
    return await doc.save({ session });
};

export const findByToken = async (token, session = null) => {
    return await Session.findOne({ token }).session(session);
};

export const deleteByToken = async (token, session = null) => {
    return await Session.findOneAndDelete({ token }, { session });
};

/** Used when a user is deleted, so their sessions do not outlive the account. */
export const deleteByUserId = async (userId, session = null) => {
    return await Session.deleteMany({ userId }, { session });
};

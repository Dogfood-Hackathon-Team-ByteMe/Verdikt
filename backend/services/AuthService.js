/**
 * Authentication: registration, sign-in, sign-out and "who am I".
 *
 * The middleware that *reads* sessions already existed; this is the half that
 * issues them. The scheme is deliberately boring and self-hosted:
 *
 *   password  -> bcrypt hash, cost 12, stored on the User
 *   session   -> 32 random bytes, stored server-side, sent as an httpOnly cookie
 *
 * No JWT, so signing out actually revokes: the row is deleted and the token is
 * dead immediately. No third-party identity provider, which keeps the
 * "runs offline from one compose file" promise intact.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import * as userRepository from '../repositories/UserRepository.js';
import * as sessionRepository from '../repositories/SessionRepository.js';
import { resolveRole, toPublicUser } from '../utils/sanitize.js';

const SALT_ROUNDS = 12;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // Matches the TTL index on Session.createdAt.

/** Same cost as UserService, so hashes written by either path are comparable. */
const hash = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

const newToken = () => crypto.randomBytes(32).toString('hex');

/**
 * Issue a session for a user and return { token, expiresAt } for the cookie.
 * Session.role is `required`, so it must be resolved here or the save throws.
 */
const issueSession = async (user) => {
    const token = newToken();
    await sessionRepository.create({
        token,
        userId: user._id,
        role: resolveRole(user),
    });
    return { token, expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
};

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Create an account and sign the new user straight in.
 *
 * Only three fields are read off the request. Spreading req.body into the
 * model would let anyone register with `"isAdmin": true` and own the platform.
 */
export const register = async ({ email, password, name } = {}) => {
    if (!email || !String(email).trim()) throw badRequest('Email is required');
    if (!password) throw badRequest('Password is required');
    if (String(password).length < 8) throw badRequest('Password must be at least 8 characters');

    const normalisedEmail = String(email).trim().toLowerCase();

    const existing = await userRepository.findByEmail(normalisedEmail);
    if (existing) throw Object.assign(new Error('Email already registered'), { statusCode: 409 });

    const user = await userRepository.create({
        email: normalisedEmail,
        password: await hash(password),
        name: name ? String(name).trim() : undefined,
        // Role arrays start empty and are filled by joining a team, being
        // accepted as a judge, or creating an event. isAdmin is never settable
        // over HTTP; seed or promote in the database.
        participatingIn: [],
        judgeIn: [],
        organiserIn: [],
        isAdmin: false,
    });

    const session = await issueSession(user);
    return { user: toPublicUser(user), session };
};

/**
 * Verify credentials and issue a session.
 *
 * Wrong email and wrong password return the same 401 message on purpose: a
 * different response for each turns the form into an account-enumeration oracle.
 */
export const login = async ({ email, password } = {}) => {
    if (!email || !password) throw badRequest('Email and password are required');

    const normalisedEmail = String(email).trim().toLowerCase();
    const user = await userRepository.findByEmailWithPassword(normalisedEmail);

    const unauthorized = Object.assign(new Error('Incorrect email or password'), { statusCode: 401 });
    if (!user) throw unauthorized;

    const matches = await bcrypt.compare(String(password), user.password);
    if (!matches) throw unauthorized;

    const session = await issueSession(user);
    return { user: toPublicUser(user), session };
};

/** Revoke one session. Signing out twice is not an error. */
export const logout = async (token) => {
    if (!token) return;
    await sessionRepository.deleteByToken(token);
};

/**
 * The current user, re-read from the database rather than trusted from the
 * session row, so a role change takes effect on the next request.
 */
export const me = async (userId) => {
    const user = await userRepository.findById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    return { ...toPublicUser(user), role: resolveRole(user) };
};

/**
 * Rate limiting.
 *
 * Until now the API answered every request as fast as it could, including the
 * ten-thousandth password guess in a row. This is the T3 anti-abuse floor: put
 * a ceiling on how fast anyone can hammer a route, and make the ceiling say so
 * politely enough that a real user who hits it knows what to do.
 *
 * Fixed windows, held in memory. That is a deliberate limit, not an oversight:
 * Verdikt is one process behind one nginx, and a shared store would mean Redis,
 * which is a dependency a self-hoster should not need to run a hackathon. Two
 * consequences are worth naming -- restarting the API forgets every counter,
 * and running more than one API process would give each its own counters, so a
 * multi-process deployment needs a shared store before these numbers mean
 * anything.
 *
 * WHO a request is counted against matters more than the numbers. Counting
 * logins by IP alone would let one attacker on a university NAT lock out
 * everyone behind it, so login is counted twice: a tight bucket per email
 * address, which only failures fill, and a loose bucket per IP, which catches
 * someone spraying one guess across many accounts. A user who mistypes their
 * password twice and then gets it right leaves no trace, because success
 * clears their bucket.
 */

import * as auditService from '../services/AuditService.js';
import { ACTIONS } from '../services/AuditService.js';

/** Read a positive integer from the environment, or fall back. */
const num = (value, fallback) => {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : fallback;
};

const MINUTE = 60_000;

/**
 * The shipped ceilings. Each is deliberately far above what a person does and
 * far below what a script does.
 *
 * `loginEmail` is the one that matters: 8 failures per address per 15 minutes
 * makes an online guessing attack useless without troubling anyone who has
 * simply forgotten which password they used.
 */
export const LIMITS = {
	loginEmail: { limit: num(process.env.RATE_LIMIT_LOGIN, 8), windowMs: num(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * MINUTE) },
	loginIp: { limit: num(process.env.RATE_LIMIT_LOGIN_IP, 40), windowMs: num(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * MINUTE) },
	register: { limit: num(process.env.RATE_LIMIT_REGISTER, 10), windowMs: num(process.env.RATE_LIMIT_REGISTER_WINDOW_MS, 60 * MINUTE) },
	write: { limit: num(process.env.RATE_LIMIT_WRITE, 240), windowMs: MINUTE },
	// Comments get their own, tighter ceiling inside the write budget: ten a
	// minute is chatty for a person and useless for a spam script.
	comment: { limit: num(process.env.RATE_LIMIT_COMMENT, 10), windowMs: MINUTE },
	// The keyless public API is counted per address. Generous for a script
	// polling a leaderboard, cheap to lift with the env var.
	publicRead: { limit: num(process.env.RATE_LIMIT_PUBLIC, 120), windowMs: MINUTE },
};

/**
 * One bucket store, shared by every limiter and keyed by "<name>:<subject>".
 *
 * Entries are swept on write rather than on a timer, so an idle process holds
 * no interval open and the map cannot grow without bound while requests keep
 * arriving.
 */
const buckets = new Map();
let lastSweep = 0;

const sweep = (now) => {
	if (now - lastSweep < MINUTE) return;
	lastSweep = now;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
};

/** Count one hit. Returns the bucket so the caller can decide what to do. */
const hit = (key, windowMs, now = Date.now()) => {
	sweep(now);
	const existing = buckets.get(key);
	if (existing && existing.resetAt > now) {
		existing.count += 1;
		return existing;
	}
	const fresh = { count: 1, resetAt: now + windowMs };
	buckets.set(key, fresh);
	return fresh;
};

/** Look without counting, so a check can precede the work it guards. */
const peek = (key, now = Date.now()) => {
	const bucket = buckets.get(key);
	return bucket && bucket.resetAt > now ? bucket : null;
};

const forget = (key) => buckets.delete(key);

/** Everything, for tests and for a clean start. */
export const resetRateLimits = () => {
	buckets.clear();
	lastSweep = 0;
};

const tooMany = (resetAt, message) => {
	const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
	return Object.assign(new Error(message), { statusCode: 429, retryAfter });
};

/**
 * The address a request is counted against.
 *
 * `req.ip` is only the caller's address if Express has been told how many
 * proxies sit in front of it (see app.js). Without that, every request through
 * nginx shares one address and therefore one bucket, which would have turned
 * this whole file into a way to lock out the entire internet at once.
 */
const addressOf = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

const emailOf = (req) => String(req.body?.email ?? '').trim().toLowerCase();

/**
 * Guard sign-in.
 *
 * Only the IP bucket is filled here, because at this point nobody knows yet
 * whether the attempt was any good. The email bucket is filled by
 * recordLoginFailure(), which the controller calls when the attempt fails, and
 * emptied by clearLoginFailures() when it succeeds.
 */
export const loginLimiter = async (req, res, next) => {
	const email = emailOf(req);
	const emailKey = `loginEmail:${email}`;

	// A refusal is recorded here rather than in the controller, because a
	// refusal never reaches the controller -- that is the point of it. A burst
	// of these rows is what an attack looks like from the outside.
	const blocked = async (bucket, message) => {
		await auditService.record(req, ACTIONS.LOGIN_BLOCKED, { meta: { email } });
		next(tooMany(bucket.resetAt, message));
	};

	if (email) {
		const bucket = peek(emailKey);
		if (bucket && bucket.count >= LIMITS.loginEmail.limit) {
			return await blocked(bucket, 'Too many failed sign-in attempts for this account. Try again later.');
		}
	}

	const ipBucket = hit(`loginIp:${addressOf(req)}`, LIMITS.loginIp.windowMs);
	if (ipBucket.count > LIMITS.loginIp.limit) {
		return await blocked(ipBucket, 'Too many sign-in attempts from this address. Try again later.');
	}

	next();
};

export const recordLoginFailure = (req) => {
	const email = emailOf(req);
	if (email) hit(`loginEmail:${email}`, LIMITS.loginEmail.windowMs);
};

export const clearLoginFailures = (req) => {
	const email = emailOf(req);
	if (email) forget(`loginEmail:${email}`);
};

/** Guard account creation, so one address cannot mint accounts in bulk. */
export const registerLimiter = (req, res, next) => {
	const bucket = hit(`register:${addressOf(req)}`, LIMITS.register.windowMs);
	if (bucket.count > LIMITS.register.limit) {
		return next(tooMany(bucket.resetAt, 'Too many accounts created from this address. Try again later.'));
	}
	next();
};

/** Guard comment posting, per account. Runs after requireAuth, so req.user exists. */
export const commentLimiter = (req, res, next) => {
	const bucket = hit(`comment:user:${req.user._id}`, LIMITS.comment.windowMs);
	if (bucket.count > LIMITS.comment.limit) {
		return next(tooMany(bucket.resetAt, 'You are commenting too quickly. Give it a minute.'));
	}
	next();
};

/** Guard the keyless public API, per address, reads included. */
export const publicReadLimiter = (req, res, next) => {
	const bucket = hit(`publicRead:${addressOf(req)}`, LIMITS.publicRead.windowMs);
	if (bucket.count > LIMITS.publicRead.limit) {
		return next(tooMany(bucket.resetAt, 'Too many requests from this address. Slow down and try again.'));
	}
	next();
};

/**
 * A broad ceiling on everything that changes state.
 *
 * Signed-in callers are counted per account rather than per address, so a whole
 * office behind one address is not throttled as though it were one person.
 */
export const writeLimiter = (req, res, next) => {
	if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
	const subject = req.user ? `user:${req.user._id}` : `ip:${addressOf(req)}`;
	const bucket = hit(`write:${subject}`, LIMITS.write.windowMs);
	if (bucket.count > LIMITS.write.limit) {
		return next(tooMany(bucket.resetAt, 'You are sending requests too quickly. Slow down and try again.'));
	}
	next();
};

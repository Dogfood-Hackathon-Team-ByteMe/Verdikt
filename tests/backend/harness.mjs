/**
 * Test harness: a throwaway MongoDB, the real Express app on a real port, and
 * a tiny HTTP client that remembers cookies the way a browser does.
 *
 * Deliberately end-to-end. The T1 rule is that role checks must hold "at the
 * API level, not just the UI", so the tests speak HTTP and never reach into a
 * service directly.
 *
 * The in-memory MongoDB runs as a single-node replica set because several
 * services use multi-document transactions (runInTransaction), which standalone
 * mongod does not support.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../src/backend/app.js';
import { LIMITS, resetRateLimits } from '../../src/backend/middlewares/rateLimit.js';

let replset;
let server;
let baseUrl;

export async function startTestServer() {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replset.getUri(), { dbName: 'verdikt-test' });

    // Build the indexes the tests rely on (the unique judge+project score
    // constraint, the unique email). Mongoose builds these lazily otherwise,
    // which makes duplicate-key assertions flaky.
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

    // The suites hammer the API far harder than any person would, which is the
    // point of them. The shipped ceilings are exercised deliberately in
    // stageI.abuse.mjs, which tightens these and puts them back; everywhere
    // else they are lifted out of the way so a rate limit cannot masquerade as
    // a broken endpoint.
    LIMITS.loginEmail.limit = 100_000;
    LIMITS.loginIp.limit = 100_000;
    LIMITS.register.limit = 100_000;
    LIMITS.write.limit = 100_000;
    LIMITS.comment.limit = 100_000;
    LIMITS.publicRead.limit = 100_000;

    const app = createApp();
    await new Promise((resolve) => {
        server = app.listen(0, resolve); // port 0 = let the OS pick a free one
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    return baseUrl;
}

export async function stopTestServer() {
    if (server) await new Promise((r) => server.close(r));
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
    if (replset) await replset.stop();
}

/** Wipe every collection between test groups so they cannot bleed into each other. */
export async function resetDatabase() {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
    // Counters live in memory, not in Mongo, so wiping the database alone
    // would carry one group's attempts into the next.
    resetRateLimits();
}

/**
 * A client that holds one cookie jar, i.e. one browser session.
 * Create several to act as different users in the same test.
 */
export function createClient() {
    const jar = new Map();

    const applySetCookie = (res) => {
        // Node exposes repeated Set-Cookie headers through getSetCookie().
        const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
        for (const line of raw) {
            const [pair] = line.split(';');
            const idx = pair.indexOf('=');
            const name = pair.slice(0, idx).trim();
            const value = pair.slice(idx + 1).trim();
            // An expired/emptied cookie is the server clearing it (logout).
            if (!value || /expires=thu, 01 jan 1970/i.test(line)) jar.delete(name);
            else jar.set(name, value);
        }
    };

    const request = async (method, path, body) => {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (jar.size > 0) {
            headers.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
        }

        const res = await fetch(baseUrl + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        applySetCookie(res);

        const text = await res.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null; // Non-JSON (the CSV export, say); `text` still carries it.
        }
        return { status: res.status, body: json, text, headers: res.headers };
    };

    return {
        get: (p) => request('GET', p),
        post: (p, b) => request('POST', p, b),
        put: (p, b) => request('PUT', p, b),
        patch: (p, b) => request('PATCH', p, b),
        del: (p) => request('DELETE', p),
        /** True once this client holds a session cookie. */
        get signedIn() {
            return jar.has('session');
        },
        clearCookies: () => jar.clear(),
    };
}

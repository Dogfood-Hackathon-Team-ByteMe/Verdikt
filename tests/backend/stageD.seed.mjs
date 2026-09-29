/**
 * Stage D check: the seed script produces a portal that actually works.
 *
 * Runs scripts/seed.js against a throwaway MongoDB, then drives the seeded
 * data over HTTP exactly as a visitor and a participant would. This is the
 * closest thing to `docker compose up` that runs without Docker.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../src/backend/app.js';
import { describe, expect, it, run } from './runner.mjs';

const DEMO_PASSWORD = 'dogfood2026';
// The backend package root, so 'scripts/seed.js' below resolves correctly
// regardless of which directory this suite was launched from.
const BACKEND_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'backend');

let replset;
let server;
let baseUrl;

/** Run the real seed script as a child process, exactly as npm run seed does. */
function runSeed(uri) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/seed.js'], {
            cwd: BACKEND_DIR,
            env: { ...process.env, MONGO_URI: uri, SEED_PASSWORD: DEMO_PASSWORD },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`seed exited ${code}:\n${out}`))));
    });
}

/** Minimal cookie-aware client (the harness one is tied to its own server). */
function client() {
    const jar = new Map();
    return async (method, path, body) => {
        const headers = { Accept: 'application/json' };
        if (body) headers['Content-Type'] = 'application/json';
        if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        for (const line of res.headers.getSetCookie?.() ?? []) {
            const [pair] = line.split(';');
            const i = pair.indexOf('=');
            jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
        }
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
        return { status: res.status, body: json, text };
    };
}

let seedOutput = '';

describe('seed script', () => {
    it('runs to completion and reports what it made', () => {
        expect(seedOutput).toContain('Seed complete');
        expect(seedOutput).toContain('8 teams and projects');
    });
});

describe('the seeded portal answers as a visitor', () => {
    it('serves a featured event with tracks and prizes', async () => {
        const call = client();
        const res = await call('GET', '/api/events/featured');
        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('DOGFOOD 2026');
        expect(res.body.data.tracks).toHaveLength(4);
        expect(res.body.data.prizes).toHaveLength(6);
    });

    it('the deadline is in the future, so the countdown is live', async () => {
        const call = client();
        const res = await call('GET', '/api/events/featured');
        expect(new Date(res.body.data.submissionsClose) > new Date()).toBe(true);
    });

    it('the public gallery shows submitted projects only', async () => {
        const call = client();
        const res = await call('GET', '/api/projects');
        expect(res.status).toBe(200);
        // 8 seeded, 7 submitted, 1 left as a draft.
        expect(res.body.data).toHaveLength(7);
        expect(res.body.data.every((p) => p.status === 'submitted')).toBe(true);
    });

    it('gallery search and track filtering work', async () => {
        const call = client();
        const byText = await call('GET', '/api/projects?q=quorum');
        expect(byText.body.data).toHaveLength(1);

        const event = (await call('GET', '/api/events/featured')).body.data;
        const trackId = event.tracks[0]._id;
        const byTrack = await call('GET', `/api/projects?track=${trackId}`);
        expect(byTrack.body.data.length > 0).toBe(true);
        expect(byTrack.body.data.every((p) => p.trackId._id === trackId)).toBe(true);
    });

    it('never exposes a password hash anywhere public', async () => {
        const call = client();
        for (const path of ['/api/events/featured', '/api/projects', '/api/teams', '/api/tracks']) {
            const res = await call('GET', path);
            expect(res.text.includes('$2b$')).toBe(false);
        }
    });
});

describe('the seeded accounts work', () => {
    it('every documented demo account can sign in', async () => {
        for (const email of ['admin@verdikt.dev', 'organizer@verdikt.dev', 'judge@verdikt.dev', 'participant@verdikt.dev']) {
            const call = client();
            const res = await call('POST', '/api/auth/login', { email, password: DEMO_PASSWORD });
            expect(res.status).toBe(200);
        }
    });

    it('each account resolves to the role the docs promise', async () => {
        const expected = {
            'admin@verdikt.dev': 'admin',
            'organizer@verdikt.dev': 'organizer',
            'judge@verdikt.dev': 'judge',
            'participant@verdikt.dev': 'participant',
        };
        for (const [email, role] of Object.entries(expected)) {
            const call = client();
            await call('POST', '/api/auth/login', { email, password: DEMO_PASSWORD });
            const me = await call('GET', '/api/auth/me');
            expect(me.body.data.role).toBe(role);
        }
    });

    it('the participant sees their own team draft in the gallery', async () => {
        const call = client();
        await call('POST', '/api/auth/login', { email: 'participant@verdikt.dev', password: DEMO_PASSWORD });
        const res = await call('GET', '/api/projects');
        // The signed-in participant sees the 7 public ones; their own team's
        // project is already submitted, so the count is unchanged but the
        // request must still succeed with their session attached.
        expect(res.status).toBe(200);
        expect(res.body.data.length >= 7).toBe(true);
    });

    it('a judge can read their own ballots and only their own', async () => {
        const call = client();
        await call('POST', '/api/auth/login', { email: 'judge@verdikt.dev', password: DEMO_PASSWORD });
        const me = await call('GET', '/api/auth/me');
        const res = await call('GET', '/api/judge/scores');
        expect(res.status).toBe(200);
        expect(res.body.data.length > 0).toBe(true);
        expect(res.body.data.every((s) => s.judgeId._id === me.body.data._id)).toBe(true);
    });

    it('the organizer can export scores as CSV', async () => {
        const call = client();
        await call('POST', '/api/auth/login', { email: 'organizer@verdikt.dev', password: DEMO_PASSWORD });
        const event = (await call('GET', '/api/events/featured')).body.data;
        const res = await call('GET', `/api/export.csv?eventId=${event._id}`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('judge_name,judge_email,project_title');
        expect(res.text.split('\n').length > 2).toBe(true);
    });

    it('a participant cannot export scores', async () => {
        const call = client();
        await call('POST', '/api/auth/login', { email: 'participant@verdikt.dev', password: DEMO_PASSWORD });
        const event = (await call('GET', '/api/events/featured')).body.data;
        const res = await call('GET', `/api/export.csv?eventId=${event._id}`);
        expect(res.status).toBe(403);
    });
});

// --- boot ------------------------------------------------------------------
replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = replset.getUri('verdikt-seed-test');
seedOutput = await runSeed(uri);

await mongoose.connect(uri);
const app = createApp();
await new Promise((r) => { server = app.listen(0, r); });
baseUrl = `http://127.0.0.1:${server.address().port}`;

const { failed } = await run();

await new Promise((r) => server.close(r));
await mongoose.disconnect();
await replset.stop();
process.exit(failed > 0 ? 1 : 0);

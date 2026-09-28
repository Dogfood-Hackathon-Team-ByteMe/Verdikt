/**
 * Stage I: Tier 3 phase 1 -- anti-abuse.
 *
 * Two things are being checked, and they pull in opposite directions. A limit
 * has to actually stop an attack: enough wrong passwords in a row and the
 * account stops answering. And it has to not stop anybody else -- the person at
 * the next desk, sharing the same public address, must still be able to sign
 * in, and someone who mistyped twice and then got it right must not be carrying
 * those two attempts around.
 *
 * The audit trail is checked the same way: it has to record what happened, and
 * it has to refuse to show it to the people it describes.
 */
import mongoose from 'mongoose';
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { PASSWORD, createEvent, createTeam, createTrack, makeAdmin, registerUser } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';
import { LIMITS, resetRateLimits } from '../middlewares/rateLimit.js';

let seq = 0;
const email = (name) => `${name}-${++seq}-i@verdikt.dev`;

/**
 * Run `fn` with the shipped ceilings replaced by tight ones, then put them
 * back. The harness lifts the limits out of the way for every other suite, so
 * this is the only place they are exercised for real.
 */
async function withLimits(overrides, fn) {
    const saved = JSON.parse(JSON.stringify(LIMITS));
    for (const [name, patch] of Object.entries(overrides)) Object.assign(LIMITS[name], patch);
    resetRateLimits();
    try {
        return await fn();
    } finally {
        for (const [name, values] of Object.entries(saved)) Object.assign(LIMITS[name], values);
        resetRateLimits();
    }
}

const wrongPassword = (client, address) =>
    client.post('/api/auth/login', { email: address, password: 'not-the-password' });

describe('sign-in cannot be brute-forced', () => {
    it('an account stops answering after enough wrong passwords', async () => {
        const victim = await registerUser(email('victim'));
        await withLimits({ loginEmail: { limit: 3 } }, async () => {
            const attacker = createClient();
            for (let i = 0; i < 3; i++) {
                expect((await wrongPassword(attacker, victim.user.email)).status).toBe(401);
            }
            const blocked = await wrongPassword(attacker, victim.user.email);
            expect(blocked.status).toBe(429);
            expect(blocked.body.message).toContain('Too many failed sign-in attempts');
        });
    });

    it('a blocked account stays blocked even with the right password', async () => {
        const victim = await registerUser(email('victim'));
        await withLimits({ loginEmail: { limit: 2 } }, async () => {
            const attacker = createClient();
            await wrongPassword(attacker, victim.user.email);
            await wrongPassword(attacker, victim.user.email);
            // The limit is on the account, not on the guess. An attacker who
            // lands on the right password one attempt too late still gets
            // nothing, which is the whole point of counting failures.
            const late = await createClient().post('/api/auth/login', {
                email: victim.user.email,
                password: PASSWORD,
            });
            expect(late.status).toBe(429);
        });
    });

    it('the refusal says how long to wait', async () => {
        const victim = await registerUser(email('victim'));
        await withLimits({ loginEmail: { limit: 1 } }, async () => {
            const attacker = createClient();
            await wrongPassword(attacker, victim.user.email);
            const blocked = await wrongPassword(attacker, victim.user.email);
            expect(blocked.status).toBe(429);
            const retry = Number(blocked.headers.get('retry-after'));
            expect(Number.isInteger(retry) && retry > 0).toBeTruthy();
        });
    });

    it('locking one account does not lock anyone else out', async () => {
        const victim = await registerUser(email('victim'));
        const bystander = await registerUser(email('bystander'));
        await withLimits({ loginEmail: { limit: 2 }, loginIp: { limit: 1000 } }, async () => {
            const attacker = createClient();
            await wrongPassword(attacker, victim.user.email);
            await wrongPassword(attacker, victim.user.email);
            expect((await wrongPassword(attacker, victim.user.email)).status).toBe(429);

            // Same address, different account: counting by IP alone would have
            // shut out everyone behind one shared connection.
            const ok = await createClient().post('/api/auth/login', {
                email: bystander.user.email,
                password: PASSWORD,
            });
            expect(ok.status).toBe(200);
        });
    });

    it('signing in successfully clears the failures before it', async () => {
        const user = await registerUser(email('forgetful'));
        await withLimits({ loginEmail: { limit: 3 } }, async () => {
            const client = createClient();
            await wrongPassword(client, user.user.email);
            await wrongPassword(client, user.user.email);
            // Third time lucky. This has to wipe the slate, or two mistakes a
            // fortnight would eventually lock out a legitimate user.
            expect(
                (await client.post('/api/auth/login', { email: user.user.email, password: PASSWORD })).status,
            ).toBe(200);

            const after = createClient();
            for (let i = 0; i < 3; i++) {
                expect((await wrongPassword(after, user.user.email)).status).toBe(401);
            }
        });
    });

    it('one address cannot spray guesses across many accounts', async () => {
        const targets = [];
        for (let i = 0; i < 4; i++) targets.push((await registerUser(email('target'))).user.email);
        await withLimits({ loginEmail: { limit: 1000 }, loginIp: { limit: 3 } }, async () => {
            const attacker = createClient();
            // One guess each, so no single account's bucket ever fills. Only
            // the per-address count can see this pattern.
            for (let i = 0; i < 3; i++) {
                expect((await wrongPassword(attacker, targets[i])).status).toBe(401);
            }
            const blocked = await wrongPassword(attacker, targets[3]);
            expect(blocked.status).toBe(429);
            expect(blocked.body.message).toContain('from this address');
        });
    });

    it('accounts cannot be created in bulk from one address', async () => {
        await withLimits({ register: { limit: 2 } }, async () => {
            const client = createClient();
            for (let i = 0; i < 2; i++) {
                const res = await client.post('/api/auth/register', {
                    email: email('bulk'),
                    password: PASSWORD,
                    name: 'Bulk',
                });
                expect(res.status).toBe(201);
            }
            const blocked = await client.post('/api/auth/register', {
                email: email('bulk'),
                password: PASSWORD,
                name: 'Bulk',
            });
            expect(blocked.status).toBe(429);
        });
    });

    it('two signed-in accounts on one address do not share a write budget', async () => {
        // The limiter runs at /api, before any route's own authenticate. It
        // only counts per account because app.js resolves the session first;
        // mounted without that it saw req.user === undefined every time and
        // put a whole shared connection in one bucket.
        const busy = await registerUser(email('busy'));
        const quiet = await registerUser(email('quiet'));

        await withLimits({ write: { limit: 2 } }, async () => {
            for (let i = 0; i < 2; i++) {
                expect((await busy.client.post('/api/teams', { name: `T${i}` })).status).toBeOneOf([201, 400, 403, 404, 409]);
            }
            const blocked = await busy.client.post('/api/teams', { name: 'over' });
            expect(blocked.status).toBe(429);

            // Same address in this harness -- everything is 127.0.0.1 -- so a
            // per-address bucket would have refused this too.
            const ok = await quiet.client.post('/api/teams', { name: 'fine' });
            expect(ok.status).toBeOneOf([201, 400, 403, 404, 409]);
        });
    });

    it('reads are never throttled as writes', async () => {
        await withLimits({ write: { limit: 1 } }, async () => {
            // The write ceiling exists to slow down state changes. Browsing the
            // public gallery is not one, and throttling it would take the site
            // down for everybody at exactly the moment it gets popular.
            for (let i = 0; i < 5; i++) {
                expect((await createClient().get('/api/events')).status).toBe(200);
            }
        });
    });
});

describe('the audit trail records who changed the panel', () => {
    it('appointing and removing a judge is recorded against the event', async () => {
        const organizer = await registerUser(email('org'), 'Mira');
        const event = await createEvent(organizer.client);
        const track = await createTrack(organizer.client, event._id, 'Alpha');
        const judge = await registerUser(email('judge'));

        expect(
            (await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: judge.user.email })).status,
        ).toBe(200);
        expect((await organizer.client.del(`/api/tracks/${track._id}/judges/${judge.id}`)).status).toBe(200);

        const trail = await organizer.client.get(`/api/events/${event._id}/audit`);
        expect(trail.status).toBe(200);
        const actions = trail.body.data.map((row) => row.action);
        expect(actions).toContain('judge.appointed');
        expect(actions).toContain('judge.removed');
    });

    it('a row names who did it and when', async () => {
        const organizer = await registerUser(email('org'), 'Mira');
        const event = await createEvent(organizer.client);
        const track = await createTrack(organizer.client, event._id, 'Alpha');
        const judge = await registerUser(email('judge'));
        await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: judge.user.email });

        const trail = await organizer.client.get(`/api/events/${event._id}/audit`);
        const row = trail.body.data.find((r) => r.action === 'judge.appointed');
        expect(row).toBeDefined();
        expect(row.actorId._id).toBe(organizer.id);
        expect(row.createdAt).toBeDefined();
    });

    it('the newest change is first', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        await organizer.client.put(`/api/events/${event._id}`, { tagline: 'one' });
        await organizer.client.put(`/api/events/${event._id}`, { tagline: 'two' });

        const trail = await organizer.client.get(`/api/events/${event._id}/audit`);
        const times = trail.body.data.map((r) => new Date(r.createdAt).getTime());
        expect(times.every((t, i) => i === 0 || times[i - 1] >= t)).toBeTruthy();
    });

    it('an event update records which fields moved, not their values', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        await organizer.client.put(`/api/events/${event._id}`, { tagline: 'a secret working title' });

        const trail = await organizer.client.get(`/api/events/${event._id}/audit`);
        const row = trail.body.data.find((r) => r.action === 'event.updated');
        expect(row.meta.fields).toContain('tagline');
        // The trail is a record of what changed, not a second copy of the
        // event. Values would turn it into one, including unpublished ones.
        expect(JSON.stringify(row.meta).includes('secret working title')).toBeFalsy();
    });

    it('dealing and clearing assignments is recorded', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        const track = await createTrack(organizer.client, event._id, 'Alpha');

        // Dealing needs both a panel and something to deal, so build a real
        // one -- an audit row for a refused deal would be a lie.
        const judge = await registerUser(email('judge'));
        await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: judge.user.email });

        const entrant = await registerUser(email('entrant'));
        const team = await createTeam(entrant.client, event._id, 'Null Island');
        const made = await entrant.client.post('/api/projects', {
            title: 'Audited Entry',
            summary: 'An entry to deal out.',
            repoUrl: 'https://github.com/example/audited',
            trackId: track._id,
            teamId: team._id,
        });
        expect(made.status).toBe(201);
        expect((await entrant.client.post(`/api/projects/${made.body.data._id}/submit`)).status).toBe(200);

        expect(
            (await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 1 }))
                .status,
        ).toBe(200);
        expect((await organizer.client.del(`/api/events/${event._id}/assignments`)).status).toBe(200);

        const actions = (await organizer.client.get(`/api/events/${event._id}/audit`)).body.data.map(
            (r) => r.action,
        );
        expect(actions).toContain('assignments.dealt');
        expect(actions).toContain('assignments.cleared');
    });

    it('a judge invite and its withdrawal land in the event that owns them', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        const track = await createTrack(organizer.client, event._id, 'Alpha');

        const made = await organizer.client.post(`/api/tracks/${track._id}/judge-invites`, {
            email: email('invitee'),
        });
        expect(made.status).toBe(201);
        expect((await organizer.client.del(`/api/judge-invites/${made.body.data._id}`)).status).toBe(200);

        const actions = (await organizer.client.get(`/api/events/${event._id}/audit`)).body.data.map(
            (r) => r.action,
        );
        expect(actions).toContain('judge_invite.created');
        expect(actions).toContain('judge_invite.revoked');
    });

    it('a blocked sign-in is recorded even though it never reached a controller', async () => {
        const victim = await registerUser(email('victim'));
        await withLimits({ loginEmail: { limit: 1 } }, async () => {
            const attacker = createClient();
            await wrongPassword(attacker, victim.user.email);
            expect((await wrongPassword(attacker, victim.user.email)).status).toBe(429);
        });

        const admin = await registerUser(email('admin'));
        await makeAdmin(admin.id);
        await admin.client.post('/api/auth/login', { email: admin.user.email, password: PASSWORD });

        const actions = (await admin.client.get('/api/audit')).body.data.map((r) => r.action);
        expect(actions).toContain('auth.login.failed');
        expect(actions).toContain('auth.login.blocked');
    });
});

describe('the audit trail is not readable by the panel it describes', () => {
    it('a judge cannot read the event trail', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        const track = await createTrack(organizer.client, event._id, 'Alpha');
        const judge = await registerUser(email('judge'));
        await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: judge.user.email });

        // It names every other judge on the panel and the order they arrived in.
        expect((await judge.client.get(`/api/events/${event._id}/audit`)).status).toBe(403);
    });

    it('another organiser cannot read this event trail', async () => {
        const mine = await registerUser(email('org'));
        const event = await createEvent(mine.client);
        const theirs = await registerUser(email('other-org'));
        await createEvent(theirs.client);

        expect((await theirs.client.get(`/api/events/${event._id}/audit`)).status).toBe(403);
    });

    it('a stranger and a signed-out visitor are refused', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        const stranger = await registerUser(email('nosy'));

        expect((await stranger.client.get(`/api/events/${event._id}/audit`)).status).toBe(403);
        expect((await createClient().get(`/api/events/${event._id}/audit`)).status).toBe(401);
    });

    it('only an admin reads the trail across every event', async () => {
        const organizer = await registerUser(email('org'));
        await createEvent(organizer.client);
        expect((await organizer.client.get('/api/audit')).status).toBe(403);

        const admin = await registerUser(email('admin'));
        await makeAdmin(admin.id);
        await admin.client.post('/api/auth/login', { email: admin.user.email, password: PASSWORD });
        expect((await admin.client.get('/api/audit')).status).toBe(200);
    });

    it('an admin reads any event trail without being its organiser', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        const admin = await registerUser(email('admin'));
        await makeAdmin(admin.id);
        await admin.client.post('/api/auth/login', { email: admin.user.email, password: PASSWORD });

        expect((await admin.client.get(`/api/events/${event._id}/audit`)).status).toBe(200);
    });

    it('the trail cannot be written or erased over HTTP', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        const before = await mongoose.model('AuditLog').countDocuments({});

        // There is no write path on purpose: a log you can edit answers no
        // question that a dispute actually asks.
        expect(
            (await organizer.client.post(`/api/events/${event._id}/audit`, { action: 'made.up' })).status,
        ).toBeOneOf([404, 405]);
        expect((await organizer.client.del(`/api/events/${event._id}/audit`)).status).toBeOneOf([404, 405]);
        expect((await organizer.client.post('/api/audit', { action: 'made.up' })).status).toBeOneOf([404, 405]);

        expect(await mongoose.model('AuditLog').countDocuments({})).toBe(before);
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

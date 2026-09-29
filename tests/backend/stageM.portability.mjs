/**
 * Stage M: Tier 4 phases 3-5 -- bulk export/import, the embeddable gallery
 * widget, and the documented API surface.
 *
 * The portability claim under test is the round trip: an event exported from
 * one instance and imported into another must rank the same. And what the
 * bundle must NOT do matters as much: no password hash travels, and an
 * imported stranger's account cannot be signed into by whoever holds the file.
 */
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { PASSWORD, createEvent, createTeam, createTrack, makeJudge, registerUser } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';

let seq = 0;
const email = (name) => `${name}-${++seq}-m@verdikt.dev`;

/**
 * A judged event: rubric, two teams with submitted entries, one judge, two
 * ballots -- enough for standings to mean something after the round trip.
 */
async function judgedScene() {
    const organizer = await registerUser(email('org'), 'Mira');
    const event = await createEvent(organizer.client, {
        criteria: [
            { key: 'design', label: 'Design', weight: 2, maxScore: 5 },
            { key: 'wow', label: 'Wow', weight: 1, maxScore: 10 },
        ],
    });
    const track = await createTrack(organizer.client, event._id, 'Main');

    const entries = [];
    for (const title of ['Quorum', 'Verdict']) {
        const founder = await registerUser(email('founder'), `Founder ${title}`);
        const team = await createTeam(founder.client, event._id, `${title} Team`);
        const made = await founder.client.post('/api/projects', {
            title,
            summary: `${title} summary.`,
            repoUrl: `https://github.com/example/${title.toLowerCase()}`,
            trackId: track._id,
            teamId: team._id,
        });
        if (made.status !== 201) throw new Error(`scene project: ${made.status} ${made.text}`);
        await founder.client.post(`/api/projects/${made.body.data._id}/submit`);
        entries.push({ founder, team, project: made.body.data });
    }

    const judge = await registerUser(email('judge'), 'Katalin');
    await makeJudge(judge.id, event._id, track._id);
    for (const [i, entry] of entries.entries()) {
        const cast = await judge.client.put('/api/scores/ballot', {
            projectId: entry.project._id,
            scores: { design: 5 - i * 2, wow: 8 - i * 3 },
        });
        if (cast.status !== 200 && cast.status !== 201) throw new Error(`scene ballot: ${cast.status} ${cast.text}`);
    }

    return { organizer, event, track, entries, judge };
}

describe('bulk export', () => {
    it('the organiser gets one bundle carrying the whole event', async () => {
        const { organizer, event } = await judgedScene();
        const res = await organizer.client.get(`/api/events/${event._id}/export`);
        expect(res.status).toBe(200);
        const bundle = res.body;
        expect(bundle.format).toBe('verdikt-event');
        expect(bundle.version).toBe(1);
        expect(bundle.tracks).toHaveLength(1);
        expect(bundle.teams).toHaveLength(2);
        expect(bundle.projects).toHaveLength(2);
        expect(bundle.scores).toHaveLength(2);
        expect(bundle.event.criteria).toHaveLength(2);
    });

    it('no password hash and no bcrypt string travels in the bundle', async () => {
        const { organizer, event } = await judgedScene();
        const res = await organizer.client.get(`/api/events/${event._id}/export`);
        expect(res.text.includes('password')).toBe(false);
        expect(res.text.includes('$2b$')).toBe(false);
    });

    it('a participant, a judge, a stranger and a visitor cannot export', async () => {
        const { event, entries, judge } = await judgedScene();
        const stranger = await registerUser(email('stranger'));
        for (const who of [entries[0].founder, judge, stranger]) {
            expect((await who.client.get(`/api/events/${event._id}/export`)).status).toBe(403);
        }
        expect((await createClient().get(`/api/events/${event._id}/export`)).status).toBe(401);
    });
});

describe('bulk import', () => {
    it('the round trip preserves the ranking', async () => {
        const { organizer, event } = await judgedScene();
        const before = (await organizer.client.get(`/api/events/${event._id}/standings`)).body.data;
        const bundle = (await organizer.client.get(`/api/events/${event._id}/export`)).body;

        const newcomer = await registerUser(email('newcomer'), 'Noor');
        const imported = await newcomer.client.post('/api/events/import', bundle);
        expect(imported.status).toBe(201);
        expect(imported.body.data.projects).toBe(2);
        expect(imported.body.data.ballots).toBe(2);

        const after = (await newcomer.client.get(`/api/events/${imported.body.data.eventId}/standings`)).body.data;
        const strip = (rows) => rows.map((r) => ({ title: r.title, rank: r.rank, score: r.weightedScore ?? r.score ?? null }));
        expect(strip(after.entries ?? after.standings ?? after)).toEqual(strip(before.entries ?? before.standings ?? before));
    });

    it('the importer becomes the organiser; the original organiser is a stranger here', async () => {
        const { organizer, event } = await judgedScene();
        const bundle = (await organizer.client.get(`/api/events/${event._id}/export`)).body;

        const newcomer = await registerUser(email('newcomer'));
        const imported = await newcomer.client.post('/api/events/import', bundle);
        const copyId = imported.body.data.eventId;

        expect((await newcomer.client.get(`/api/events/${copyId}/standings`)).status).toBe(200);
        expect((await organizer.client.get(`/api/events/${copyId}/standings`)).status).toBe(403);
    });

    it('an account minted for an imported stranger cannot be signed into', async () => {
        const { organizer, event, entries } = await judgedScene();
        const bundle = (await organizer.client.get(`/api/events/${event._id}/export`)).body;

        // Wipe and import into a "fresh instance": nobody from the bundle exists.
        await resetDatabase();
        const newcomer = await registerUser(email('newcomer'));
        const imported = await newcomer.client.post('/api/events/import', bundle);
        expect(imported.status).toBe(201);

        const foundersEmail = bundle.users.find((u) => u.name.startsWith('Founder'))?.email;
        const attempt = await createClient().post('/api/auth/login', { email: foundersEmail, password: PASSWORD });
        expect(attempt.status).toBe(401);
    });

    it('an existing account is linked by email, not duplicated', async () => {
        const { organizer, event, judge } = await judgedScene();
        const bundle = (await organizer.client.get(`/api/events/${event._id}/export`)).body;

        const imported = await organizer.client.post('/api/events/import', bundle);
        const copyId = imported.body.data.eventId;

        // The judge's real account judges the copy too: their queue answers.
        const queue = await judge.client.get(`/api/judge/queue?eventId=${copyId}`);
        expect(queue.status).toBe(200);
        expect(queue.body.data.projects).toHaveLength(2);
    });

    it('garbage, a wrong format and a wrong version are refused', async () => {
        const someone = await registerUser(email('someone'));
        expect((await someone.client.post('/api/events/import', { format: 'not-verdikt', version: 1 })).status).toBe(400);
        expect((await someone.client.post('/api/events/import', { format: 'verdikt-event', version: 99 })).status).toBe(400);
        expect((await someone.client.post('/api/events/import', {})).status).toBe(400);
        expect((await createClient().post('/api/events/import', { format: 'verdikt-event', version: 1 })).status).toBe(401);
    });
});

describe('the embeddable gallery widget', () => {
    it('serves a self-contained page of submitted entries, framable anywhere', async () => {
        const { event } = await judgedScene();
        const anon = createClient();
        const res = await anon.get(`/api/v1/events/${event._id}/embed`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        expect(res.headers.get('content-security-policy')).toContain('frame-ancestors *');
        expect(res.text).toContain('Quorum');
        expect(res.text).toContain('Verdict');
        expect(res.text.includes('<script')).toBe(false);
    });

    it('drafts stay out of the widget, and titles are escaped', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        const track = await createTrack(organizer.client, event._id, 'Main');
        const founder = await registerUser(email('founder'));
        const team = await createTeam(founder.client, event._id, 'XSS Team');
        const made = await founder.client.post('/api/projects', {
            title: '<img src=x onerror=alert(1)>',
            summary: 'A hostile title.',
            repoUrl: 'https://github.com/example/xss',
            trackId: track._id,
            teamId: team._id,
        });

        const anon = createClient();
        const asDraft = await anon.get(`/api/v1/events/${event._id}/embed`);
        expect(asDraft.text.includes('onerror')).toBe(false);

        await founder.client.post(`/api/projects/${made.body.data._id}/submit`);
        const submitted = await anon.get(`/api/v1/events/${event._id}/embed`);
        expect(submitted.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(submitted.text.includes('<img src=x')).toBe(false);
    });

    it('an unknown event is a 404, not an empty page', async () => {
        const anon = createClient();
        expect((await anon.get('/api/v1/events/000000000000000000000000/embed')).status).toBe(404);
    });
});

describe('the documented API surface', () => {
    it('serves a parseable OpenAPI spec that names the routes the app really has', async () => {
        const anon = createClient();
        const res = await anon.get('/api/v1/openapi.json');
        expect(res.status).toBe(200);
        const spec = res.body;
        expect(spec.openapi).toContain('3.0');
        for (const path of [
            '/api/auth/login',
            '/api/events',
            '/api/projects/{id}/submit',
            '/api/scores/ballot',
            '/api/events/{id}/webhooks',
            '/api/events/{id}/certificates',
            '/api/events/import',
            '/api/v1/certificates/{serial}',
        ]) {
            expect(Boolean(spec.paths[path])).toBe(true);
        }
    });

    it('the v1 index lists the T4 endpoints', async () => {
        const anon = createClient();
        const { body } = await anon.get('/api/v1');
        const endpoints = body.data.endpoints.join(' ');
        expect(endpoints).toContain('/embed');
        expect(endpoints).toContain('/certificates/');
        expect(endpoints).toContain('openapi.json');
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

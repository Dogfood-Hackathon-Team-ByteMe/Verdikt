/**
 * Stage K: Tier 4 phase 1 -- webhooks.
 *
 * The two promises under test: a webhook never breaks the action it announces
 * (a dead receiver costs a failed delivery row, not a submission), and every
 * delivery is signed so an unauthenticated receiver can prove who is calling.
 * The rest is the usual Verdikt question -- who may NOT do this: only the
 * event's own organiser registers, lists, deletes or redelivers.
 */
import crypto from 'node:crypto';
import http from 'node:http';
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { createEvent, createTeam, createTrack, makeJudge, registerUser } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';
import { RETRY_DELAYS_MS, flushWebhooks } from '../services/WebhookService.js';

// The shipped backoff is seconds; the suite needs milliseconds.
RETRY_DELAYS_MS[0] = 10;
RETRY_DELAYS_MS[1] = 10;

let seq = 0;
const email = (name) => `${name}-${++seq}-k@verdikt.dev`;

/** A tiny receiver that records everything it is sent. */
function startReceiver({ status = 200, port = 0 } = {}) {
    const received = [];
    const server = http.createServer((req, res) => {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => {
            received.push({ headers: req.headers, body: data });
            res.statusCode = status;
            res.end('ok');
        });
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () =>
            resolve({
                port: server.address().port,
                url: `http://127.0.0.1:${server.address().port}/hook`,
                received,
                close: () => new Promise((r) => server.close(r)),
            }),
        );
    });
}

/** Organizer, open event, track, and a team with a draft ready to submit. */
async function scene() {
    const organizer = await registerUser(email('org'), 'Mira');
    const event = await createEvent(organizer.client);
    const track = await createTrack(organizer.client, event._id, 'Main');

    const founder = await registerUser(email('founder'), 'Ada');
    const team = await createTeam(founder.client, event._id, 'Null Island');
    const made = await founder.client.post('/api/projects', {
        title: 'Quorum',
        summary: 'Pairwise judging engine.',
        repoUrl: 'https://github.com/example/quorum',
        trackId: track._id,
        teamId: team._id,
    });
    if (made.status !== 201) throw new Error(`scene project: ${made.status} ${made.text}`);
    return { organizer, event, track, founder, team, project: made.body.data };
}

const hookFor = async (organizer, eventId, url, types) => {
    const res = await organizer.client.post(`/api/events/${eventId}/webhooks`, {
        url,
        ...(types ? { events: types } : {}),
    });
    if (res.status !== 201) throw new Error(`hookFor: ${res.status} ${res.text}`);
    return res.body.data;
};

describe('registering a webhook is the organiser’s power and nobody else’s', () => {
    it('the organiser registers an endpoint and gets a server-minted secret', async () => {
        const { organizer, event } = await scene();
        const hook = await hookFor(organizer, event._id, 'http://127.0.0.1:9/hook');
        expect(typeof hook.secret).toBe('string');
        expect(hook.secret.length >= 64).toBe(true);

        const list = await organizer.client.get(`/api/events/${event._id}/webhooks`);
        expect(list.status).toBe(200);
        expect(list.body.data).toHaveLength(1);
    });

    it('the caller cannot choose their own secret', async () => {
        const { organizer, event } = await scene();
        const res = await organizer.client.post(`/api/events/${event._id}/webhooks`, {
            url: 'http://127.0.0.1:9/hook',
            secret: 'chosen-by-me',
        });
        expect(res.status).toBe(201);
        expect(res.body.data.secret === 'chosen-by-me').toBe(false);
    });

    it('a participant, a judge, a stranger and a visitor are all refused', async () => {
        const { organizer, event, track, founder } = await scene();
        const judge = await registerUser(email('judge'));
        await makeJudge(judge.id, event._id, track._id);
        const stranger = await registerUser(email('stranger'));

        for (const who of [founder, judge, stranger]) {
            expect((await who.client.post(`/api/events/${event._id}/webhooks`, { url: 'http://127.0.0.1:9/x' })).status).toBe(403);
            expect((await who.client.get(`/api/events/${event._id}/webhooks`)).status).toBe(403);
        }
        expect((await createClient().post(`/api/events/${event._id}/webhooks`, { url: 'http://127.0.0.1:9/x' })).status).toBe(401);
    });

    it('the organiser of a different event is a stranger here', async () => {
        const { event } = await scene();
        const other = await registerUser(email('other-org'));
        await createEvent(other.client);
        expect((await other.client.post(`/api/events/${event._id}/webhooks`, { url: 'http://127.0.0.1:9/x' })).status).toBe(403);
    });

    it('a nonsense URL, a non-http scheme and an unknown type are refused', async () => {
        const { organizer, event } = await scene();
        expect((await organizer.client.post(`/api/events/${event._id}/webhooks`, { url: 'not a url' })).status).toBe(400);
        expect((await organizer.client.post(`/api/events/${event._id}/webhooks`, { url: 'ftp://example.com/x' })).status).toBe(400);
        expect((await organizer.client.post(`/api/events/${event._id}/webhooks`, { url: 'http://127.0.0.1:9/x', events: ['no.such.type'] })).status).toBe(400);
    });

    it('deleting is organiser-only, and both acts land in the audit trail', async () => {
        const { organizer, event } = await scene();
        const hook = await hookFor(organizer, event._id, 'http://127.0.0.1:9/hook');

        const stranger = await registerUser(email('stranger'));
        expect((await stranger.client.del(`/api/webhooks/${hook._id}`)).status).toBe(403);

        expect((await organizer.client.del(`/api/webhooks/${hook._id}`)).status).toBe(200);
        expect((await organizer.client.get(`/api/events/${event._id}/webhooks`)).body.data).toHaveLength(0);

        const trail = await organizer.client.get(`/api/events/${event._id}/audit`);
        const actions = trail.body.data.map((row) => row.action);
        expect(actions).toContain('webhook.created');
        expect(actions).toContain('webhook.deleted');
    });
});

describe('deliveries are signed, filtered and recorded', () => {
    it('submitting a project fires the hook with a verifiable signature', async () => {
        const { organizer, event, founder, project } = await scene();
        const receiver = await startReceiver();
        try {
            const hook = await hookFor(organizer, event._id, receiver.url);

            expect((await founder.client.post(`/api/projects/${project._id}/submit`)).status).toBe(200);
            await flushWebhooks();

            expect(receiver.received).toHaveLength(1);
            const [hit] = receiver.received;
            expect(hit.headers['x-verdikt-event']).toBe('project.submitted');
            expect(typeof hit.headers['x-verdikt-delivery']).toBe('string');

            const expected = 'sha256=' + crypto.createHmac('sha256', hook.secret).update(hit.body).digest('hex');
            expect(hit.headers['x-verdikt-signature']).toBe(expected);

            const payload = JSON.parse(hit.body);
            expect(payload.type).toBe('project.submitted');
            expect(payload.eventId).toBe(event._id);
            expect(payload.data.title).toBe('Quorum');
        } finally {
            await receiver.close();
        }
    });

    it('a subscription filtered to one type does not receive the others', async () => {
        const { organizer, event, founder, project } = await scene();
        const receiver = await startReceiver();
        try {
            await hookFor(organizer, event._id, receiver.url, ['project.withdrawn']);

            await founder.client.post(`/api/projects/${project._id}/submit`);
            await flushWebhooks();
            expect(receiver.received).toHaveLength(0);

            await founder.client.post(`/api/projects/${project._id}/unsubmit`);
            await flushWebhooks();
            expect(receiver.received).toHaveLength(1);
            expect(receiver.received[0].headers['x-verdikt-event']).toBe('project.withdrawn');
        } finally {
            await receiver.close();
        }
    });

    it('a ballot fires the hook but never carries the scores', async () => {
        const { organizer, event, track, founder, project } = await scene();
        await founder.client.post(`/api/projects/${project._id}/submit`);
        const judge = await registerUser(email('judge'));
        await makeJudge(judge.id, event._id, track._id);

        const receiver = await startReceiver();
        try {
            await hookFor(organizer, event._id, receiver.url, ['ballot.cast']);

            const cast = await judge.client.put('/api/scores/ballot', {
                projectId: project._id,
                scores: { overall: 4 },
            });
            expect(cast.status).toBeOneOf([200, 201]);
            await flushWebhooks();

            expect(receiver.received).toHaveLength(1);
            const payload = JSON.parse(receiver.received[0].body);
            expect(payload.data.projectId).toBe(project._id);
            expect(payload.data.scores === undefined).toBe(true);
            expect(receiver.received[0].body.includes('"overall"')).toBe(false);
        } finally {
            await receiver.close();
        }
    });

    it('the delivery log records a landed payload as delivered', async () => {
        const { organizer, event, founder, project } = await scene();
        const receiver = await startReceiver();
        try {
            const hook = await hookFor(organizer, event._id, receiver.url);
            await founder.client.post(`/api/projects/${project._id}/submit`);
            await flushWebhooks();

            const log = await organizer.client.get(`/api/webhooks/${hook._id}/deliveries`);
            expect(log.status).toBe(200);
            expect(log.body.data).toHaveLength(1);
            expect(log.body.data[0].status).toBe('delivered');
            expect(log.body.data[0].responseStatus).toBe(200);
            expect(log.body.data[0].attempts).toBe(1);
        } finally {
            await receiver.close();
        }
    });

    it('a dead receiver fails the delivery after retries, and the submission survives', async () => {
        const { organizer, event, founder, project } = await scene();
        // A receiver that is up just long enough to be registered, then gone.
        const receiver = await startReceiver();
        await receiver.close();

        const hook = await hookFor(organizer, event._id, receiver.url);
        const submitted = await founder.client.post(`/api/projects/${project._id}/submit`);
        expect(submitted.status).toBe(200);
        await flushWebhooks();

        const log = await organizer.client.get(`/api/webhooks/${hook._id}/deliveries`);
        expect(log.body.data).toHaveLength(1);
        expect(log.body.data[0].status).toBe('failed');
        expect(log.body.data[0].attempts).toBe(3);
    });

    it('a failed delivery can be redelivered by hand once the receiver is back', async () => {
        const { organizer, event, founder, project } = await scene();
        const gone = await startReceiver();
        const port = gone.port;
        await gone.close();

        const hook = await hookFor(organizer, event._id, `http://127.0.0.1:${port}/hook`);
        await founder.client.post(`/api/projects/${project._id}/submit`);
        await flushWebhooks();

        const failed = (await organizer.client.get(`/api/webhooks/${hook._id}/deliveries`)).body.data[0];
        expect(failed.status).toBe('failed');

        const back = await startReceiver({ port });
        try {
            const stranger = await registerUser(email('stranger'));
            expect((await stranger.client.post(`/api/webhooks/${hook._id}/deliveries/${failed._id}/redeliver`)).status).toBe(403);

            const redo = await organizer.client.post(`/api/webhooks/${hook._id}/deliveries/${failed._id}/redeliver`);
            expect(redo.status).toBe(200);
            expect(redo.body.data.status).toBe('delivered');
            expect(back.received).toHaveLength(1);
            // Byte-for-byte the same body, so the original signature story holds.
            const payload = JSON.parse(back.received[0].body);
            expect(payload.type).toBe('project.submitted');
        } finally {
            await back.close();
        }
    });

    it('a receiver answering 500 is a failed delivery, not a delivered one', async () => {
        const { organizer, event, founder, project } = await scene();
        const receiver = await startReceiver({ status: 500 });
        try {
            const hook = await hookFor(organizer, event._id, receiver.url);
            await founder.client.post(`/api/projects/${project._id}/submit`);
            await flushWebhooks();

            const log = await organizer.client.get(`/api/webhooks/${hook._id}/deliveries`);
            expect(log.body.data[0].status).toBe('failed');
            expect(log.body.data[0].responseStatus).toBe(500);
        } finally {
            await receiver.close();
        }
    });

    it('appointing a judge by email fires judge.appointed', async () => {
        const { organizer, event, track } = await scene();
        const judge = await registerUser(email('judge'), 'Grace');
        const receiver = await startReceiver();
        try {
            await hookFor(organizer, event._id, receiver.url, ['judge.appointed']);
            const appointed = await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: judge.user.email });
            expect(appointed.status).toBeOneOf([200, 201]);
            await flushWebhooks();

            expect(receiver.received).toHaveLength(1);
            const payload = JSON.parse(receiver.received[0].body);
            expect(payload.data.judgeName).toBe('Grace');
        } finally {
            await receiver.close();
        }
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

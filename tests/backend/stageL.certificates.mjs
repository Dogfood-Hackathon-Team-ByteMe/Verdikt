/**
 * Stage L: Tier 4 phase 2 -- certificates and signed judge records.
 *
 * "Publicly verifiable" is the claim under test: a certificate must verify by
 * serial with no account, verify offline with nothing but the public key, and
 * fail loudly if a byte of the record is altered. The issuing rules are the
 * familiar ones -- organiser-only, idempotent, and a judge who never scored
 * gets no record, because the record certifies work, not a listing.
 */
import crypto from 'node:crypto';
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { createEvent, createTeam, createTrack, makeJudge, registerUser } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';

let seq = 0;
const email = (name) => `${name}-${++seq}-l@verdikt.dev`;

/** Organizer, event, track, and one team of two with a SUBMITTED entry. */
async function scene() {
    const organizer = await registerUser(email('org'), 'Mira');
    const event = await createEvent(organizer.client);
    const track = await createTrack(organizer.client, event._id, 'Main');

    const founder = await registerUser(email('founder'), 'Ada');
    const team = await createTeam(founder.client, event._id, 'Null Island');

    const mate = await registerUser(email('mate'), 'Grace');
    const invite = await founder.client.post('/api/invites', { teamId: team._id });
    if (invite.status !== 201) throw new Error(`scene invite: ${invite.status} ${invite.text}`);
    const joined = await mate.client.post(`/api/invites/token/${invite.body.data.token}/accept`);
    if (joined.status !== 200) throw new Error(`scene join: ${joined.status} ${joined.text}`);

    const made = await founder.client.post('/api/projects', {
        title: 'Quorum',
        summary: 'Pairwise judging engine.',
        repoUrl: 'https://github.com/example/quorum',
        trackId: track._id,
        teamId: team._id,
    });
    if (made.status !== 201) throw new Error(`scene project: ${made.status} ${made.text}`);
    const sub = await founder.client.post(`/api/projects/${made.body.data._id}/submit`);
    if (sub.status !== 200) throw new Error(`scene submit: ${sub.status} ${sub.text}`);
    return { organizer, event, track, founder, mate, team, project: made.body.data };
}

describe('participation certificates', () => {
    it('the organiser issues one per member of every submitted entry', async () => {
        const { organizer, event } = await scene();
        const res = await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' });
        expect(res.status).toBe(201);
        expect(res.body.data).toHaveLength(2); // Ada and Grace

        const names = res.body.data.map((c) => c.recipientName).sort();
        expect(names).toEqual(['Ada', 'Grace']);
    });

    it('issuing twice is idempotent and keeps the original serials', async () => {
        const { organizer, event } = await scene();
        const first = await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' });
        const again = await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' });
        expect(again.body.data).toHaveLength(2);
        expect(again.body.data.map((c) => c.serial).sort()).toEqual(first.body.data.map((c) => c.serial).sort());
    });

    it('a participant, a stranger and a visitor cannot issue or list', async () => {
        const { event, founder } = await scene();
        const stranger = await registerUser(email('stranger'));
        for (const who of [founder, stranger]) {
            expect((await who.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' })).status).toBe(403);
            expect((await who.client.get(`/api/events/${event._id}/certificates`)).status).toBe(403);
        }
        expect((await createClient().post(`/api/events/${event._id}/certificates`, { kind: 'participation' })).status).toBe(401);
    });

    it('a recipient sees their own certificates and only their own', async () => {
        const { organizer, event, founder } = await scene();
        await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' });

        const mine = await founder.client.get('/api/certificates/mine');
        expect(mine.status).toBe(200);
        expect(mine.body.data).toHaveLength(1);
        expect(mine.body.data[0].recipientName).toBe('Ada');

        const outsider = await registerUser(email('outsider'));
        expect((await outsider.client.get('/api/certificates/mine')).body.data).toHaveLength(0);
    });

    it('an event with no submissions has nobody to certify', async () => {
        const organizer = await registerUser(email('org'));
        const event = await createEvent(organizer.client);
        expect((await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' })).status).toBe(400);
    });
});

describe('placement certificates', () => {
    it('the organiser places an entry and its whole team is certified with the place', async () => {
        const { organizer, event, project } = await scene();
        const res = await organizer.client.post(`/api/events/${event._id}/certificates`, {
            kind: 'placement',
            projectId: project._id,
            place: 1,
        });
        expect(res.status).toBe(201);
        expect(res.body.data).toHaveLength(2);
        const record = JSON.parse(res.body.data[0].record);
        expect(record.place).toBe(1);
        expect(record.project).toBe('Quorum');
    });

    it('a project from another event, a draft and a nonsense place are refused', async () => {
        const { organizer, event, founder, project } = await scene();

        const other = await scene();
        expect(
            (await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'placement', projectId: other.project._id, place: 1 })).status,
        ).toBe(404);

        expect(
            (await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'placement', projectId: project._id, place: 0 })).status,
        ).toBe(400);

        await founder.client.post(`/api/projects/${project._id}/unsubmit`);
        expect(
            (await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'placement', projectId: project._id, place: 1 })).status,
        ).toBe(400);
    });
});

describe('signed judge participation records', () => {
    it('a judge who cast ballots gets a record naming their work; one who did not gets none', async () => {
        const { organizer, event, track, project } = await scene();
        const active = await registerUser(email('judge'), 'Katalin');
        const idle = await registerUser(email('idle-judge'), 'Idle');
        await makeJudge(active.id, event._id, track._id);
        await makeJudge(idle.id, event._id, track._id);

        const cast = await active.client.put('/api/scores/ballot', { projectId: project._id, scores: { overall: 4 } });
        expect(cast.status).toBeOneOf([200, 201]);

        const res = await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'judge' });
        expect(res.status).toBe(201);
        expect(res.body.data).toHaveLength(1);

        const record = JSON.parse(res.body.data[0].record);
        expect(record.recipient.name).toBe('Katalin');
        expect(record.role).toBe('judge');
        expect(record.ballotsCast).toBe(1);
        expect(record.tracks).toEqual(['Main']);
    });

    it('with no ballots at all there is nothing to certify', async () => {
        const { organizer, event } = await scene();
        expect((await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'judge' })).status).toBe(400);
    });
});

describe('public verification', () => {
    it('anyone verifies a certificate by serial, with no account', async () => {
        const { organizer, event } = await scene();
        const issued = await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' });
        const serial = issued.body.data[0].serial;

        const anon = createClient();
        const check = await anon.get(`/api/v1/certificates/${serial}`);
        expect(check.status).toBe(200);
        expect(check.body.data.valid).toBe(true);
        expect(check.body.data.details.event.name).toBe('DOGFOOD 2026');
    });

    it('the signature verifies offline with nothing but the public key', async () => {
        const { organizer, event } = await scene();
        const issued = await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' });
        const serial = issued.body.data[0].serial;

        const anon = createClient();
        const { body } = await anon.get(`/api/v1/certificates/${serial}`);
        const { record, signature } = body.data;
        const { publicKeyPem } = (await anon.get('/api/v1/keys/current')).body.data;

        const ok = crypto.verify(
            null,
            Buffer.from(record, 'utf8'),
            crypto.createPublicKey(publicKeyPem),
            Buffer.from(signature, 'base64'),
        );
        expect(ok).toBe(true);
    });

    it('a tampered record fails verification', async () => {
        const { organizer, event } = await scene();
        const issued = await organizer.client.post(`/api/events/${event._id}/certificates`, { kind: 'participation' });
        const serial = issued.body.data[0].serial;

        const anon = createClient();
        const { body } = await anon.get(`/api/v1/certificates/${serial}`);
        const forged = body.data.record.replace('participation', 'placement');

        const ok = crypto.verify(
            null,
            Buffer.from(forged, 'utf8'),
            crypto.createPublicKey(body.data.publicKeyPem),
            Buffer.from(body.data.signature, 'base64'),
        );
        expect(ok).toBe(false);
    });

    it('an unknown serial is a 404, and the v1 surface still takes no verbs but GET', async () => {
        const anon = createClient();
        expect((await anon.get(`/api/v1/certificates/${crypto.randomUUID()}`)).status).toBe(404);
        expect((await anon.post('/api/v1/certificates/anything', {})).status).toBe(404);
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

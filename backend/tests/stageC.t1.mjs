/**
 * Stage C check: the Tier 1 feature set, over HTTP.
 * Run with: node tests/stageC.t1.mjs
 */
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { closeEvent, createEvent, createTeam, createTrack, future, makeAdmin, registerUser, seedScenario } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';

describe('T1: event creation with dates, tracks and prizes', () => {
    it('an organizer can create an event and becomes its organiser', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client);
        expect(event.name).toBe('DOGFOOD 2026');

        const me = await organizer.client.get('/api/auth/me');
        expect(me.body.data.role).toBe('organizer');
        expect(me.body.data.organiserIn).toContain(event._id);
    });

    it('rejects a submissionsClose in the past', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const res = await organizer.client.post('/api/events', {
            name: 'Too late',
            description: 'x',
            submissionsClose: new Date(Date.now() - 1000).toISOString(),
        });
        expect(res.status).toBe(400);
    });

    it('stores configurable prizes and custom questions', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client, {
            prizes: [
                { name: 'Grand Prize', amountUsd: 800 },
                { name: 'Runner-Up', amountUsd: 500 },
            ],
            customQuestions: [{ key: 'whatsHard', label: 'What was hardest?', type: 'longtext', required: true }],
        });
        expect(event.prizes).toHaveLength(2);
        expect(event.prizes[0].amountUsd).toBe(800);
        expect(event.customQuestions[0].key).toBe('whatsHard');
    });

    it('a non-organizer cannot update someone else s event', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client);
        const outsider = await registerUser('mallory@verdikt.dev');
        const res = await outsider.client.put(`/api/events/${event._id}`, { name: 'Hijacked' });
        expect(res.status).toBe(403);
    });

    it('GET /api/events/featured works for an anonymous visitor', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        await createEvent(organizer.client);
        const res = await createClient().get('/api/events/featured');
        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('DOGFOOD 2026');
    });

    it('tracks are listable by an anonymous visitor', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client);
        await createTrack(organizer.client, event._id, 'Security');
        const res = await createClient().get('/api/tracks');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });
});

describe('T1: team formation via invite link', () => {
    it('the leader can create an invite and another user can accept it', async () => {
        const { event, team, participant } = await seedScenario();

        const invite = await participant.client.post('/api/invites', { teamId: team._id });
        expect(invite.status).toBe(201);
        const token = invite.body.data.token;

        // The invite is readable before joining, so the joiner sees the team name.
        const preview = await createClient().get(`/api/invites/token/${token}`);
        expect(preview.status).toBe(200);

        const joiner = await registerUser('rafael@verdikt.dev');
        const accepted = await joiner.client.post(`/api/invites/token/${token}/accept`);
        expect(accepted.status).toBe(200);
        expect(accepted.body.data.members).toHaveLength(2);

        // Joining the team enrols the user in the event.
        const me = await joiner.client.get('/api/auth/me');
        expect(me.body.data.participatingIn).toContain(event._id);
    });

    it('a non-leader cannot create an invite', async () => {
        const { team } = await seedScenario();
        const outsider = await registerUser('mallory@verdikt.dev');
        const res = await outsider.client.post('/api/invites', { teamId: team._id });
        expect(res.status).toBe(403);
    });

    it('rejects an unknown invite token with 404', async () => {
        await seedScenario();
        const res = await createClient().get('/api/invites/token/not-a-real-token');
        expect(res.status).toBe(404);
    });

    it('refuses to admit the same user twice', async () => {
        const { team, participant } = await seedScenario();
        const invite = await participant.client.post('/api/invites', { teamId: team._id });
        const token = invite.body.data.token;

        const joiner = await registerUser('rafael@verdikt.dev');
        expect((await joiner.client.post(`/api/invites/token/${token}/accept`)).status).toBe(200);
        expect((await joiner.client.post(`/api/invites/token/${token}/accept`)).status).toBe(409);
    });

    it('enforces the event s maxTeamSize', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client, { maxTeamSize: 2 });
        const leader = await registerUser('ada@verdikt.dev');
        const team = await createTeam(leader.client, event._id);

        const invite = await leader.client.post('/api/invites', { teamId: team._id });
        const token = invite.body.data.token;

        const second = await registerUser('rafael@verdikt.dev');
        expect((await second.client.post(`/api/invites/token/${token}/accept`)).status).toBe(200);

        const third = await registerUser('mira2@verdikt.dev');
        expect((await third.client.post(`/api/invites/token/${token}/accept`)).status).toBe(400);
    });
});

describe('T1: leaving a team', () => {
    it('a member can remove themselves', async () => {
        const { team, participant } = await seedScenario();
        const invite = await participant.client.post('/api/invites', { teamId: team._id });
        const joiner = await registerUser('rafael@verdikt.dev');
        await joiner.client.post(`/api/invites/token/${invite.body.data.token}/accept`);

        const res = await joiner.client.del(`/api/teams/${team._id}/members/${joiner.id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.members).toHaveLength(1);

        // Leaving also drops the event enrolment.
        const me = await joiner.client.get('/api/auth/me');
        expect(me.body.data.participatingIn).toHaveLength(0);
    });

    it('a member still cannot remove someone else', async () => {
        const { team, participant } = await seedScenario();
        const invite = await participant.client.post('/api/invites', { teamId: team._id });
        const a = await registerUser('a@verdikt.dev');
        const b = await registerUser('b@verdikt.dev');
        await a.client.post(`/api/invites/token/${invite.body.data.token}/accept`);
        await b.client.post(`/api/invites/token/${invite.body.data.token}/accept`);

        const res = await a.client.del(`/api/teams/${team._id}/members/${b.id}`);
        expect(res.status).toBe(403);
    });

    it('the leader cannot leave their own team', async () => {
        const { team, participant } = await seedScenario();
        const me = await participant.client.get('/api/auth/me');
        const res = await participant.client.del(`/api/teams/${team._id}/members/${me.body.data._id}`);
        expect(res.status).toBe(400);
    });
});

describe('T1: project submission, drafts and edits', () => {
    it('a team member can create a draft', async () => {
        const { project } = await seedScenario();
        expect(project.status).toBe('draft');
        expect(project.submittedAt).toBe(undefined);
    });

    it('stores the full T1 submission data model', async () => {
        const { project, participant } = await seedScenario();
        const res = await participant.client.put(`/api/projects/${project._id}`, {
            tagline: 'A one-line pitch',
            description: 'The long write-up.',
            thumbnailUrl: 'https://example.com/thumb.png',
            galleryUrls: ['https://example.com/1.png', 'https://example.com/2.png'],
            demoVideoUrl: 'https://youtube.com/watch?v=x',
            liveUrl: 'https://quorum.example.com',
            techTags: ['Go', 'Postgres', 'React'],
        });
        expect(res.status).toBe(200);
        const p = res.body.data;
        expect(p.tagline).toBe('A one-line pitch');
        expect(p.description).toBe('The long write-up.');
        expect(p.thumbnailUrl).toBe('https://example.com/thumb.png');
        expect(p.galleryUrls).toHaveLength(2);
        expect(p.demoVideoUrl).toBe('https://youtube.com/watch?v=x');
        expect(p.liveUrl).toBe('https://quorum.example.com');
        expect(p.techTags).toHaveLength(3);
    });

    it('a non-member cannot edit the project', async () => {
        const { project } = await seedScenario();
        const outsider = await registerUser('mallory@verdikt.dev');
        const res = await outsider.client.put(`/api/projects/${project._id}`, { title: 'Stolen' });
        expect(res.status).toBe(403);
    });

    it('ignores status and teamId in the request body', async () => {
        const { project, participant } = await seedScenario();
        const res = await participant.client.put(`/api/projects/${project._id}`, {
            status: 'submitted',
            submittedAt: new Date().toISOString(),
            title: 'Renamed',
        });
        expect(res.status).toBe(200);
        // The title changed; the lifecycle fields did not.
        expect(res.body.data.title).toBe('Renamed');
        expect(res.body.data.status).toBe('draft');
    });

    it('submitting flips the status and stamps submittedAt', async () => {
        const { project, participant } = await seedScenario();
        const res = await participant.client.post(`/api/projects/${project._id}/submit`);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('submitted');
        expect(res.body.data.submittedAt).toBeDefined();
    });

    it('refuses to submit without a track', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client);
        const participant = await registerUser('ada@verdikt.dev');
        const team = await createTeam(participant.client, event._id);
        const created = await participant.client.post('/api/projects', {
            title: 'No track', teamId: team._id, repoUrl: 'https://github.com/x/y',
        });
        const res = await participant.client.post(`/api/projects/${created.body.data._id}/submit`);
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('track');
    });

    it('refuses to submit without answering a required custom question', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client, {
            customQuestions: [{ key: 'whatsHard', label: 'What was hardest?', type: 'longtext', required: true }],
        });
        const track = await createTrack(organizer.client, event._id);
        const participant = await registerUser('ada@verdikt.dev');
        const team = await createTeam(participant.client, event._id);
        const created = await participant.client.post('/api/projects', {
            title: 'Unanswered', teamId: team._id, trackId: track._id, repoUrl: 'https://github.com/x/y',
        });

        const blocked = await participant.client.post(`/api/projects/${created.body.data._id}/submit`);
        expect(blocked.status).toBe(400);
        expect(blocked.body.message).toContain('What was hardest?');

        // Answer it, and submission goes through.
        await participant.client.put(`/api/projects/${created.body.data._id}`, {
            customAnswers: { whatsHard: 'Cross-judge normalization.' },
        });
        const ok = await participant.client.post(`/api/projects/${created.body.data._id}/submit`);
        expect(ok.status).toBe(200);
    });

    it('a team can only have one project', async () => {
        const { team, participant } = await seedScenario();
        const res = await participant.client.post('/api/projects', { title: 'Second', teamId: team._id });
        expect(res.status).toBe(409);
    });
});

describe('T1: deadline enforcement actually prevents submissions', () => {
    it('blocks creating a project after the deadline', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client);
        const participant = await registerUser('ada@verdikt.dev');
        const team = await createTeam(participant.client, event._id);

        await closeEvent(event._id);

        const res = await participant.client.post('/api/projects', { title: 'Late', teamId: team._id });
        expect(res.status).toBe(403);
    });

    it('blocks editing a draft after the deadline', async () => {
        const { event, project, participant } = await seedScenario();
        await closeEvent(event._id);
        const res = await participant.client.put(`/api/projects/${project._id}`, { title: 'Late edit' });
        expect(res.status).toBe(403);
    });

    it('blocks submitting after the deadline', async () => {
        const { event, project, participant } = await seedScenario();
        await closeEvent(event._id);
        const res = await participant.client.post(`/api/projects/${project._id}/submit`);
        expect(res.status).toBe(403);
    });

    it('blocks deleting after the deadline', async () => {
        const { event, project, participant } = await seedScenario();
        await closeEvent(event._id);
        const res = await participant.client.del(`/api/projects/${project._id}`);
        expect(res.status).toBe(403);
    });

    it('a project submitted before the deadline stays submitted after it', async () => {
        const { event, project, participant } = await seedScenario();
        expect((await participant.client.post(`/api/projects/${project._id}/submit`)).status).toBe(200);
        await closeEvent(event._id);
        const res = await createClient().get(`/api/projects/${project._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('submitted');
    });
});

describe('T1: public gallery with search and filter', () => {
    it('an anonymous visitor sees submitted projects', async () => {
        const { project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);

        const res = await createClient().get('/api/projects');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].title).toBe('Quorum');
    });

    it('an anonymous visitor does NOT see drafts', async () => {
        await seedScenario(); // left as a draft
        const res = await createClient().get('/api/projects');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
    });

    it('a team member sees their own draft', async () => {
        const { participant } = await seedScenario();
        const res = await participant.client.get('/api/projects');
        expect(res.body.data).toHaveLength(1);
    });

    it('an unrelated signed-in user does not see someone else s draft', async () => {
        await seedScenario();
        const outsider = await registerUser('mallory@verdikt.dev');
        const res = await outsider.client.get('/api/projects');
        expect(res.body.data).toHaveLength(0);
    });

    it('the organizer sees drafts for their own event', async () => {
        const { organizer } = await seedScenario();
        const res = await organizer.client.get('/api/projects');
        expect(res.body.data).toHaveLength(1);
    });

    it('searches by title, tagline and tech tag', async () => {
        const { project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);

        expect((await createClient().get('/api/projects?q=quorum')).body.data).toHaveLength(1);
        expect((await createClient().get('/api/projects?q=pairwise')).body.data).toHaveLength(1);
        expect((await createClient().get('/api/projects?q=Postgres')).body.data).toHaveLength(1);
        expect((await createClient().get('/api/projects?q=nonexistent')).body.data).toHaveLength(0);
    });

    it('filters by track, and combines search with the track filter', async () => {
        const { project, participant, track } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);

        expect((await createClient().get(`/api/projects?track=${track._id}`)).body.data).toHaveLength(1);
        expect((await createClient().get(`/api/projects?track=${track._id}&q=quorum`)).body.data).toHaveLength(1);
        expect((await createClient().get(`/api/projects?track=${track._id}&q=nope`)).body.data).toHaveLength(0);
    });

    it('a regex metacharacter in the search does not crash the endpoint', async () => {
        const { project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);
        const res = await createClient().get('/api/projects?q=' + encodeURIComponent('a(b'));
        expect(res.status).toBe(200);
    });

    it('GET /api/projects/:id 403s on a draft for an anonymous visitor', async () => {
        const { project } = await seedScenario();
        const res = await createClient().get(`/api/projects/${project._id}`);
        expect(res.status).toBe(403);
    });
});

describe('T1: role checks hold at the API level', () => {
    it('an anonymous caller cannot create an event', async () => {
        const res = await createClient().post('/api/events', { name: 'x', description: 'y', submissionsClose: future() });
        expect(res.status).toBe(401);
    });

    it('an anonymous caller cannot create a project', async () => {
        const { team } = await seedScenario();
        const res = await createClient().post('/api/projects', { title: 'x', teamId: team._id });
        expect(res.status).toBe(401);
    });

    it('a participant cannot create a track on an event they do not organise', async () => {
        const { event, participant } = await seedScenario();
        const res = await participant.client.post('/api/tracks', { topic: 'Sneaky', eventId: event._id });
        expect(res.status).toBe(403);
    });

    it('a participant cannot delete another team s project', async () => {
        const { event, project } = await seedScenario();
        const other = await registerUser('rafael@verdikt.dev');
        await createTeam(other.client, event._id, 'Other Team');
        const res = await other.client.del(`/api/projects/${project._id}`);
        expect(res.status).toBe(403);
    });

    it('an admin overrides ownership checks', async () => {
        const { project } = await seedScenario();
        const admin = await registerUser('root@verdikt.dev');
        await makeAdmin(admin.id);
        const res = await admin.client.put(`/api/projects/${project._id}`, { title: 'Admin edit' });
        expect(res.status).toBe(200);
    });

    it('a malformed id returns 400, not 500', async () => {
        const res = await createClient().get('/api/projects/not-an-object-id');
        expect(res.status).toBe(400);
    });

    it('an unknown route returns a JSON 404', async () => {
        const res = await createClient().get('/api/nope');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

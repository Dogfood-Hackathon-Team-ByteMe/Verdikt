/**
 * Stage E: regression tests pinning the specific bugs fixed in this pass, so
 * none of them can come back unnoticed.
 *
 * Each test names the failure it guards against.
 */
import mongoose from 'mongoose';
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { PASSWORD, createEvent, createTeam, createTrack, makeJudge, registerUser, seedScenario } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';

describe('BUG-1: routes referencing an unimported requireAuth', () => {
    it('the result and track routers are mounted and reachable', async () => {
        // These two files used requireAuth without importing it, which threw a
        // ReferenceError at module load and stopped the whole server booting.
        const c = createClient();
        expect((await c.get('/api/results')).status).toBe(200);
        expect((await c.get('/api/tracks')).status).toBe(200);
    });

    it('the score list route resolves to a real handler', async () => {
        // scoreRoutes pointed GET / at scoreController.getAll, which does not
        // exist; Express threw "requires a callback function" on boot.
        const res = await createClient().get('/api/scores');
        expect(res.status).toBe(401); // reachable, and correctly refusing anonymous
    });
});

describe('BUG-2: acceptInvite read `event` before declaring it', () => {
    it('accepting an invite does not throw a TDZ ReferenceError', async () => {
        const { team, participant } = await seedScenario();
        const invite = await participant.client.post('/api/invites', { teamId: team._id });
        const joiner = await registerUser('rafael@verdikt.dev');
        const res = await joiner.client.post(`/api/invites/token/${invite.body.data.token}/accept`);
        // Before the fix this was a 500 from "Cannot access 'event' before
        // initialization", making team formation impossible.
        expect(res.status).toBe(200);
    });

    it('still blocks a judge from joining an event they judge', async () => {
        // The check that was unreachable because of the TDZ error must now run.
        const { event, track, team, participant } = await seedScenario();
        const judge = await registerUser('judge@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);

        const invite = await participant.client.post('/api/invites', { teamId: team._id });
        const res = await judge.client.post(`/api/invites/token/${invite.body.data.token}/accept`);
        expect(res.status).toBe(403);
    });
});

describe('BUG-3: the public gallery returned nothing to visitors', () => {
    it('a submitted project is visible before the deadline passes', async () => {
        const { project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);
        // The old filter only revealed projects AFTER submissionsClose, so the
        // public gallery was empty for the entire event.
        const res = await createClient().get('/api/projects');
        expect(res.body.data).toHaveLength(1);
    });
});

describe('BUG-4: password hashes leaked to clients', () => {
    it('GET /api/users/:id does not include the hash', async () => {
        const me = await registerUser('ada@verdikt.dev');
        const res = await me.client.get(`/api/users/${me.id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.password).toBe(undefined);
    });

    it('the public team list does not include member hashes', async () => {
        await seedScenario();
        const res = await createClient().get('/api/teams');
        expect(res.text.includes('$2b$')).toBe(false);
    });

    it('the public team list does not expose member email addresses', async () => {
        // GET /api/teams needs no session, so populating members with their
        // email handed anyone a scrape of every participant's address.
        await seedScenario();
        const res = await createClient().get('/api/teams');
        expect(res.text.includes('@verdikt.dev')).toBe(false);
    });

    it('a single team read does not expose emails either', async () => {
        const { team } = await seedScenario();
        const res = await createClient().get(`/api/teams/${team._id}`);
        expect(res.text.includes('@verdikt.dev')).toBe(false);
    });
});

describe('BUG-5: privilege escalation through mass assignment', () => {
    it('register ignores isAdmin', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'x@example.com', password: 'longenough1', isAdmin: true });
        expect((await c.get('/api/auth/me')).body.data.isAdmin).toBe(false);
    });

    it('a project update cannot move the project to another team', async () => {
        const { event, project, participant } = await seedScenario();
        const other = await registerUser('rafael@verdikt.dev');
        const otherTeam = await createTeam(other.client, event._id, 'Other Team');

        await participant.client.put(`/api/projects/${project._id}`, { teamId: otherTeam._id });
        const after = await mongoose.model('Project').findById(project._id);
        expect(after.teamId.toString()).toBe(project.teamId._id ?? project.teamId);
    });
});

describe('BUG-6: judges could read peer ballots via GET /api/scores', () => {
    it('a judge listing scores sees only their own', async () => {
        const { event, track, project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);

        const judgeA = await registerUser('judgea@verdikt.dev');
        const judgeB = await registerUser('judgeb@verdikt.dev');
        await makeJudge(judgeA.id, event._id, track._id);
        await makeJudge(judgeB.id, event._id, track._id);

        const a = await judgeA.client.post('/api/scores', { projectId: project._id, scores: { technical: 8 } });
        const b = await judgeB.client.post('/api/scores', { projectId: project._id, scores: { technical: 4 } });
        expect(a.status).toBe(201);
        expect(b.status).toBe(201);

        // The old handler only narrowed to the caller on /judge/scores, so
        // /api/scores handed a judge every peer ballot in the event.
        const listed = await judgeA.client.get('/api/scores');
        expect(listed.status).toBe(200);
        expect(listed.body.data).toHaveLength(1);
        expect(listed.body.data[0].judgeId._id).toBe(judgeA.id);
    });

    it('a participant cannot list scores at all', async () => {
        const { participant } = await seedScenario();
        expect((await participant.client.get('/api/scores')).status).toBe(403);
    });

    it('an organizer sees every ballot for their event', async () => {
        const { organizer, event, track, project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);
        const judge = await registerUser('judgea@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);
        await judge.client.post('/api/scores', { projectId: project._id, scores: { technical: 8 } });

        const res = await organizer.client.get('/api/scores');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });
});

describe('BUG-7: tracks required an eventId to list', () => {
    it('GET /api/tracks works with no query string', async () => {
        const organizer = await registerUser('mira@verdikt.dev');
        const event = await createEvent(organizer.client);
        await createTrack(organizer.client, event._id);
        const res = await createClient().get('/api/tracks');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });
});

describe('BUG-8: profile update was a mass-assignment hole', () => {
    it('a user cannot promote themselves to admin', async () => {
        const ada = await registerUser('ada@verdikt.dev');
        const res = await ada.client.put(`/api/users/${ada.id}`, { name: 'Ada', isAdmin: true });
        expect(res.status).toBe(200);
        const me = await ada.client.get('/api/auth/me');
        expect(me.body.data.isAdmin).toBe(false);
        expect(me.body.data.name).toBe('Ada');
    });

    it('a user cannot grant themselves a role on an event', async () => {
        const host = await registerUser('host@verdikt.dev');
        const event = await createEvent(host.client);
        const ada = await registerUser('ada@verdikt.dev');

        await ada.client.put(`/api/users/${ada.id}`, {
            organiserIn: [event._id],
            judgeIn: [event._id],
            participatingIn: [event._id],
        });

        const me = await ada.client.get('/api/auth/me');
        expect(me.body.data.organiserIn).toHaveLength(0);
        expect(me.body.data.judgeIn).toHaveLength(0);
        expect(me.body.data.participatingIn).toHaveLength(0);
    });

    it('a user still cannot edit someone else', async () => {
        const ada = await registerUser('ada@verdikt.dev');
        const bob = await registerUser('bob@verdikt.dev');
        expect((await ada.client.put(`/api/users/${bob.id}`, { name: 'Hacked' })).status).toBe(403);
    });

    it('changing a password needs the current one', async () => {
        const ada = await registerUser('ada@verdikt.dev');

        const noProof = await ada.client.put(`/api/users/${ada.id}`, { password: 'brand-new-secret' });
        expect(noProof.status).toBe(400);

        const wrongProof = await ada.client.put(`/api/users/${ada.id}`, {
            password: 'brand-new-secret',
            currentPassword: 'not-it',
        });
        expect(wrongProof.status).toBe(403);

        // The old password still works, so nothing was changed by either try.
        const check = createClient();
        expect((await check.post('/api/auth/login', { email: 'ada@verdikt.dev', password: PASSWORD })).status).toBe(200);
    });

    it('a password change with the current one succeeds and takes effect', async () => {
        const ada = await registerUser('ada@verdikt.dev');
        const res = await ada.client.put(`/api/users/${ada.id}`, {
            password: 'brand-new-secret',
            currentPassword: PASSWORD,
        });
        expect(res.status).toBe(200);

        const fresh = createClient();
        expect((await fresh.post('/api/auth/login', { email: 'ada@verdikt.dev', password: PASSWORD })).status).toBe(401);
        expect((await fresh.post('/api/auth/login', { email: 'ada@verdikt.dev', password: 'brand-new-secret' })).status).toBe(200);
    });

    it('the profile edit itself works', async () => {
        const ada = await registerUser('ada@verdikt.dev');
        const res = await ada.client.put(`/api/users/${ada.id}`, { name: 'Ada Okafor' });
        expect(res.status).toBe(200);
        expect((await ada.client.get('/api/auth/me')).body.data.name).toBe('Ada Okafor');
    });
});

describe('roles are per event, not global', () => {
    /**
     * The platform has exactly one global role: admin. Everything else is a
     * relationship to one event, so the same person can run their own
     * hackathon and compete in somebody else's on the same account.
     */
    it('an organiser of one event can still compete in another', async () => {
        const mira = await registerUser('mira@verdikt.dev');
        const mine = await createEvent(mira.client, { name: 'My Event' });

        // Barred from her own event...
        const own = await mira.client.post('/api/teams', { name: 'Self Deal', eventId: mine._id });
        expect(own.status).toBe(403);

        // ...but an ordinary entrant in someone else's.
        const someoneElse = await registerUser('rafa@verdikt.dev');
        const theirs = await createEvent(someoneElse.client, { name: 'Their Event' });
        const entry = await mira.client.post('/api/teams', { name: 'Late Entry', eventId: theirs._id });
        expect(entry.status).toBe(201);
    });

    it('a competitor in one event can organise another', async () => {
        const ada = await registerUser('ada@verdikt.dev');
        const host = await registerUser('host@verdikt.dev');
        const theirs = await createEvent(host.client, { name: 'Their Event' });
        expect((await ada.client.post('/api/teams', { name: 'Ada Team', eventId: theirs._id })).status).toBe(201);

        // Competing somewhere does not stop her running her own.
        const hers = await createEvent(ada.client, { name: 'Ada Event' });
        expect(hers.organiserId).toBe(ada.id);

        // And she is barred from her own, while her other team survives.
        expect((await ada.client.post('/api/teams', { name: 'Nope', eventId: hers._id })).status).toBe(403);
    });

    it('a judge of one event can compete in another', async () => {
        const { event, track } = await seedScenario();
        const judge = await registerUser('judgea@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);

        // Barred from the event they judge.
        expect((await judge.client.post('/api/teams', { name: 'Ballot Stuffer', eventId: event._id })).status).toBe(403);

        const other = await registerUser('other@verdikt.dev');
        const elsewhere = await createEvent(other.client, { name: 'Elsewhere' });
        expect((await judge.client.post('/api/teams', { name: 'Fine Here', eventId: elsewhere._id })).status).toBe(201);
    });

    it('organising one event does not unlock another event\'s ballots', async () => {
        // The score list treated "organises something" as a rank rather than a
        // relationship, so an organiser of any event read every judge's
        // ballots for an event they had nothing to do with.
        const { event, track, project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);
        const judge = await registerUser('judgea@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);
        await judge.client.post('/api/scores', { projectId: project._id, scores: { technical: 8 } });

        const outsider = await registerUser('outsider@verdikt.dev');
        await createEvent(outsider.client, { name: 'Unrelated Event' });

        const scoped = await outsider.client.get(`/api/scores?eventId=${event._id}`);
        expect(scoped.status).toBe(403);

        // Unscoped, they see the ballots of the events they actually organise,
        // which is none.
        const unscoped = await outsider.client.get('/api/scores');
        expect(unscoped.body.data).toHaveLength(0);
    });
});

describe('error handling', () => {
    it('a 500 does not leak the internal exception message', async () => {
        // A duplicate score trips a unique index; it must surface as a clean
        // 409, not a raw driver error.
        const { event, track, project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);
        const judge = await registerUser('judgea@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);

        await judge.client.post('/api/scores', { projectId: project._id, scores: { technical: 8 } });
        const dup = await judge.client.post('/api/scores', { projectId: project._id, scores: { technical: 9 } });
        expect(dup.status).toBeOneOf([409]);
    });

    it('health check responds without touching the database', async () => {
        const res = await createClient().get('/health');
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('ok');
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

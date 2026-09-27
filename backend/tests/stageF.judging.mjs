/**
 * Stage F: the judging path -- rubric, ballots, and who may cast one.
 *
 * Everything goes over HTTP, so what is being checked is that the API enforces
 * the rules rather than the judging screen hiding the buttons. The rubric is
 * the new piece: before it, `scores` was an unchecked map and any key with any
 * number in it was a valid ballot.
 */
import mongoose from 'mongoose';
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { createEvent, createTeam, createTrack, makeJudge, registerUser, seedScenario } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';

const RUBRIC = [
    { key: 'impact', label: 'Impact', weight: 3, maxScore: 5 },
    { key: 'craft', label: 'Craft', weight: 1, maxScore: 10 },
];

/** A submitted project, an event carrying RUBRIC, and a judge who may score it. */
async function judgingScenario() {
    const scenario = await seedScenario();
    const { organizer, event, track, project, participant } = scenario;

    await organizer.client.put(`/api/events/${event._id}`, { criteria: RUBRIC });
    await participant.client.post(`/api/projects/${project._id}/submit`);

    const judge = await registerUser('judge-f@verdikt.dev', 'Noor');
    await makeJudge(judge.id, event._id, track._id);

    return { ...scenario, judge };
}

describe('the organizer configures a rubric', () => {
    it('saves criteria on the event', async () => {
        const { organizer, event } = await seedScenario();
        const res = await organizer.client.put(`/api/events/${event._id}`, { criteria: RUBRIC });
        expect(res.status).toBe(200);
        expect(res.body.data.criteria.length).toBe(2);
        expect(res.body.data.criteria[0].key).toBe('impact');
        expect(res.body.data.criteria[0].weight).toBe(3);
    });

    it('refuses two criteria sharing a key', async () => {
        // Score.scores is keyed by it, so the second line would silently
        // overwrite the first on every ballot ever cast.
        const { organizer, event } = await seedScenario();
        const res = await organizer.client.put(`/api/events/${event._id}`, {
            criteria: [
                { key: 'impact', label: 'Impact' },
                { key: 'impact', label: 'Impact again' },
            ],
        });
        expect(res.status).toBe(400);
    });

    it('drops half-finished rows instead of rejecting the save', async () => {
        const { organizer, event } = await seedScenario();
        const res = await organizer.client.put(`/api/events/${event._id}`, {
            criteria: [{ key: 'impact', label: 'Impact' }, { key: '', label: '' }],
        });
        expect(res.status).toBe(200);
        expect(res.body.data.criteria.length).toBe(1);
    });

    it('a stranger cannot write the rubric of someone else’s event', async () => {
        const { event } = await seedScenario();
        const outsider = await registerUser('outsider-f@verdikt.dev');
        const res = await outsider.client.put(`/api/events/${event._id}`, { criteria: RUBRIC });
        expect(res.status).toBe(403);
    });
});

describe('an event update cannot be used to grant roles', () => {
    it('an organiser cannot appoint judges by writing judgeIds', async () => {
        // Judges are appointed through the track endpoints, which keep the
        // event, the track and the user in step. Letting the event PUT set the
        // array straight would put a judge on the event that no track knows
        // about, and the participation rules read both.
        const { organizer, event } = await seedScenario();
        const stranger = await registerUser('stranger-f@verdikt.dev');

        const res = await organizer.client.put(`/api/events/${event._id}`, { judgeIds: [stranger.id] });
        expect(res.status).toBe(200);
        expect(res.body.data.judgeIds.length).toBe(0);
    });

    it('an organiser cannot hand their event to someone else', async () => {
        const { organizer, event } = await seedScenario();
        const stranger = await registerUser('stranger2-f@verdikt.dev');

        await organizer.client.put(`/api/events/${event._id}`, { organiserId: stranger.id });
        const after = await mongoose.model('Event').findById(event._id);
        expect(after.organiserId.toString()).toBe(organizer.id);
    });

    it('an organiser cannot feature their own event on the landing page', async () => {
        const { organizer, event } = await seedScenario();
        await organizer.client.put(`/api/events/${event._id}`, { isFeatured: true });
        const after = await mongoose.model('Event').findById(event._id);
        expect(after.isFeatured).toBe(false);
    });
});

describe('a ballot is checked against the rubric', () => {
    it('accepts a complete ballot', async () => {
        const { judge, project } = await judgingScenario();
        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 4, craft: 8 },
            comment: 'Solid.',
        });
        expect(res.status).toBe(200);
        expect(res.body.data.scores.impact).toBe(4);
    });

    it('refuses a criterion the rubric does not define', async () => {
        const { judge, project } = await judgingScenario();
        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 4, craft: 8, vibes: 5 },
        });
        expect(res.status).toBe(400);
    });

    it('refuses a score above that criterion’s own maximum', async () => {
        // impact is out of 5 even though craft is out of 10, so the check has
        // to be per line rather than against one shared scale.
        const { judge, project } = await judgingScenario();
        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 9, craft: 8 },
        });
        expect(res.status).toBe(400);
    });

    it('refuses a ballot with a criterion left unscored', async () => {
        const { judge, project } = await judgingScenario();
        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 4 },
        });
        expect(res.status).toBe(400);
    });

    it('refuses a score that is not a number', async () => {
        const { judge, project } = await judgingScenario();
        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 'five', craft: 8 },
        });
        expect(res.status).toBe(400);
    });

    it('enforces the rubric on PUT /api/scores/:id too', async () => {
        // Otherwise editing a ballot is a way round the validation creating one
        // just enforced.
        const { judge, project } = await judgingScenario();
        const created = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 4, craft: 8 },
        });

        const res = await judge.client.put(`/api/scores/${created.body.data._id}`, {
            scores: { impact: 99, craft: 8 },
        });
        expect(res.status).toBe(400);
    });
});

describe('saving a ballot twice edits it rather than failing', () => {
    it('the second save replaces the first', async () => {
        const { judge, project } = await judgingScenario();

        await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 2, craft: 3 },
            comment: 'first pass',
        });
        const second = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 5, craft: 9 },
            comment: 'looked again',
        });

        expect(second.status).toBe(200);
        expect(second.body.data.scores.impact).toBe(5);
        expect(second.body.data.comment).toBe('looked again');

        const count = await mongoose.model('Score').countDocuments({ projectId: project._id });
        expect(count).toBe(1);
    });

    it('a ballot cannot be edited onto a different project', async () => {
        const { judge, project, event, track } = await judgingScenario();
        const created = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 4, craft: 8 },
        });

        const other = await registerUser('other-team-f@verdikt.dev');
        const team = await createTeam(other.client, event._id, 'Other Team');
        const made = await other.client.post('/api/projects', {
            title: 'Second entry',
            summary: 'Another one',
            repoUrl: 'https://github.com/example/two',
            trackId: track._id,
            teamId: team._id,
        });

        await judge.client.put(`/api/scores/${created.body.data._id}`, {
            projectId: made.body.data._id,
            scores: { impact: 1, craft: 1 },
        });

        const after = await mongoose.model('Score').findById(created.body.data._id);
        expect(after.projectId.toString()).toBe(project._id);
    });
});

describe('who may cast a ballot', () => {
    it('a judge listed only on a track can score', async () => {
        // The old check read event.judgeIds alone, so a track judge -- the
        // shape the assignment flow actually produces -- could not score at all.
        const { organizer, event, track, project, participant } = await seedScenario();
        await organizer.client.put(`/api/events/${event._id}`, { criteria: RUBRIC });
        await participant.client.post(`/api/projects/${project._id}/submit`);

        const judge = await registerUser('trackjudge-f@verdikt.dev');
        await mongoose.model('User').findByIdAndUpdate(judge.id, { $addToSet: { judgeIn: track._id } });
        await mongoose.model('Track').findByIdAndUpdate(track._id, { $addToSet: { judges: judge.id } });

        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 3, craft: 6 },
        });
        expect(res.status).toBe(200);
    });

    it('a participant cannot score', async () => {
        const { participant, project } = await judgingScenario();
        const res = await participant.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 5, craft: 10 },
        });
        expect(res.status).toBe(403);
    });

    it('a judge of another event cannot score here', async () => {
        const { judge: outsideJudge } = await judgingScenario();
        const secondOrganizer = await registerUser('org2-f@verdikt.dev');
        const secondEvent = await createEvent(secondOrganizer.client, { name: 'Other Hack' });
        const secondTrack = await createTrack(secondOrganizer.client, secondEvent._id);
        await secondOrganizer.client.put(`/api/events/${secondEvent._id}`, { criteria: RUBRIC });

        const entrant = await registerUser('entrant2-f@verdikt.dev');
        const team = await createTeam(entrant.client, secondEvent._id);
        const made = await entrant.client.post('/api/projects', {
            title: 'Elsewhere',
            summary: 'In the other event',
            repoUrl: 'https://github.com/example/elsewhere',
            trackId: secondTrack._id,
            teamId: team._id,
        });
        await entrant.client.post(`/api/projects/${made.body.data._id}/submit`);

        const res = await outsideJudge.client.put('/api/scores/ballot', {
            projectId: made.body.data._id,
            scores: { impact: 1, craft: 1 },
        });
        expect(res.status).toBe(403);
    });

    it('an anonymous request cannot score', async () => {
        const { project } = await judgingScenario();
        const res = await createClient().put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 3, craft: 6 },
        });
        expect(res.status).toBe(401);
    });

    it('a draft cannot be scored', async () => {
        // It is still being written, so the number would go stale the next time
        // the team saved.
        const { organizer, event, track, project } = await seedScenario();
        await organizer.client.put(`/api/events/${event._id}`, { criteria: RUBRIC });

        const judge = await registerUser('draftjudge-f@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);

        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 3, craft: 6 },
        });
        expect(res.status).toBe(400);
    });
});

describe('a judge reads their own ballots and no one else’s', () => {
    it('an event-level judge can list their ballots', async () => {
        // judgeIn holds TRACK ids, so a judge listed only on the event has an
        // empty one -- and the old gate read that array alone and refused them
        // their own scores.
        const { organizer, event, project, participant } = await seedScenario();
        await organizer.client.put(`/api/events/${event._id}`, { criteria: RUBRIC });
        await participant.client.post(`/api/projects/${project._id}/submit`);

        const judge = await registerUser('eventjudge-f@verdikt.dev');
        await mongoose.model('Event').findByIdAndUpdate(event._id, { $addToSet: { judgeIds: judge.id } });

        await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 4, craft: 7 },
        });

        const res = await judge.client.get(`/api/scores?eventId=${event._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
    });

    it('one judge never sees another judge’s ballot', async () => {
        const { judge, project, event, track } = await judgingScenario();
        await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 4, craft: 7 },
        });

        const second = await registerUser('judge2-f@verdikt.dev');
        await makeJudge(second.id, event._id, track._id);

        const res = await second.client.get(`/api/scores?eventId=${event._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(0);
    });

    it('the organiser sees every ballot on their own event', async () => {
        const { judge, organizer, project, event } = await judgingScenario();
        await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { impact: 4, craft: 7 },
        });

        const res = await organizer.client.get(`/api/scores?eventId=${event._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
    });
});

describe('appointing judges', () => {
    it('the organiser adds a judge to a track by email', async () => {
        const { organizer, event, track } = await seedScenario();
        const invitee = await registerUser('panel-f@verdikt.dev', 'Wren');

        const res = await organizer.client.post(`/api/tracks/${track._id}/judges`, {
            email: 'panel-f@verdikt.dev',
        });
        expect(res.status).toBe(200);

        // Appointing on a track also lists them on the event, which is what the
        // judging screen and the participation rules read.
        const after = await mongoose.model('Event').findById(event._id);
        expect(after.judgeIds.map(String).includes(invitee.id)).toBe(true);

        const user = await mongoose.model('User').findById(invitee.id);
        expect(user.judgeIn.map(String).includes(track._id)).toBe(true);
    });

    it('refuses to appoint someone competing in the event', async () => {
        // The mirror of "a judge cannot join a team". Without it an organiser
        // could produce exactly the state that rule exists to prevent.
        const { organizer, track, participant } = await seedScenario();
        const res = await organizer.client.post(`/api/tracks/${track._id}/judges`, {
            email: 'ada@verdikt.dev',
        });
        expect(res.status).toBe(409);
        expect(participant).toBeTruthy();
    });

    it('refuses to appoint the organiser of the event', async () => {
        const { organizer, track } = await seedScenario();
        const res = await organizer.client.post(`/api/tracks/${track._id}/judges`, {
            email: 'organizer@verdikt.dev',
        });
        expect(res.status).toBe(409);
    });

    it('a non-organiser cannot appoint judges, and cannot probe for accounts', async () => {
        // The 403 has to land BEFORE the email lookup, or the endpoint is an
        // account-enumeration oracle for anyone signed in.
        const { track } = await seedScenario();
        await registerUser('secret-f@verdikt.dev');
        const outsider = await registerUser('nosy-f@verdikt.dev');

        const known = await outsider.client.post(`/api/tracks/${track._id}/judges`, {
            email: 'secret-f@verdikt.dev',
        });
        const unknown = await outsider.client.post(`/api/tracks/${track._id}/judges`, {
            email: 'nobody-f@verdikt.dev',
        });

        expect(known.status).toBe(403);
        // Same answer either way: a registered address is indistinguishable
        // from one that has never been seen.
        expect(unknown.status).toBe(403);
    });

    it('removing a judge takes the track off their account', async () => {
        const { organizer, track } = await seedScenario();
        const invitee = await registerUser('panel2-f@verdikt.dev');
        await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: 'panel2-f@verdikt.dev' });

        const res = await organizer.client.del(`/api/tracks/${track._id}/judges/${invitee.id}`);
        expect(res.status).toBe(200);

        const user = await mongoose.model('User').findById(invitee.id);
        expect(user.judgeIn.map(String).includes(track._id)).toBe(false);
    });
});

describe('an event with no rubric', () => {
    it('still accepts a ballot, so ballots cast before rubrics existed stay writable', async () => {
        const { event, track, project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);

        const judge = await registerUser('norubric-f@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);

        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: { technical: 8 },
        });
        expect(res.status).toBe(200);
    });

    it('refuses an empty ballot either way', async () => {
        const { event, track, project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);

        const judge = await registerUser('empty-f@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);

        const res = await judge.client.put('/api/scores/ballot', {
            projectId: project._id,
            scores: {},
        });
        expect(res.status).toBe(400);
    });
});

describe("judges' email addresses are not public", () => {
    it('an anonymous reader of /api/tracks sees names but no addresses', async () => {
        // TrackRepository populates judges with name AND email so the organizer
        // panel can show who is who, and GET /api/tracks is public -- which made
        // every judge's address readable by anyone who asked. Same leak as BUG-4
        // on team members, arriving by a different route.
        const { organizer, track } = await seedScenario();
        await registerUser('leak-judge-f@verdikt.dev', 'Noor');
        await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: 'leak-judge-f@verdikt.dev' });

        const res = await createClient().get('/api/tracks');
        expect(res.status).toBe(200);
        const judge = res.body.data[0].judges[0];
        expect(judge.name).toBe('Noor');
        expect(judge.email).toBe(undefined);
    });

    it('a single public track read does not expose addresses either', async () => {
        const { organizer, track } = await seedScenario();
        await registerUser('leak2-judge-f@verdikt.dev', 'Noor');
        await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: 'leak2-judge-f@verdikt.dev' });

        const res = await createClient().get(`/api/tracks/${track._id}`);
        expect(res.body.data.judges[0].email).toBe(undefined);
    });

    it('a signed-in stranger does not get addresses', async () => {
        const { organizer, track } = await seedScenario();
        await registerUser('leak3-judge-f@verdikt.dev', 'Noor');
        await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: 'leak3-judge-f@verdikt.dev' });

        const nosy = await registerUser('nosy2-f@verdikt.dev');
        const res = await nosy.client.get('/api/tracks');
        expect(res.body.data[0].judges[0].email).toBe(undefined);
    });

    it('the organiser of the event does get them, because they manage the panel', async () => {
        const { organizer, track } = await seedScenario();
        await registerUser('panel3-f@verdikt.dev', 'Noor');
        await organizer.client.post(`/api/tracks/${track._id}/judges`, { email: 'panel3-f@verdikt.dev' });

        const res = await organizer.client.get(`/api/tracks?eventId=${track.eventId}`);
        expect(res.body.data[0].judges[0].email).toBe('panel3-f@verdikt.dev');
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

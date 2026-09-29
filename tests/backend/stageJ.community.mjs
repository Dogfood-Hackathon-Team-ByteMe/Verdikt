/**
 * Stage J: Tier 3 phases 2-4 -- community voting, comments, the public API.
 *
 * The thread running through all three: the crowd gets a voice, and the voice
 * cannot be weaponised. A vote that could reach the judged standings, a
 * comment that could not be moderated, or a public endpoint that leaked a
 * draft or an email address would each turn a community feature into an
 * attack surface, so most of these tests are about what is REFUSED.
 */
import mongoose from 'mongoose';
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { PASSWORD, createEvent, createTeam, createTrack, makeAdmin, makeJudge, registerUser } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';
import { LIMITS, resetRateLimits } from '../../src/backend/middlewares/rateLimit.js';

let seq = 0;
const email = (name) => `${name}-${++seq}-j@verdikt.dev`;

/** Tighten a ceiling for one test and put it back. Same shape as stage I. */
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

/**
 * One event, one track, one team with a SUBMITTED project, and the team's
 * founder. Everything voting and commenting hangs off.
 */
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
    const sub = await founder.client.post(`/api/projects/${made.body.data._id}/submit`);
    if (sub.status !== 200) throw new Error(`scene submit: ${sub.status} ${sub.text}`);
    return { organizer, event, track, founder, team, project: made.body.data };
}

/**
 * Another entry in the same event: fresh founder, fresh team, optionally
 * submitted. Fresh because a team fields exactly one project, so a second
 * entry needs a second team.
 */
async function anotherEntry(eventId, trackId, title, { submit = true } = {}) {
    const founder = await registerUser(email('founder'));
    const team = await createTeam(founder.client, eventId, `${title} Team`);
    const made = await founder.client.post('/api/projects', {
        title,
        summary: `${title} summary.`,
        repoUrl: `https://github.com/example/${title.toLowerCase()}`,
        trackId,
        teamId: team._id,
    });
    if (made.status !== 201) throw new Error(`anotherEntry(${title}): ${made.status} ${made.text}`);
    if (submit) {
        const sub = await founder.client.post(`/api/projects/${made.body.data._id}/submit`);
        if (sub.status !== 200) throw new Error(`anotherEntry submit(${title}): ${sub.status} ${sub.text}`);
    }
    return { founder, team, project: made.body.data };
}

/** A signed-in account with no stake in anything: the ideal voter. */
const visitor = () => registerUser(email('visitor'));

describe('community voting counts everyone once and the wrong people never', () => {
    it('a signed-in visitor votes, the count rises, and the gallery shows it', async () => {
        const { project } = await scene();
        const voter = await visitor();

        const cast = await voter.client.post(`/api/projects/${project._id}/vote`);
        expect(cast.status).toBe(201);
        expect(cast.body.data.voteCount).toBe(1);

        const page = await voter.client.get(`/api/projects/${project._id}`);
        expect(page.body.data.voteCount).toBe(1);
        expect(page.body.data.hasVoted).toBe(true);

        // Another account sees the count but not the claim.
        const other = await visitor();
        const theirs = await other.client.get(`/api/projects/${project._id}`);
        expect(theirs.body.data.voteCount).toBe(1);
        expect(theirs.body.data.hasVoted).toBe(false);
    });

    it('the same account cannot vote twice', async () => {
        const { project } = await scene();
        const voter = await visitor();
        await voter.client.post(`/api/projects/${project._id}/vote`);

        const again = await voter.client.post(`/api/projects/${project._id}/vote`);
        expect(again.status).toBe(409);
        expect((await voter.client.get(`/api/projects/${project._id}`)).body.data.voteCount).toBe(1);
    });

    it('a vote can be taken back, once', async () => {
        const { project } = await scene();
        const voter = await visitor();
        await voter.client.post(`/api/projects/${project._id}/vote`);

        const gone = await voter.client.del(`/api/projects/${project._id}/vote`);
        expect(gone.status).toBe(200);
        expect(gone.body.data.voteCount).toBe(0);
        expect((await voter.client.del(`/api/projects/${project._id}/vote`)).status).toBe(404);
    });

    it('your own team, the judges, the organiser and an admin are all refused', async () => {
        const { organizer, event, track, founder, project } = await scene();

        expect((await founder.client.post(`/api/projects/${project._id}/vote`)).status).toBe(403);
        expect((await organizer.client.post(`/api/projects/${project._id}/vote`)).status).toBe(403);

        const judge = await registerUser(email('judge'));
        await makeJudge(judge.id, event._id, track._id);
        expect((await judge.client.post(`/api/projects/${project._id}/vote`)).status).toBe(403);

        const admin = await registerUser(email('admin'));
        await makeAdmin(admin.id);
        await admin.client.post('/api/auth/login', { email: admin.user.email, password: PASSWORD });
        expect((await admin.client.post(`/api/projects/${project._id}/vote`)).status).toBe(403);
    });

    it('voting needs an account, and a draft answers like a missing project', async () => {
        const { event, track } = await scene();
        expect((await createClient().post('/api/projects/000000000000000000000000/vote')).status).toBe(401);

        const draft = await anotherEntry(event._id, track._id, 'Unfinished', { submit: false });
        const voter = await visitor();
        // 404, not 403: a 403 would confirm to an outsider that the id exists.
        expect((await voter.client.post(`/api/projects/${draft.project._id}/vote`)).status).toBe(404);
    });

    it('the community poll ranks by votes with shared ranks on ties', async () => {
        const { organizer, event, track, founder, team, project } = await scene();

        // A second submitted project, so there is something to rank against.
        const second = await anotherEntry(event._id, track._id, 'Abacus');

        const a = await visitor();
        const b = await visitor();
        await a.client.post(`/api/projects/${project._id}/vote`);
        await b.client.post(`/api/projects/${project._id}/vote`);
        await a.client.post(`/api/projects/${second.project._id}/vote`);

        // Public: no cookie on this client.
        const poll = await createClient().get(`/api/events/${event._id}/community`);
        expect(poll.status).toBe(200);
        expect(poll.body.data.totalVotes).toBe(3);
        const [first, runner] = poll.body.data.standings;
        expect(first.title).toBe('Quorum');
        expect(first.rank).toBe(1);
        expect(first.voteCount).toBe(2);
        expect(runner.rank).toBe(2);

        // And a tie shares the rank.
        await b.client.post(`/api/projects/${second.project._id}/vote`);
        const tied = await createClient().get(`/api/events/${event._id}/community`);
        expect(tied.body.data.standings[0].rank).toBe(1);
        expect(tied.body.data.standings[1].rank).toBe(1);
    });

    it('votes never reach the judged standings', async () => {
        const { organizer, event, project } = await scene();
        const voter = await visitor();
        await voter.client.post(`/api/projects/${project._id}/vote`);

        // No ballots exist, so the judged standings must show no score at all,
        // however loudly the poll disagrees. The two rankings share nothing.
        const standings = await organizer.client.get(`/api/events/${event._id}/standings`);
        expect(standings.status).toBe(200);
        const row = standings.body.data.standings.find((r) => r.title === 'Quorum');
        expect(row.ballot_count ?? row.ballotCount ?? 0).toBe(0);
        expect(row.weighted_score ?? row.weightedScore ?? null).toBe(null);
    });
});

describe('comments are public to read, accountable to write', () => {
    it('anyone reads, only an account writes, and threads stay one level', async () => {
        const { project } = await scene();
        const speaker = await visitor();

        expect((await createClient().post(`/api/projects/${project._id}/comments`, { body: 'hi' })).status).toBe(401);

        const top = await speaker.client.post(`/api/projects/${project._id}/comments`, { body: 'Love the demo.' });
        expect(top.status).toBe(201);
        const reply = await speaker.client.post(`/api/projects/${project._id}/comments`, {
            body: 'Especially the replay.',
            parentId: top.body.data._id,
        });
        expect(reply.status).toBe(201);

        // A reply to a reply is refused: one level, by design.
        const deeper = await speaker.client.post(`/api/projects/${project._id}/comments`, {
            body: 'And the log format.',
            parentId: reply.body.data._id,
        });
        expect(deeper.status).toBe(400);

        // Reading needs nothing at all.
        const listed = await createClient().get(`/api/projects/${project._id}/comments`);
        expect(listed.status).toBe(200);
        expect(listed.body.data).toHaveLength(2);
        expect(listed.body.data[1].parentId).toBe(top.body.data._id);
        expect(listed.body.data[0].author.name).toBe(speaker.user.name);
    });

    it('an empty comment and a parent from another project are refused', async () => {
        const first = await scene();
        const second = await scene();
        const speaker = await visitor();

        expect((await speaker.client.post(`/api/projects/${first.project._id}/comments`, { body: '   ' })).status).toBe(400);
        expect(
            (await speaker.client.post(`/api/projects/${first.project._id}/comments`, { body: 'x'.repeat(2001) }))
                .status,
        ).toBe(400);

        const elsewhere = await speaker.client.post(`/api/projects/${second.project._id}/comments`, { body: 'Nice.' });
        const crossed = await speaker.client.post(`/api/projects/${first.project._id}/comments`, {
            body: 'Smuggled.',
            parentId: elsewhere.body.data._id,
        });
        expect(crossed.status).toBe(400);
    });

    it('an author takes back their words; the placeholder says so', async () => {
        const { project } = await scene();
        const speaker = await visitor();
        const made = await speaker.client.post(`/api/projects/${project._id}/comments`, { body: 'Regrets.' });

        expect((await speaker.client.del(`/api/comments/${made.body.data._id}`)).status).toBe(200);

        const listed = await createClient().get(`/api/projects/${project._id}/comments`);
        expect(listed.body.data[0].body).toBe('[removed by its author]');
        expect(listed.body.data[0].removed).toBe(true);
        expect(listed.body.data[0].author).toBe(null);
    });

    it('the organiser moderates, the trail records it, a stranger cannot', async () => {
        const { organizer, event, project } = await scene();
        const speaker = await visitor();
        const made = await speaker.client.post(`/api/projects/${project._id}/comments`, { body: 'Spam spam spam.' });

        const stranger = await visitor();
        expect((await stranger.client.del(`/api/comments/${made.body.data._id}`)).status).toBe(403);

        expect((await organizer.client.del(`/api/comments/${made.body.data._id}`)).status).toBe(200);
        const listed = await createClient().get(`/api/projects/${project._id}/comments`);
        expect(listed.body.data[0].body).toBe('[removed by the organiser]');

        // Moderation is an exercise of power, so it is in the audit trail.
        const trail = await organizer.client.get(`/api/events/${event._id}/audit`);
        expect(trail.body.data.map((r) => r.action)).toContain('comment.removed');
    });

    it('a removed comment cannot be removed again, and drafts take no comments', async () => {
        const { event, track, project } = await scene();
        const speaker = await visitor();
        const made = await speaker.client.post(`/api/projects/${project._id}/comments`, { body: 'Once.' });
        await speaker.client.del(`/api/comments/${made.body.data._id}`);
        expect((await speaker.client.del(`/api/comments/${made.body.data._id}`)).status).toBe(404);

        const draft = await anotherEntry(event._id, track._id, 'Hidden', { submit: false });
        expect(
            (await speaker.client.post(`/api/projects/${draft.project._id}/comments`, { body: 'Peek.' })).status,
        ).toBe(404);
        expect((await createClient().get(`/api/projects/${draft.project._id}/comments`)).status).toBe(404);
    });

    it('a chattering account hits its own ceiling, nobody else theirs', async () => {
        const { project } = await scene();
        const chatter = await visitor();
        const calm = await visitor();

        await withLimits({ comment: { limit: 2 } }, async () => {
            expect((await chatter.client.post(`/api/projects/${project._id}/comments`, { body: 'one' })).status).toBe(201);
            expect((await chatter.client.post(`/api/projects/${project._id}/comments`, { body: 'two' })).status).toBe(201);
            const blocked = await chatter.client.post(`/api/projects/${project._id}/comments`, { body: 'three' });
            expect(blocked.status).toBe(429);

            // Counted per account: the quiet account still speaks.
            expect((await calm.client.post(`/api/projects/${project._id}/comments`, { body: 'hello' })).status).toBe(201);
        });
    });
});

describe('the public API shows exactly what is public', () => {
    it('the index names its endpoints and takes no verbs but GET', async () => {
        const anon = createClient();
        const index = await anon.get('/api/v1');
        expect(index.status).toBe(200);
        expect(index.body.data.version).toBe(1);
        expect(index.body.data.endpoints.length > 0).toBeTruthy();

        expect((await anon.post('/api/v1/events', {})).status).toBe(404);
    });

    it('an event answers with its public face and nothing else', async () => {
        const { event } = await scene();
        const got = await createClient().get(`/api/v1/events/${event._id}`);
        expect(got.status).toBe(200);
        expect(got.body.data.name).toBeDefined();
        // The allow-list at work: fields that exist on the model but are
        // nobody's business do not survive serialization.
        const raw = JSON.stringify(got.body.data);
        expect(raw.includes('judgeIds')).toBeFalsy();
        expect(raw.includes('organiserId')).toBeFalsy();
        expect(raw.includes('@')).toBeFalsy();
    });

    it('event projects are submitted work only, votes attached, roster withheld', async () => {
        const { event, track, project } = await scene();
        await anotherEntry(event._id, track._id, 'Backstage', { submit: false });
        const voter = await visitor();
        await voter.client.post(`/api/projects/${project._id}/vote`);

        const listed = await createClient().get(`/api/v1/events/${event._id}/projects`);
        expect(listed.status).toBe(200);
        expect(listed.body.data).toHaveLength(1);
        expect(listed.body.data[0].title).toBe('Quorum');
        expect(listed.body.data[0].voteCount).toBe(1);
        expect(listed.body.data[0].team).toBe('Null Island');
        expect(JSON.stringify(listed.body.data).includes('members')).toBeFalsy();

        // A draft by id is a 404 here too.
        const projects = await mongoose.model('Project').find({ title: 'Backstage' });
        expect((await createClient().get(`/api/v1/projects/${projects[0]._id}`)).status).toBe(404);
    });

    it('the poll and the comments read the same through v1 as anywhere', async () => {
        const { event, project } = await scene();
        const voter = await visitor();
        await voter.client.post(`/api/projects/${project._id}/vote`);
        await voter.client.post(`/api/projects/${project._id}/comments`, { body: 'From the crowd.' });

        const poll = await createClient().get(`/api/v1/events/${event._id}/community`);
        expect(poll.body.data.totalVotes).toBe(1);

        const comments = await createClient().get(`/api/v1/projects/${project._id}/comments`);
        expect(comments.body.data).toHaveLength(1);
        expect(comments.body.data[0].body).toBe('From the crowd.');
    });

    it('the keyless surface has a ceiling per address', async () => {
        await withLimits({ publicRead: { limit: 3 } }, async () => {
            const anon = createClient();
            for (let i = 0; i < 3; i++) expect((await anon.get('/api/v1/events')).status).toBe(200);
            const blocked = await anon.get('/api/v1/events');
            expect(blocked.status).toBe(429);
            expect(Number(blocked.headers.get('retry-after')) > 0).toBeTruthy();
        });
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

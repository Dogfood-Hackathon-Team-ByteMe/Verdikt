/**
 * Stage G: the computed leaderboard.
 *
 * Standings are derived from ballots on every read rather than stored, so what
 * needs pinning is the arithmetic (weighting, per-criterion means, ties), the
 * treatment of entries nobody has scored, and who is allowed to look. The last
 * of those matters most: standings are built out of individual ballots, so
 * reading them is a way to infer what a particular judge said.
 */
import mongoose from 'mongoose';
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { createEvent, createTeam, createTrack, makeJudge, registerUser, seedScenario } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';

const RUBRIC = [
    { key: 'impact', label: 'Impact', weight: 3, maxScore: 5 },
    { key: 'craft', label: 'Craft', weight: 1, maxScore: 10 },
];

/** Add a submitted entry to an event, on a given track. */
async function addEntry(eventId, trackId, title, email) {
    const entrant = await registerUser(email);
    const team = await createTeam(entrant.client, eventId, `${title} Team`);
    const made = await entrant.client.post('/api/projects', {
        title,
        summary: `${title} summary`,
        repoUrl: `https://github.com/example/${title.toLowerCase()}`,
        trackId,
        teamId: team._id,
    });
    if (made.status !== 201) throw new Error(`addEntry(${title}) failed: ${made.text}`);
    await entrant.client.post(`/api/projects/${made.body.data._id}/submit`);
    return { entrant, project: made.body.data };
}

/**
 * An event with a rubric, two tracks, four submitted entries and two judges.
 * Alpha and Beta are scored identically (a tie), Gamma lower, Delta not at all.
 */
async function leaderboard() {
    const { organizer, event, track, participant, project } = await seedScenario();
    await organizer.client.put(`/api/events/${event._id}`, { criteria: RUBRIC });
    await participant.client.post(`/api/projects/${project._id}/submit`);

    const second = await createTrack(organizer.client, event._id, 'Infrastructure');

    const beta = await addEntry(event._id, track._id, 'Beta', 'beta-g@verdikt.dev');
    const gamma = await addEntry(event._id, second._id, 'Gamma', 'gamma-g@verdikt.dev');
    const delta = await addEntry(event._id, second._id, 'Delta', 'delta-g@verdikt.dev');

    const judgeA = await registerUser('judge-a-g@verdikt.dev', 'Ada');
    const judgeB = await registerUser('judge-b-g@verdikt.dev', 'Bruno');
    // Ada judges both tracks, so she may score Gamma; Bruno only the first.
    await makeJudge(judgeA.id, event._id, track._id);
    await makeJudge(judgeA.id, event._id, second._id);
    await makeJudge(judgeB.id, event._id, track._id);

    // Every ballot here is asserted, so a scoping change that refuses one fails
    // in the setup, loudly, instead of as a puzzling rank three tests later.
    const cast = async (judge, projectId, scores) => {
        const res = await judge.client.put('/api/scores/ballot', { projectId, scores });
        if (res.status !== 200) throw new Error(`setup ballot refused (${res.status}): ${res.text}`);
    };

    // Quorum (the seeded entry) and Beta both average (5+4)/2 impact and
    // (10+8)/2 craft, so they tie at the top.
    for (const target of [project._id, beta.project._id]) {
        await cast(judgeA, target, { impact: 5, craft: 10 });
        await cast(judgeB, target, { impact: 4, craft: 8 });
    }
    await cast(judgeA, gamma.project._id, { impact: 1, craft: 2 });

    return { organizer, event, track, second, judgeA, judgeB, participant, quorum: project, beta, gamma, delta };
}

const rowFor = (standings, title) => standings.find((r) => r.title === title);

describe('the leaderboard is computed from ballots', () => {
    it('ranks entries by weighted score, best first', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        expect(res.status).toBe(200);

        const rows = res.body.data.standings;
        expect(rowFor(rows, 'Gamma').rank).toBe(3);
        // Quorum and Beta scored identically.
        expect(rowFor(rows, 'Quorum').rank).toBe(1);
        expect(rowFor(rows, 'Beta').rank).toBe(1);
    });

    it('weights each criterion by its own scale, not by raw points', async () => {
        // impact is out of 5 with weight 3; craft is out of 10 with weight 1.
        // (5/5)*3 + (10/10)*1 = 4, over a total weight of 4 -> 1.0. The judges
        // averaged 4.5/5 and 9/10, so both lines sit at 0.9.
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        // weightedScore is the raw column, before cross-judge normalization.
        expect(Number(rowFor(res.body.data.standings, 'Quorum').weightedScore.toFixed(4))).toBe(0.9);
    });

    it('reports the per-criterion average for each entry', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const row = rowFor(res.body.data.standings, 'Quorum');
        expect(row.perCriterion.impact).toBe(4.5);
        expect(row.perCriterion.craft).toBe(9);
    });

    it('counts the ballots behind each entry', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        expect(rowFor(res.body.data.standings, 'Quorum').ballotCount).toBe(2);
        expect(rowFor(res.body.data.standings, 'Gamma').ballotCount).toBe(1);
    });

    it('gives tied entries the same rank and skips the one behind', async () => {
        // Competition ranking: 1, 1, 3 -- what a prize table means by "joint
        // first". Numbering the tie 1 and 2 would invent a winner.
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const ranks = res.body.data.standings.map((r) => r.rank);
        expect(ranks.filter((r) => r === 1).length).toBe(2);
        expect(ranks.includes(2)).toBe(false);
        expect(ranks.includes(3)).toBe(true);
    });

    it('ranks within each track as well as overall', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        // Gamma is third overall but the best in its own track.
        const gamma = rowFor(res.body.data.standings, 'Gamma');
        expect(gamma.rank).toBe(3);
        expect(gamma.trackRank).toBe(1);
    });
});

describe('entries nobody has scored', () => {
    it('are listed but left unranked, not ranked last', async () => {
        // A null rank says "no judge has been here". A number would say the team
        // competed and lost.
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const delta = rowFor(res.body.data.standings, 'Delta');
        expect(delta.rank).toBe(null);
        expect(delta.trackRank).toBe(null);
        expect(delta.weightedScore).toBe(null);
        expect(delta.ballotCount).toBe(0);
    });

    it('sort to the end of the table', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const rows = res.body.data.standings;
        expect(rows[rows.length - 1].title).toBe('Delta');
    });

    it('show up in the progress counters', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const p = res.body.data.progress;
        expect(p.projectCount).toBe(4);
        expect(p.scoredProjectCount).toBe(3);
        expect(p.unscoredProjectCount).toBe(1);
        expect(p.ballotCount).toBe(5);
    });
});

describe('judging progress', () => {
    it('reports a ballot count per judge on the panel', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const judges = res.body.data.progress.judges;
        expect(judges.length).toBe(2);
        expect(judges.find((j) => j.name === 'Ada').ballotCount).toBe(3);
        expect(judges.find((j) => j.name === 'Bruno').ballotCount).toBe(2);
    });

    it('lists a judge who has not started, rather than omitting them', async () => {
        const { organizer, event, track } = await leaderboard();
        const idle = await registerUser('idle-g@verdikt.dev', 'Cleo');
        await makeJudge(idle.id, event._id, track._id);

        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const cleo = res.body.data.progress.judges.find((j) => j.name === 'Cleo');
        expect(cleo.ballotCount).toBe(0);
    });
});

describe('a draft is not in the running', () => {
    it('is left out of the standings entirely', async () => {
        const { organizer, event, track } = await leaderboard();
        const entrant = await registerUser('drafter-g@verdikt.dev');
        const team = await createTeam(entrant.client, event._id, 'Drafters');
        await entrant.client.post('/api/projects', {
            title: 'Still Writing',
            summary: 'Not handed in',
            repoUrl: 'https://github.com/example/wip',
            trackId: track._id,
            teamId: team._id,
        });

        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        expect(rowFor(res.body.data.standings, 'Still Writing')).toBe(undefined);
        expect(res.body.data.progress.projectCount).toBe(4);
    });
});

describe('who may read the standings', () => {
    it('the organiser of the event can', async () => {
        const { organizer, event } = await leaderboard();
        expect((await organizer.client.get(`/api/events/${event._id}/standings`)).status).toBe(200);
    });

    it('a judge cannot, because the aggregate reveals their peers', async () => {
        // Judge isolation is the point of T2. A judge who knows their own
        // ballots and can read the mean can solve for everyone else's.
        const { judgeA, event } = await leaderboard();
        expect((await judgeA.client.get(`/api/events/${event._id}/standings`)).status).toBe(403);
    });

    it('a participant cannot', async () => {
        const { participant, event } = await leaderboard();
        expect((await participant.client.get(`/api/events/${event._id}/standings`)).status).toBe(403);
    });

    it('an anonymous visitor cannot', async () => {
        const { event } = await leaderboard();
        expect((await createClient().get(`/api/events/${event._id}/standings`)).status).toBe(401);
    });

    it('the organiser of a DIFFERENT event cannot', async () => {
        // Organising one hackathon is not a credential on another's ballots.
        const { event } = await leaderboard();
        const other = await registerUser('other-org-g@verdikt.dev');
        await createEvent(other.client, { name: 'Unrelated Hack' });
        expect((await other.client.get(`/api/events/${event._id}/standings`)).status).toBe(403);
    });

    it('an admin can', async () => {
        const { event } = await leaderboard();
        const admin = await registerUser('admin-g@verdikt.dev');
        await mongoose.model('User').findByIdAndUpdate(admin.id, { isAdmin: true });
        expect((await admin.client.get(`/api/events/${event._id}/standings`)).status).toBe(200);
    });

    it('an unknown event is a 404, not an empty table', async () => {
        const { organizer } = await leaderboard();
        const missing = new mongoose.Types.ObjectId();
        expect((await organizer.client.get(`/api/events/${missing}/standings`)).status).toBe(404);
    });
});

/** Parse a CSV the way the tests need it: header names to cells, per row. */
const parseCsv = (text) => {
    const [head, ...lines] = text.trim().split('\n');
    const cols = head.split(',');
    const cells = (line) => {
        const out = [];
        let cur = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (quoted) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (c === '"') quoted = false;
                else cur += c;
            } else if (c === '"') quoted = true;
            else if (c === ',') { out.push(cur); cur = ''; }
            else cur += c;
        }
        out.push(cur);
        return out;
    };
    return { cols, rows: lines.map((l) => Object.fromEntries(cells(l).map((v, i) => [cols[i], v]))) };
};

describe('the standings CSV', () => {
    it('has one row per entry, with both scores and each average', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings.csv`);
        expect(res.status).toBe(200);

        const { cols, rows } = parseCsv(res.text);
        for (const col of ['rank', 'normalized_score_pct', 'raw_score_pct', 'avg_impact', 'avg_craft']) {
            expect(cols.includes(col)).toBe(true);
        }
        // The four submitted entries.
        expect(rows.length).toBe(4);
        expect(rows.find((r) => r.project_title === 'Quorum').raw_score_pct).toBe('90');
    });

    it('leaves the scores blank for an unjudged entry rather than writing 0', async () => {
        const { organizer, event } = await leaderboard();
        const res = await organizer.client.get(`/api/events/${event._id}/standings.csv`);
        const delta = parseCsv(res.text).rows.find((r) => r.project_title === 'Delta');
        expect(delta.rank).toBe('');
        expect(delta.ballots).toBe('0');
        expect(delta.raw_score_pct).toBe('');
        expect(delta.normalized_score_pct).toBe('');
    });

    it('quotes a title containing a comma so the columns survive', async () => {
        const { organizer, event, track } = await leaderboard();
        await addEntry(event._id, track._id, 'Tea, Earl Grey', 'comma-g@verdikt.dev');

        const res = await organizer.client.get(`/api/events/${event._id}/standings.csv`);
        expect(res.text).toContain('"Tea, Earl Grey"');
        // Still one line per entry: the comma did not split the row.
        expect(res.text.trim().split('\n').length).toBe(6);
    });

    it('is refused to a judge, like the JSON', async () => {
        const { judgeA, event } = await leaderboard();
        expect((await judgeA.client.get(`/api/events/${event._id}/standings.csv`)).status).toBe(403);
    });
});

describe('an event with no rubric', () => {
    it('produces a table an organiser can still read', async () => {
        const { organizer, event, track, project, participant } = await seedScenario();
        await participant.client.post(`/api/projects/${project._id}/submit`);

        const judge = await registerUser('norubric2-g@verdikt.dev');
        await makeJudge(judge.id, event._id, track._id);
        await judge.client.put('/api/scores/ballot', { projectId: project._id, scores: { technical: 5 } });

        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        expect(res.status).toBe(200);
        expect(res.body.data.standings.length).toBe(1);
        // technical 5 on the assumed 0..5 scale is a full mark.
        expect(res.body.data.standings[0].weightedScore).toBe(1);
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

/**
 * Stage H: the rest of Tier 2 -- normalization, batch assignment, judging
 * scope, judge invites, and an export for every stage.
 *
 * The common thread is that each of these can be quietly defeated by a path
 * the UI never takes: a judge scoring outside their track by calling the API
 * directly, a removed judge whose access got WIDER, a forwarded invite link,
 * an application naming another event's track, a spreadsheet formula in an
 * entry title. Every test here is over HTTP, so it is the server's word that
 * is being checked, not the page's.
 */
import mongoose from 'mongoose';
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { createEvent, createTeam, createTrack, registerUser } from './helpers.mjs';
import { describe, expect, it, run } from './runner.mjs';
import { runProof } from '../utils/normalizationProof.js';

const RUBRIC = [
    { key: 'impact', label: 'Impact', weight: 1, maxScore: 10 },
];

let seq = 0;
const email = (name) => `${name}-${++seq}-h@verdikt.dev`;

/** A submitted entry on a track, by a fresh team. */
async function entry(eventId, trackId, title) {
    const who = await registerUser(email('entrant'));
    const team = await createTeam(who.client, eventId, `${title} Team`);
    const made = await who.client.post('/api/projects', {
        title,
        summary: `${title} summary`,
        repoUrl: `https://github.com/example/${encodeURIComponent(title)}`,
        trackId,
        teamId: team._id,
    });
    if (made.status !== 201) throw new Error(`entry(${title}): ${made.status} ${made.text}`);
    const sub = await who.client.post(`/api/projects/${made.body.data._id}/submit`);
    if (sub.status !== 200) throw new Error(`submit(${title}): ${sub.status} ${sub.text}`);
    return { who, team, project: made.body.data };
}

/** Cast a ballot and insist it landed. */
async function ballot(judge, projectId, impact) {
    const res = await judge.client.put('/api/scores/ballot', { projectId, scores: { impact } });
    if (res.status !== 200) throw new Error(`ballot refused (${res.status}): ${res.text}`);
    return res.body.data;
}

/**
 * Two tracks with two entries each, a judge per track and one on both.
 * No ballots, no assignments.
 */
async function panel() {
    const organizer = await registerUser(email('org'), 'Mira');
    const event = await createEvent(organizer.client);
    await organizer.client.put(`/api/events/${event._id}`, { criteria: RUBRIC });
    const alpha = await createTrack(organizer.client, event._id, 'Alpha');
    const beta = await createTrack(organizer.client, event._id, 'Beta');

    const a1 = await entry(event._id, alpha._id, 'A-One');
    const a2 = await entry(event._id, alpha._id, 'A-Two');
    const b1 = await entry(event._id, beta._id, 'B-One');
    const b2 = await entry(event._id, beta._id, 'B-Two');

    const onAlpha = await registerUser(email('alphajudge'), 'Aria');
    const onBeta = await registerUser(email('betajudge'), 'Bo');
    const onBoth = await registerUser(email('bothjudge'), 'Cy');
    for (const [j, tracks] of [[onAlpha, [alpha]], [onBeta, [beta]], [onBoth, [alpha, beta]]]) {
        for (const t of tracks) {
            const res = await organizer.client.post(`/api/tracks/${t._id}/judges`, { email: j.user.email });
            if (res.status !== 200) throw new Error(`appoint: ${res.status} ${res.text}`);
        }
    }

    return { organizer, event, alpha, beta, a1, a2, b1, b2, onAlpha, onBeta, onBoth };
}

// ---------------------------------------------------------------------------

describe('cross-judge normalization in the standings', () => {
    it('a harsh and a generous judge who agree on the order produce the same normalized scores', async () => {
        const { organizer, event, a1, a2, onAlpha, onBoth } = await panel();
        // onAlpha is harsh, onBoth generous; both rank A-Two above A-One by the
        // same margin in their own terms.
        await ballot(onAlpha, a1.project._id, 2);
        await ballot(onAlpha, a2.project._id, 4);
        await ballot(onBoth, a1.project._id, 7);
        await ballot(onBoth, a2.project._id, 9);

        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const rows = res.body.data.standings;
        const one = rows.find((r) => r.title === 'A-One');
        const two = rows.find((r) => r.title === 'A-Two');

        expect(res.body.data.method).toBe('normalized');
        expect(two.rank).toBe(1);
        // Normalized, both judges' ballots on an entry say the same thing, so
        // every ballot counted as corrected.
        expect(one.correctedBallots).toBe(2);
        expect(two.normalizedScore > one.normalizedScore).toBe(true);
    });

    it('removes a generous judge’s advantage: each judge’s favourite ends up level', async () => {
        // Aria is harsh and Cy generous. They both score a shared calibration
        // entry, A-Three, which is what makes their habits comparable. Beyond
        // that, each scores one other entry -- and it is each one's favourite.
        //
        //   raw:        A-One 90 (Cy's pick) beats A-Two 60 (Aria's pick),
        //               purely because Cy scores everything higher
        //   normalized: both are their judge's top pick by the same margin,
        //               so they tie
        const { organizer, event, alpha, a1, a2, onAlpha, onBoth } = await panel();
        const a3 = await entry(event._id, alpha._id, 'A-Three');
        await ballot(onAlpha, a3.project._id, 2);
        await ballot(onAlpha, a2.project._id, 6);
        await ballot(onBoth, a3.project._id, 8);
        await ballot(onBoth, a1.project._id, 9);

        const raw = (await organizer.client.get(`/api/events/${event._id}/standings?method=raw`)).body.data;
        const norm = (await organizer.client.get(`/api/events/${event._id}/standings?method=normalized`)).body.data;
        const rank = (data, title) => data.standings.find((r) => r.title === title).rank;

        expect(raw.method).toBe('raw');
        expect(rank(raw, 'A-One')).toBe(1);
        expect(rank(raw, 'A-Two')).toBe(2);

        expect(norm.method).toBe('normalized');
        expect(rank(norm, 'A-One')).toBe(1);
        expect(rank(norm, 'A-Two')).toBe(1);
        expect(rank(norm, 'A-Three')).toBe(3);
    });

    it('a judge with a single ballot is left uncorrected, and the panel says why', async () => {
        const { organizer, event, a1, a2, onAlpha, onBoth } = await panel();
        await ballot(onAlpha, a1.project._id, 5);          // only one ballot
        await ballot(onBoth, a1.project._id, 6);
        await ballot(onBoth, a2.project._id, 8);

        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        const aria = res.body.data.progress.judges.find((j) => j.name === 'Aria');
        const cy = res.body.data.progress.judges.find((j) => j.name === 'Cy');
        expect(aria.corrected).toBe(false);
        expect(aria.uncorrectedReason).toBe('too-few-ballots');
        expect(cy.corrected).toBe(true);
        expect(typeof cy.meanScore).toBe('number');
    });

    it('an unknown method is a 400, not a silently different ranking', async () => {
        const { organizer, event } = await panel();
        expect((await organizer.client.get(`/api/events/${event._id}/standings?method=vibes`)).status).toBe(400);
    });

    it('reports how many separately-comparable groups the panel split into', async () => {
        // onAlpha only ever sees Alpha and onBeta only Beta: two groups, and
        // bias between them cannot be measured -- only within each.
        const { organizer, event, a1, a2, b1, b2, onAlpha, onBeta } = await panel();
        await ballot(onAlpha, a1.project._id, 5);
        await ballot(onAlpha, a2.project._id, 7);
        await ballot(onBeta, b1.project._id, 4);
        await ballot(onBeta, b2.project._id, 6);

        const res = await organizer.client.get(`/api/events/${event._id}/standings`);
        expect(res.body.data.normalization.groups).toBe(2);
    });
});

describe('the normalization proof', () => {
    // The simulation behind JUDGING.md's numbers. If a change to the method made
    // these regress, the claim in the docs would silently stop being true.
    const report = runProof({ trials: 60 });

    it('beats raw scores when judges are biased and entries are dealt at random', () => {
        const r = report['biased-random'];
        expect(r.spearmanNormalized > r.spearmanRaw + 0.02).toBe(true);
        expect(r.normalizedWins > 0.85).toBe(true);
    });

    it('costs little when there is no bias to correct', () => {
        const r = report['fair-random'];
        expect(r.spearmanRaw - r.spearmanNormalized < 0.03).toBe(true);
    });

    it('does not fall apart when judges are kept to tracks of different strength', () => {
        // The case the naive whole-panel z-score gets badly wrong, and the
        // reason normalization is done per connected group.
        const r = report['biased-tracks'];
        expect(r.spearmanNaive < r.spearmanRaw - 0.05).toBe(true);
        expect(r.spearmanNormalized >= r.spearmanRaw - 0.01).toBe(true);
    });
});

describe('a track judge cannot score other tracks', () => {
    it('refuses a ballot on an entry outside the judge’s track', async () => {
        const { b1, onAlpha } = await panel();
        const res = await onAlpha.client.put('/api/scores/ballot', { projectId: b1.project._id, scores: { impact: 5 } });
        expect(res.status).toBe(403);
    });

    it('also refuses it through POST /api/scores', async () => {
        const { b1, onAlpha } = await panel();
        const res = await onAlpha.client.post('/api/scores', { projectId: b1.project._id, scores: { impact: 5 } });
        expect(res.status).toBe(403);
    });

    it('allows a judge appointed to both tracks to score either', async () => {
        const { a1, b1, onBoth } = await panel();
        await ballot(onBoth, a1.project._id, 5);
        await ballot(onBoth, b1.project._id, 5);
    });

    it('the judging queue lists only the judge’s own track', async () => {
        const { event, onAlpha } = await panel();
        const res = await onAlpha.client.get(`/api/judge/queue?eventId=${event._id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.mode).toBe('tracks');
        expect(res.body.data.projects.map((p) => p.title).sort().join(',')).toBe('A-One,A-Two');
    });

    it('a participant gets no queue at all', async () => {
        const { event, a1 } = await panel();
        expect((await a1.who.client.get(`/api/judge/queue?eventId=${event._id}`)).status).toBe(403);
    });

    it('an admin who is not on the panel cannot cast a ballot', async () => {
        // Admins are staff, not panel members. A ballot from off the panel would
        // become part of the result with nobody having appointed its author.
        const { a1 } = await panel();
        const admin = await registerUser(email('admin'));
        await mongoose.model('User').findByIdAndUpdate(admin.id, { isAdmin: true });
        const res = await admin.client.put('/api/scores/ballot', { projectId: a1.project._id, scores: { impact: 9 } });
        expect(res.status).toBe(403);
    });
});

describe('taking a judge off the panel narrows their access, never widens it', () => {
    it('a judge removed from their only track can no longer score anything', async () => {
        // Before the fix they stayed on event.judgeIds with no track -- which
        // the scope rules read as an event-wide judge.
        const { organizer, alpha, a1, b1, onAlpha } = await panel();
        await organizer.client.del(`/api/tracks/${alpha._id}/judges/${onAlpha.id}`);

        const own = await onAlpha.client.put('/api/scores/ballot', { projectId: a1.project._id, scores: { impact: 5 } });
        const other = await onAlpha.client.put('/api/scores/ballot', { projectId: b1.project._id, scores: { impact: 5 } });
        expect(own.status).toBe(403);
        expect(other.status).toBe(403);
    });

    it('a removed judge is taken off the event too', async () => {
        const { organizer, event, alpha, onAlpha } = await panel();
        await organizer.client.del(`/api/tracks/${alpha._id}/judges/${onAlpha.id}`);
        const after = await mongoose.model('Event').findById(event._id);
        expect(after.judgeIds.map(String).includes(onAlpha.id)).toBe(false);
    });

    it('a judge removed from one of two tracks keeps the other', async () => {
        const { organizer, event, alpha, b1, onBoth } = await panel();
        await organizer.client.del(`/api/tracks/${alpha._id}/judges/${onBoth.id}`);
        await ballot(onBoth, b1.project._id, 5);
        const after = await mongoose.model('Event').findById(event._id);
        expect(after.judgeIds.map(String).includes(onBoth.id)).toBe(true);
    });

    it('a track with entries on it cannot be deleted out from under them', async () => {
        const { organizer, alpha } = await panel();
        expect((await organizer.client.del(`/api/tracks/${alpha._id}`)).status).toBe(409);
    });

    it('deleting an empty track takes its judges off the event and the track off the event', async () => {
        const { organizer, event } = await panel();
        const spare = await createTrack(organizer.client, event._id, 'Spare');
        const lone = await registerUser(email('lone'));
        await organizer.client.post(`/api/tracks/${spare._id}/judges`, { email: lone.user.email });

        expect((await organizer.client.del(`/api/tracks/${spare._id}`)).status).toBe(200);
        const after = await mongoose.model('Event').findById(event._id);
        expect(after.judgeIds.map(String).includes(lone.id)).toBe(false);
        expect(after.tracks.map(String).includes(spare._id)).toBe(false);
    });
});

describe('batch assignment', () => {
    it('gives every entry the reviews asked for, from eligible judges only', async () => {
        const { organizer, event } = await panel();
        const res = await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 2 });
        expect(res.status).toBe(200);
        expect(res.body.data.shortfall.length).toBe(0);

        const list = (await organizer.client.get(`/api/events/${event._id}/assignments`)).body.data;
        expect(list.length).toBe(8);
        // Aria judges Alpha only, Bo Beta only: neither was dealt the other track.
        expect(list.filter((a) => a.judgeName === 'Aria').every((a) => a.trackName === 'Alpha')).toBe(true);
        expect(list.filter((a) => a.judgeName === 'Bo').every((a) => a.trackName === 'Beta')).toBe(true);
    });

    it('balances the load when every judge can take every entry', async () => {
        // Put all three judges on both tracks. Eight reviews over three judges
        // can only be split 3/3/2, and that is what the assigner must find.
        const { organizer, event, alpha, beta, onAlpha, onBeta } = await panel();
        await organizer.client.post(`/api/tracks/${beta._id}/judges`, { email: onAlpha.user.email });
        await organizer.client.post(`/api/tracks/${alpha._id}/judges`, { email: onBeta.user.email });

        const res = await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 2 });
        const loads = res.body.data.perJudge.map((j) => j.assigned).sort();
        expect(loads.join(',')).toBe('2,3,3');
    });

    it('lets track isolation win over balance when the two conflict', async () => {
        // Aria covers Alpha only, Bo Beta only, Cy both. Two reviews per entry
        // leaves exactly one valid deal -- Cy on all four -- and the assigner
        // takes it rather than evening the load by crossing tracks.
        const { organizer, event } = await panel();
        const res = await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 2 });
        const load = Object.fromEntries(res.body.data.perJudge.map((j) => [j.name, j.assigned]));
        expect(load.Aria).toBe(2);
        expect(load.Bo).toBe(2);
        expect(load.Cy).toBe(4);
    });

    it('reports a shortfall rather than borrowing judges from another track', async () => {
        // Alpha has two eligible judges (Aria, Cy). Asking for three reviews
        // cannot be met without breaking track isolation, so it is not.
        const { organizer, event } = await panel();
        const res = await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 3 });
        expect(res.status).toBe(200);
        const short = res.body.data.shortfall;
        expect(short.length).toBe(4);
        expect(short.every((s) => s.assigned === 2 && s.wanted === 3 && s.eligibleJudges === 2)).toBe(true);
    });

    it('re-running tops up instead of duplicating', async () => {
        const { organizer, event } = await panel();
        await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 1 });
        await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 1 });
        const again = await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 2 });
        expect(again.body.data.total).toBe(8);
        const list = (await organizer.client.get(`/api/events/${event._id}/assignments`)).body.data;
        expect(list.length).toBe(8);
    });

    it('adopts a ballot cast before assignments existed, so nobody is locked out of it', async () => {
        const { organizer, event, a1, onAlpha } = await panel();
        await ballot(onAlpha, a1.project._id, 6);
        const res = await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 1 });
        expect(res.body.data.adopted).toBe(1);
        // Still editable.
        await ballot(onAlpha, a1.project._id, 7);
    });

    it('re-dealing does not hand a removed judge back the track they were taken off', async () => {
        // Cy scores a Beta entry, is then taken off Beta. The ballot stands,
        // but the next assignment run must not put Beta back in Cy's batch.
        const { organizer, event, beta, b1, onBoth } = await panel();
        await ballot(onBoth, b1.project._id, 7);
        await organizer.client.del(`/api/tracks/${beta._id}/judges/${onBoth.id}`);

        const res = await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 1 });
        expect(res.body.data.adopted).toBe(0);
        const list = (await organizer.client.get(`/api/events/${event._id}/assignments`)).body.data;
        expect(list.some((a) => a.judgeName === 'Cy' && a.trackName === 'Beta')).toBe(false);

        const again = await onBoth.client.put('/api/scores/ballot', { projectId: b1.project._id, scores: { impact: 9 } });
        expect(again.status).toBe(403);
        // ...and the ballot Cy already cast still counts.
        const rows = (await organizer.client.get(`/api/events/${event._id}/standings`)).body.data.standings;
        expect(rows.find((r) => r.title === 'B-One').ballotCount).toBe(1);
    });

    it('once assignments exist, a judge scores their batch and nothing else', async () => {
        // Aria is assigned A-One only. A-Two is in her own track -- but not in
        // her batch -- so it is refused, as is everything in Beta.
        const { organizer, event, a1, a2, b1, onAlpha } = await panel();
        const made = await organizer.client.post(`/api/events/${event._id}/assignments`, { judgeId: onAlpha.id, projectId: a1.project._id });
        expect(made.status).toBe(201);

        const queue = (await onAlpha.client.get(`/api/judge/queue?eventId=${event._id}`)).body.data;
        expect(queue.mode).toBe('assigned');
        expect(queue.projects.map((p) => p.title).join(',')).toBe('A-One');

        await ballot(onAlpha, a1.project._id, 5);
        for (const other of [a2, b1]) {
            const res = await onAlpha.client.put('/api/scores/ballot', { projectId: other.project._id, scores: { impact: 5 } });
            expect(res.status).toBe(403);
        }
    });

    it('a judge with no assignments in a batched event has an empty queue', async () => {
        const { organizer, event, a1, onAlpha, onBeta } = await panel();
        await organizer.client.post(`/api/events/${event._id}/assignments`, { judgeId: onAlpha.id, projectId: a1.project._id });
        const queue = (await onBeta.client.get(`/api/judge/queue?eventId=${event._id}`)).body.data;
        expect(queue.mode).toBe('assigned');
        expect(queue.projects.length).toBe(0);
    });

    it('rejects a nonsense review count', async () => {
        const { organizer, event } = await panel();
        for (const bad of [0, -1, 2.5, 'three', 99]) {
            const res = await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: bad });
            expect(res.status).toBe(400);
        }
    });

    it('a hand assignment is held to the same track rule', async () => {
        const { organizer, event, b1, onAlpha } = await panel();
        const res = await organizer.client.post(`/api/events/${event._id}/assignments`, { judgeId: onAlpha.id, projectId: b1.project._id });
        expect(res.status).toBe(409);
    });

    it('a hand assignment within the track works', async () => {
        const { organizer, event, a1, onAlpha } = await panel();
        const res = await organizer.client.post(`/api/events/${event._id}/assignments`, { judgeId: onAlpha.id, projectId: a1.project._id });
        expect(res.status).toBe(201);
    });

    it('an assignment the judge has already scored cannot be removed', async () => {
        const { organizer, event, a1, onAlpha } = await panel();
        const made = await organizer.client.post(`/api/events/${event._id}/assignments`, { judgeId: onAlpha.id, projectId: a1.project._id });
        await ballot(onAlpha, a1.project._id, 5);
        expect((await organizer.client.del(`/api/assignments/${made.body.data._id}`)).status).toBe(409);
    });

    it('clearing assignments returns judges to scoring by track', async () => {
        const { organizer, event, onAlpha } = await panel();
        await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 1 });
        await organizer.client.del(`/api/events/${event._id}/assignments`);
        const queue = (await onAlpha.client.get(`/api/judge/queue?eventId=${event._id}`)).body.data;
        expect(queue.mode).toBe('tracks');
        expect(queue.projects.length).toBe(2);
    });

    it('only the organiser can deal, list or clear assignments', async () => {
        const { event, onAlpha, a1 } = await panel();
        const outsider = await registerUser(email('outsider'));
        for (const who of [onAlpha, a1.who, outsider]) {
            expect((await who.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 1 })).status).toBe(403);
            expect((await who.client.get(`/api/events/${event._id}/assignments`)).status).toBe(403);
            expect((await who.client.del(`/api/events/${event._id}/assignments`)).status).toBe(403);
        }
    });

    it('the leaderboard shows how many reviews each entry was assigned', async () => {
        const { organizer, event } = await panel();
        await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 2 });
        const rows = (await organizer.client.get(`/api/events/${event._id}/standings`)).body.data.standings;
        expect(rows.every((r) => r.assignedCount === 2)).toBe(true);
    });
});

describe('judge invites', () => {
    const invite = async (organizer, trackId, to) => {
        const res = await organizer.client.post(`/api/tracks/${trackId}/judge-invites`, { email: to });
        if (res.status !== 201) throw new Error(`invite: ${res.status} ${res.text}`);
        return res.body.data;
    };

    it('someone with no account yet can be invited, sign up, and accept', async () => {
        const { organizer, event, alpha } = await panel();
        const address = email('newjudge');
        const inv = await invite(organizer, alpha._id, address);

        const preview = await createClient().get(`/api/judge-invites/token/${inv.token}`);
        expect(preview.status).toBe(200);
        expect(preview.body.data.trackName).toBe('Alpha');
        expect(preview.body.data.status).toBe('pending');

        const judge = await registerUser(address, 'Dee');
        const accepted = await judge.client.post(`/api/judge-invites/token/${inv.token}/accept`);
        expect(accepted.status).toBe(200);

        const queue = await judge.client.get(`/api/judge/queue?eventId=${event._id}`);
        expect(queue.status).toBe(200);
    });

    it('the public preview masks the address', async () => {
        const { organizer, alpha } = await panel();
        const inv = await invite(organizer, alpha._id, 'nadia.long@example.org');
        const preview = await createClient().get(`/api/judge-invites/token/${inv.token}`);
        expect(preview.body.data.emailHint.includes('nadia.long')).toBe(false);
        expect(preview.body.data.emailHint.endsWith('@example.org')).toBe(true);
        expect(preview.text.includes(inv.token.slice(8))).toBe(false);
    });

    it('a forwarded link is useless to a different account', async () => {
        const { organizer, alpha } = await panel();
        const inv = await invite(organizer, alpha._id, email('intended'));
        const stranger = await registerUser(email('stranger'));
        expect((await stranger.client.post(`/api/judge-invites/token/${inv.token}/accept`)).status).toBe(403);
    });

    it('an invite works exactly once', async () => {
        const { organizer, alpha } = await panel();
        const address = email('once');
        const inv = await invite(organizer, alpha._id, address);
        const judge = await registerUser(address);
        expect((await judge.client.post(`/api/judge-invites/token/${inv.token}/accept`)).status).toBe(200);
        expect((await judge.client.post(`/api/judge-invites/token/${inv.token}/accept`)).status).toBe(409);
    });

    it('a withdrawn invite cannot be accepted', async () => {
        const { organizer, alpha } = await panel();
        const address = email('revoked');
        const inv = await invite(organizer, alpha._id, address);
        expect((await organizer.client.del(`/api/judge-invites/${inv._id}`)).status).toBe(200);
        const judge = await registerUser(address);
        expect((await judge.client.post(`/api/judge-invites/token/${inv.token}/accept`)).status).toBe(410);
    });

    it('an expired invite cannot be accepted', async () => {
        const { organizer, alpha } = await panel();
        const address = email('expired');
        const inv = await invite(organizer, alpha._id, address);
        await mongoose.model('JudgeInvite').findByIdAndUpdate(inv._id, { expiresAt: new Date(Date.now() - 1000) });
        const judge = await registerUser(address);
        expect((await judge.client.post(`/api/judge-invites/token/${inv.token}/accept`)).status).toBe(410);
    });

    it('someone who joined a team in the meantime is refused when they accept', async () => {
        // Checked at acceptance, against who they are then -- not when the
        // organiser sent the link.
        const { organizer, event, alpha } = await panel();
        const address = email('switcher');
        const inv = await invite(organizer, alpha._id, address);
        const judge = await registerUser(address);
        await createTeam(judge.client, event._id, 'Switchers');
        expect((await judge.client.post(`/api/judge-invites/token/${inv.token}/accept`)).status).toBe(409);
    });

    it('inviting the same address twice hands back the same open invite', async () => {
        const { organizer, alpha } = await panel();
        const address = email('twice');
        const first = await invite(organizer, alpha._id, address);
        const second = await invite(organizer, alpha._id, address);
        expect(second.token).toBe(first.token);
    });

    it('only the organiser can create or list invites', async () => {
        const { alpha, onAlpha } = await panel();
        expect((await onAlpha.client.post(`/api/tracks/${alpha._id}/judge-invites`, { email: 'x@y.org' })).status).toBe(403);
        expect((await onAlpha.client.get(`/api/tracks/${alpha._id}/judge-invites`)).status).toBe(403);
    });

    it('an unknown token is a 404', async () => {
        expect((await createClient().get('/api/judge-invites/token/nope')).status).toBe(404);
    });
});

describe('judge applications cannot cross events or skip the rules', () => {
    it('an application naming another event’s track is refused', async () => {
        const { event } = await panel();
        await mongoose.model('Event').findByIdAndUpdate(event._id, { isJudgeApplyOpen: true });
        const other = await registerUser(email('otherorg'));
        const otherEvent = await createEvent(other.client, { name: 'Other' });
        const foreignTrack = await createTrack(other.client, otherEvent._id, 'Foreign');

        const applicant = await registerUser(email('applicant'));
        const res = await applicant.client.post('/api/judge-applications', { eventId: event._id, trackId: foreignTrack._id });
        expect(res.status).toBe(400);
    });

    it('an organiser cannot apply to judge their own event', async () => {
        const { organizer, event, alpha } = await panel();
        await mongoose.model('Event').findByIdAndUpdate(event._id, { isJudgeApplyOpen: true });
        const res = await organizer.client.post('/api/judge-applications', { eventId: event._id, trackId: alpha._id });
        expect(res.status).toBe(400);
    });

    it('an applicant who joins a team before being accepted is not appointed', async () => {
        const { organizer, event, alpha } = await panel();
        await mongoose.model('Event').findByIdAndUpdate(event._id, { isJudgeApplyOpen: true });
        const applicant = await registerUser(email('applicant2'));
        const applied = await applicant.client.post('/api/judge-applications', { eventId: event._id, trackId: alpha._id });
        expect(applied.status).toBe(201);

        await createTeam(applicant.client, event._id, 'Late Joiners');
        const accept = await organizer.client.post(`/api/judge-applications/${applied.body.data._id}/accept`);
        expect(accept.status).toBe(409);
        const user = await mongoose.model('User').findById(applicant.id);
        expect(user.judgeIn.length).toBe(0);
    });
});

describe('an export for every stage', () => {
    it('entries: every entry, drafts included, with its answers', async () => {
        const { organizer, event, alpha } = await panel();
        const drafter = await registerUser(email('drafter'));
        const team = await createTeam(drafter.client, event._id, 'Drafters');
        await drafter.client.post('/api/projects', { title: 'Still Writing', summary: 's', trackId: alpha._id, teamId: team._id });

        const res = await organizer.client.get(`/api/events/${event._id}/entries.csv`);
        expect(res.status).toBe(200);
        expect(res.text.split('\n')[0].startsWith('project_title,team_name,members,track,status')).toBe(true);
        expect(res.text).toContain('"Still Writing"');
        expect(res.text).toContain('"draft"');
        expect(res.text).toContain('"submitted"');
    });

    it('assignments: who was asked to review what, and whether they have', async () => {
        const { organizer, event, a1, onAlpha } = await panel();
        await organizer.client.post(`/api/events/${event._id}/assignments/auto`, { reviewsPerProject: 1 });
        const res = await organizer.client.get(`/api/events/${event._id}/assignments.csv`);
        expect(res.status).toBe(200);
        expect(res.text.split('\n')[0]).toBe('judge_name,judge_email,project_title,track,assigned_by,scored');
        expect(res.text.trim().split('\n').length).toBe(5);
        expect(a1 && onAlpha).toBeTruthy();
    });

    it('ballots: each ballot row carries its weighted and normalized score', async () => {
        const { organizer, event, a1, a2, onBoth } = await panel();
        await ballot(onBoth, a1.project._id, 4);
        await ballot(onBoth, a2.project._id, 8);
        const res = await organizer.client.get(`/api/export.csv?eventId=${event._id}`);
        expect(res.status).toBe(200);
        expect(res.text.split('\n')[0].endsWith('ballot_weighted_pct,ballot_normalized_pct')).toBe(true);
    });

    it('a title a spreadsheet would run as a formula is defused', async () => {
        const { organizer, event, alpha, onAlpha } = await panel();
        const evil = await entry(event._id, alpha._id, '=HYPERLINK("http://evil.example","win")');
        await ballot(onAlpha, evil.project._id, 5);

        for (const path of [
            `/api/events/${event._id}/entries.csv`,
            `/api/events/${event._id}/standings.csv`,
            `/api/export.csv?eventId=${event._id}`,
        ]) {
            const res = await organizer.client.get(path);
            expect(res.text.includes('"=HYPERLINK')).toBe(false);
            expect(res.text.includes(`"'=HYPERLINK(""http://evil.example"",""win"")"`)).toBe(true);
        }
    });

    it('every export is refused to a judge, a participant and a stranger', async () => {
        const { event, onAlpha, a1 } = await panel();
        const outsider = await registerUser(email('nosy'));
        const paths = [
            `/api/events/${event._id}/entries.csv`,
            `/api/events/${event._id}/assignments.csv`,
            `/api/events/${event._id}/standings.csv`,
            `/api/export.csv?eventId=${event._id}`,
        ];
        for (const who of [onAlpha, a1.who, outsider]) {
            for (const path of paths) expect((await who.client.get(path)).status).toBe(403);
        }
        for (const path of paths) expect((await createClient().get(path)).status).toBe(401);
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);

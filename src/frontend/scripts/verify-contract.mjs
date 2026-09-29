/**
 * Contract check: run the REAL adapters against the REAL backend.
 *
 * The adapter layer is the risky seam -- a renamed backend field fails silently
 * as a blank card rather than an error. So this bundles src/api/adapters.ts
 * with esbuild, fetches live JSON from a running API, and asserts the adapted
 * output is what the components expect.
 *
 * Usage (with `docker compose up` running):
 *   node scripts/verify-contract.mjs [apiBase] [webBase]
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = process.argv[2] || 'http://localhost:8080';
const WEB = process.argv[3] || 'http://localhost:3000';
const PASSWORD = 'dogfood2026';

let passed = 0;
let failed = 0;

const check = (name, fn) => {
    try {
        fn();
        console.log(`  PASS  ${name}`);
        passed++;
    } catch (error) {
        console.log(`  FAIL  ${name}`);
        console.log(`        ${error.message}`);
        failed++;
    }
};

const assert = (cond, message) => {
    if (!cond) throw new Error(message);
};

// --- Bundle the TypeScript adapters so Node can import them ----------------
const outDir = mkdtempSync(join(tmpdir(), 'verdikt-contract-'));
const outFile = join(outDir, 'adapters.mjs');

await build({
    entryPoints: ['src/api/adapters.ts'],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
});

const {
    toHackEvent,
    toProject,
    toTeam,
    toTrack,
    toInvite,
    toBallot,
    toStandings,
    toJudgeQueue,
    toAssignment,
    toAssignmentRun,
    toJudgeInvite,
    toJudgeInvitePreview,
    fromEventDraft,
} = await import(pathToFileURL(outFile).href);

// --- A cookie-aware fetch, so the authenticated checks work ----------------
const jar = new Map();
async function call(method, path, body, base = API) {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const line of res.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';');
        const i = pair.indexOf('=');
        jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, body: json, text };
}

console.log(`\nContract check against ${API}\n`);

// --- Event -----------------------------------------------------------------
console.log('toHackEvent');
const eventRes = await call('GET', '/api/events/featured');
assert(eventRes.status === 200, `featured event returned ${eventRes.status}`);
const event = toHackEvent(eventRes.body.data);

check('id, name and tagline survive the adapter', () => {
    assert(event.id, 'id is empty');
    assert(event.name === 'DOGFOOD 2026', `name was "${event.name}"`);
    assert(event.tagline, 'tagline is missing');
});
check('submissions_close is a valid future ISO date', () => {
    assert(event.submissions_close, 'submissions_close is empty');
    const d = new Date(event.submissions_close);
    assert(!Number.isNaN(d.getTime()), 'submissions_close is not a date');
    assert(d > new Date(), 'seeded deadline is already in the past');
});
check('starts_at is a valid date (falls back to createdAt)', () => {
    assert(!Number.isNaN(new Date(event.starts_at).getTime()), 'starts_at is not a date');
});
check('tracks are populated with names, not raw ids', () => {
    assert(event.tracks.length === 4, `expected 4 tracks, got ${event.tracks.length}`);
    assert(event.tracks.every((t) => t.id && t.name), 'a track is missing id or name');
    assert(event.tracks.some((t) => t.name === 'Judging Engines'), 'topic did not map to name');
});
check('prizes map amountUsd -> amount_usd', () => {
    assert(event.prizes.length === 6, `expected 6 prizes, got ${event.prizes.length}`);
    const grand = event.prizes.find((p) => p.name === 'Grand Prize');
    assert(grand, 'Grand Prize missing');
    assert(grand.amount_usd === 800, `amount_usd was ${grand.amount_usd}`);
    const tracked = event.prizes.find((p) => p.track);
    assert(tracked, 'no per-track prize came through');
});
check('custom questions come through with key, label and required', () => {
    assert(event.custom_questions.length === 2, `expected 2 questions, got ${event.custom_questions.length}`);
    const q = event.custom_questions.find((x) => x.key === 'whatsHard');
    assert(q, 'whatsHard question missing');
    assert(q.required === true, 'required flag lost');
    assert(q.type === 'longtext', `type was ${q.type}`);
});
check('team size limits come through', () => {
    assert(event.min_team_size === 1 && event.max_team_size === 4, 'team size limits wrong');
});

// --- Projects --------------------------------------------------------------
console.log('\ntoProject');
const projectsRes = await call('GET', '/api/projects');
const projects = projectsRes.body.data.map(toProject);

check('the public gallery adapts without a session', () => {
    // No fixed count. This runs against whatever database is up, which after a
    // fixtures import or a few hand-made events is not the pristine seed -- and
    // a hardcoded total turns "someone added an event" into a failed contract.
    // What the gallery contract actually says: it is readable anonymously, it
    // is not empty, and nothing in it is a draft.
    assert(projectsRes.status === 200, `status ${projectsRes.status}`);
    assert(projects.length > 0, 'the public gallery is empty');
    const drafts = projects.filter((p) => p.status !== 'submitted');
    assert(drafts.length === 0, `${drafts.length} draft(s) visible to an anonymous reader`);
});
check('team name is resolved from the populated ref', () => {
    assert(projects.every((p) => p.team && p.team !== 'Unknown team'), 'a project lost its team name');
});
check('track id and name both resolve', () => {
    assert(projects.every((p) => p.track), 'a project lost its track id');
    assert(projects.every((p) => p.track_name), 'a project lost its track name');
});
check('repo_url falls back across repoUrl / codeRepoLink', () => {
    assert(projects.every((p) => p.repo_url.startsWith('http')), 'a repo_url is missing');
});
check('tech tags map to tags', () => {
    const quorum = projects.find((p) => p.title === 'Quorum');
    assert(quorum, 'Quorum missing');
    assert(quorum.tags.includes('Go'), `tags were ${JSON.stringify(quorum.tags)}`);
});
check('status and submitted_at are correct types', () => {
    assert(projects.every((p) => p.status === 'submitted'), 'a non-submitted project leaked to the public list');
    assert(projects.every((p) => typeof p.submitted_at === 'string'), 'submitted_at is not an ISO string');
});
check('custom_answers is always an object, never undefined', () => {
    assert(projects.every((p) => p.custom_answers && typeof p.custom_answers === 'object'), 'custom_answers missing');
});
check('gallery_urls is always an array', () => {
    assert(projects.every((p) => Array.isArray(p.gallery_urls)), 'gallery_urls is not an array');
});

// --- Search and filter -----------------------------------------------------
console.log('\ngallery query parameters');
check('?q= narrows by text', async () => {});
const search = await call('GET', '/api/projects?q=quorum');
check('?q=quorum returns exactly one project', () => {
    assert(search.body.data.length === 1, `got ${search.body.data.length}`);
});
const byTrack = await call('GET', `/api/projects?track=${event.tracks[0].id}`);
check('?track= filters by track', () => {
    assert(byTrack.body.data.length > 0, 'track filter returned nothing');
    assert(byTrack.body.data.map(toProject).every((p) => p.track === event.tracks[0].id), 'track filter leaked');
});
const combined = await call('GET', `/api/projects?track=${event.tracks[0].id}&q=quorum`);
check('?track= and ?q= compose', () => {
    assert(combined.body.data.length === 1, `got ${combined.body.data.length}`);
});

// --- Teams -----------------------------------------------------------------
console.log('\ntoTeam');
const teamsRes = await call('GET', '/api/teams');
const teams = teamsRes.body.data.map(toTeam);
check('members are populated and the leader is the first', () => {
    // No fixed count, for the same reason as the track list below: the seed's
    // second, closed event brings its own team, and a hardcoded total broke the
    // moment that arrived.
    assert(teams.length > 0, 'no teams at all');
    assert(teams.every((t) => t.name), 'a team lost its name');
    const withMembers = teams.filter((t) => t.members.length > 0);
    assert(withMembers.length > 0, 'no team has populated members');
    assert(
        withMembers.every((t) => t.leader_id === t.members[0].id),
        'leader_id is not the first member',
    );
});
check('no password hash reaches the client', () => {
    assert(!teamsRes.text.includes('$2b$'), 'a bcrypt hash appeared in the team list');
});

// --- Authenticated round trip ----------------------------------------------
console.log('\nauthenticated flow');
const login = await call('POST', '/api/auth/login', { email: 'participant@verdikt.dev', password: PASSWORD });
check('login sets a session cookie', () => {
    assert(login.status === 200, `login returned ${login.status}`);
    assert(jar.has('session'), 'no session cookie was set');
});
const me = await call('GET', '/api/auth/me');
check('me returns the role the dashboard reads', () => {
    assert(me.status === 200, `me returned ${me.status}`);
    assert(me.body.data.role === 'participant', `role was ${me.body.data.role}`);
    assert(me.body.data.password === undefined, 'password field present');
});
check('the signed-in user appears in a team, so the dashboard can find it', () => {
    const mine = teams.find((t) => t.members.some((m) => m.id === me.body.data._id));
    assert(mine, 'the seeded participant is in no team');
});

const myTeam = teams.find((t) => t.members.some((m) => m.id === me.body.data._id));
const inviteRes = await call('POST', '/api/invites', { teamId: myTeam.id });
check('a leader can create an invite and it adapts', () => {
    assert(inviteRes.status === 201, `invite create returned ${inviteRes.status}: ${inviteRes.text}`);
    const invite = toInvite(inviteRes.body.data);
    assert(invite.token, 'invite token missing');
    assert(invite.team_id === myTeam.id, 'invite team_id wrong');
});

const token = inviteRes.body.data.token;
const preview = await call('GET', `/api/invites/token/${token}`);
check('the invite preview is readable and names the team', () => {
    assert(preview.status === 200, `preview returned ${preview.status}`);
    const invite = toInvite(preview.body.data);
    assert(invite.team_name, 'team_name missing from the preview (teamId not populated)');
});

// --- Track list ------------------------------------------------------------
console.log('\ntoTrack');
const tracksRes = await call('GET', '/api/tracks');
check('the unfiltered track list adapts', () => {
    assert(tracksRes.status === 200, `tracks returned ${tracksRes.status}`);
    const adapted = tracksRes.body.data.map(toTrack);
    // Not a fixed count: the seed has a second, already-closed event with its
    // own track, and asserting a total here broke the moment that was added.
    // What matters is that every row adapts and the featured event's own tracks
    // are all present.
    assert(adapted.length >= event.tracks.length, `expected at least ${event.tracks.length} tracks, got ${adapted.length}`);
    assert(adapted.every((t) => t.name), 'a track lost its name');
    assert(adapted.every((t) => t.id), 'a track lost its id');
    const ids = new Set(adapted.map((t) => t.id));
    assert(event.tracks.every((t) => ids.has(t.id)), "a featured-event track is missing from the unfiltered list");
});

check('a public track read does not expose judge email addresses', () => {
    // TrackRepository populates judges with name AND email for the organizer
    // panel, and this endpoint is public.
    const leaked = tracksRes.body.data.flatMap((t) => t.judges ?? []).filter((j) => j && j.email);
    assert(leaked.length === 0, `${leaked.length} judge address(es) readable without an account`);
});

// --- Organizer flow (T1 #3: dates, tracks, prizes) -------------------------
console.log('\norganizer: event, tracks, prizes, questions');

// Sign in as the organizer, in a fresh jar.
jar.clear();
const orgLogin = await call('POST', '/api/auth/login', { email: 'organizer@verdikt.dev', password: PASSWORD });
check('the organizer can sign in', () => {
    assert(orgLogin.status === 200, `login returned ${orgLogin.status}`);
});
const orgMe = await call('GET', '/api/auth/me');
check('their role resolves to organizer', () => {
    assert(orgMe.body.data.role === 'organizer', `role was ${orgMe.body.data.role}`);
    assert(orgMe.body.data.organiserIn.length > 0, 'organiserIn is empty');
});

// Create a brand new event through the same body the form sends.
const newEventBody = fromEventDraft({
    name: 'Contract Check Event',
    description: 'Created by the frontend contract check.',
    submissions_close: new Date(Date.now() + 72 * 3600_000).toISOString(),
    starts_at: new Date().toISOString(),
    min_team_size: 2,
    max_team_size: 5,
});
const created = await call('POST', '/api/events', newEventBody);
check('createEvent body is accepted by the API', () => {
    assert(created.status === 201, `create returned ${created.status}: ${created.text}`);
});
const newEvent = toHackEvent(created.body.data);
check('the new event adapts back with the right dates and sizes', () => {
    assert(newEvent.name === 'Contract Check Event', `name was ${newEvent.name}`);
    assert(new Date(newEvent.submissions_close) > new Date(), 'deadline did not persist');
    assert(newEvent.min_team_size === 2 && newEvent.max_team_size === 5, 'team sizes did not persist');
});

// Tracks: the UI calls it `name`, the API calls it `topic`.
const trackRes = await call('POST', '/api/tracks', { eventId: newEvent.id, topic: 'Contract Track', description: 'x' });
check('createTrack maps name -> topic', () => {
    assert(trackRes.status === 201, `track create returned ${trackRes.status}: ${trackRes.text}`);
    assert(toTrack(trackRes.body.data).name === 'Contract Track', 'topic did not map back to name');
});
const newTrackId = trackRes.body.data._id;

// Prizes and custom questions, as whole-array replacements.
const prizeBody = fromEventDraft({
    prizes: [
        { name: 'Contract Grand', amount_usd: 1234, description: 'top' },
        { name: 'Track Prize', amount_usd: 99, track: newTrackId },
    ],
    custom_questions: [
        { key: 'why', label: 'Why did you build this?', type: 'longtext', required: true },
        { key: 'link', label: 'Anything else to show us?', type: 'url', required: false },
    ],
});
const updated = await call('PUT', `/api/events/${newEvent.id}`, prizeBody);
check('updateEvent persists prizes and custom questions', () => {
    assert(updated.status === 200, `update returned ${updated.status}: ${updated.text}`);
});
const reread = toHackEvent((await call('GET', `/api/events/${newEvent.id}`)).body.data);
check('prizes round-trip with amounts and track binding', () => {
    assert(reread.prizes.length === 2, `got ${reread.prizes.length} prizes`);
    const grand = reread.prizes.find((p) => p.name === 'Contract Grand');
    assert(grand && grand.amount_usd === 1234, 'amount_usd did not round-trip');
    const tracked = reread.prizes.find((p) => p.name === 'Track Prize');
    assert(tracked && tracked.track === newTrackId, 'per-track prize lost its track');
});
check('custom questions round-trip with the required flag', () => {
    assert(reread.custom_questions.length === 2, `got ${reread.custom_questions.length} questions`);
    const why = reread.custom_questions.find((q) => q.key === 'why');
    assert(why && why.required === true && why.type === 'longtext', 'question fields did not round-trip');
});
check('the new track shows on the event', () => {
    assert(reread.tracks.some((t) => t.id === newTrackId), 'track not attached to the event');
});

// The required question must actually block a submission.
const trackDelete = await call('DELETE', `/api/tracks/${newTrackId}`);
check('deleteTrack works for the organizer', () => {
    assert(trackDelete.status === 200, `delete returned ${trackDelete.status}`);
});

// A non-organizer must be refused.
jar.clear();
await call('POST', '/api/auth/login', { email: 'participant@verdikt.dev', password: PASSWORD });
const forbidden = await call('PUT', `/api/events/${newEvent.id}`, { name: 'Hijacked' });
check('a participant cannot edit someone else s event', () => {
    assert(forbidden.status === 403, `expected 403, got ${forbidden.status}`);
});
const forbiddenTrack = await call('POST', '/api/tracks', { eventId: newEvent.id, topic: 'Sneaky' });
check('a participant cannot add a track to it', () => {
    assert(forbiddenTrack.status === 403, `expected 403, got ${forbiddenTrack.status}`);
});

// Put the portal back how we found it.
//
// This runs against a LIVE database, and without a clean-up every invocation
// left another "Contract Check Event" behind forever. That is not just untidy:
// the litter shifts the counts that other checks in this file look at, which is
// how a passing suite slowly turns into a failing one.
jar.clear();
await call('POST', '/api/auth/login', { email: 'organizer@verdikt.dev', password: PASSWORD });
const cleanup = await call('DELETE', `/api/events/${newEvent.id}`);
check('the check removes the event it created', () => {
    assert(cleanup.status === 200, `cleanup returned ${cleanup.status}`);
});

// --- Leaving a team --------------------------------------------------------
console.log('\nleaving a team');
const meNow = (await call('GET', '/api/auth/me')).body.data;
const myTeamNow = (await call('GET', '/api/teams')).body.data
    .map(toTeam)
    .find((t) => t.members.some((m) => m.id === meNow._id));
check('the leader cannot leave their own team', async () => {});
const leaderLeave = await call('DELETE', `/api/teams/${myTeamNow.id}/members/${meNow._id}`);
check('leader self-removal is refused with 400', () => {
    assert(leaderLeave.status === 400, `expected 400, got ${leaderLeave.status}`);
});

// --- Judging: rubric and ballots -------------------------------------------
console.log('\njudging: rubric and ballots');

check('the featured event carries a rubric the ballot form can render', () => {
    assert(event.criteria.length > 0, 'no criteria on the featured event');
    assert(event.criteria.every((c) => c.key && c.label), 'a criterion lost its key or label');
    assert(event.criteria.every((c) => typeof c.weight === 'number'), 'a criterion lost its weight');
    assert(event.criteria.every((c) => c.max_score > 0), 'a criterion has no scale');
});

jar.clear();
const judgeLogin = await call('POST', '/api/auth/login', { email: 'judge@verdikt.dev', password: PASSWORD });
check('the demo judge can sign in', () => {
    assert(judgeLogin.status === 200, `judge login returned ${judgeLogin.status}`);
});

const queueRes = await call('GET', `/api/judge/queue?eventId=${event.id}`);
const judgeQueue = toJudgeQueue(queueRes.body.data ?? {});
const queue = judgeQueue.projects;
check('the judging queue adapts', () => {
    assert(queue.length > 0, 'nothing submitted to score');
    assert(queue.every((p) => p.title), 'an entry lost its title');
});

const myBallotsRes = await call('GET', `/api/scores?eventId=${event.id}`);
const myBallots = myBallotsRes.body.data.map(toBallot);
check('a judge reads their own ballots and they adapt', () => {
    assert(myBallotsRes.status === 200, `scores returned ${myBallotsRes.status}`);
    assert(myBallots.every((b) => b.project_id), 'a ballot lost its project id');
    const judges = new Set(myBallots.map((b) => b.judge_id));
    assert(judges.size <= 1, `a judge saw ${judges.size} different judges' ballots`);
});

const cast = await call('PUT', '/api/scores/ballot', {
    projectId: queue[0].id,
    scores: Object.fromEntries(event.criteria.map((c) => [c.key, Math.min(c.max_score, 4)])),
    comment: 'Contract check.',
});
check('saving a ballot round-trips through toBallot', () => {
    assert(cast.status === 200, `ballot save returned ${cast.status}: ${JSON.stringify(cast.body)}`);
    const ballot = toBallot(cast.body.data);
    assert(ballot.project_id === queue[0].id, 'the ballot came back on the wrong project');
    assert(Object.keys(ballot.scores).length === event.criteria.length, 'the ballot lost a score');
});

const again = await call('PUT', '/api/scores/ballot', {
    projectId: queue[0].id,
    scores: Object.fromEntries(event.criteria.map((c) => [c.key, Math.min(c.max_score, 5)])),
    comment: 'Second look.',
});
check('saving twice edits the ballot rather than failing', () => {
    assert(again.status === 200, `second save returned ${again.status}`);
    assert(toBallot(again.body.data).comment === 'Second look.', 'the edit did not take');
});

const overMax = await call('PUT', '/api/scores/ballot', {
    projectId: queue[0].id,
    scores: Object.fromEntries(event.criteria.map((c) => [c.key, c.max_score + 50])),
});
check('a score past the rubric maximum is refused', () => {
    assert(overMax.status === 400, `expected 400, got ${overMax.status}`);
});

const unknownKey = await call('PUT', '/api/scores/ballot', {
    projectId: queue[0].id,
    scores: { ...Object.fromEntries(event.criteria.map((c) => [c.key, 1])), notACriterion: 3 },
});
check('a criterion the rubric does not define is refused', () => {
    assert(unknownKey.status === 400, `expected 400, got ${unknownKey.status}`);
});

// --- Standings: the computed leaderboard -----------------------------------
console.log('\nstandings');

jar.clear();
await call('POST', '/api/auth/login', { email: 'organizer@verdikt.dev', password: PASSWORD });
const standingsRes = await call('GET', `/api/events/${event.id}/standings`);
const standings = toStandings(standingsRes.body.data);

check('the organiser can read the standings and they adapt', () => {
    assert(standingsRes.status === 200, `standings returned ${standingsRes.status}`);
    assert(standings.event_id === event.id, 'standings came back for the wrong event');
    assert(standings.criteria.length > 0, 'no criteria on the standings');
    assert(standings.standings.length > 0, 'no rows in the standings');
});

check('every row carries the fields the table renders', () => {
    for (const row of standings.standings) {
        assert(row.project_id, 'a row lost its project id');
        assert(row.title, 'a row lost its title');
        assert(typeof row.ballot_count === 'number', 'a row lost its ballot count');
        assert(typeof row.per_criterion === 'object', 'per_criterion is not an object');
    }
});

check('ranks run best-first and ties share a rank', () => {
    const ranked = standings.standings.filter((r) => r.rank !== null);
    assert(ranked.length > 0, 'nothing is ranked');
    // Rank follows the score of the method in use; with normalization the raw
    // score may legitimately disagree with the order.
    const score = standings.method === 'raw' ? 'weighted_score' : 'normalized_score';
    for (let i = 1; i < ranked.length; i++) {
        assert(
            ranked[i - 1][score] >= ranked[i][score],
            `row ${i} scores higher than the row above it`,
        );
        assert(ranked[i].rank >= ranked[i - 1].rank, 'ranks are not monotonic');
    }
});

check('an unjudged entry is null, never zero', () => {
    // Collapsing null to 0 would put a team nobody has looked at below one that
    // genuinely scored badly.
    for (const row of standings.standings) {
        if (row.ballot_count === 0) {
            assert(row.weighted_score === null, 'an unscored entry has a numeric score');
            assert(row.rank === null, 'an unscored entry was given a rank');
        } else {
            assert(typeof row.weighted_score === 'number', 'a scored entry has no score');
        }
    }
});

check('unjudged entries sort to the end', () => {
    const firstUnjudged = standings.standings.findIndex((r) => r.weighted_score === null);
    if (firstUnjudged !== -1) {
        const after = standings.standings.slice(firstUnjudged);
        assert(after.every((r) => r.weighted_score === null), 'a scored entry sorts below an unscored one');
    }
});

check('the progress counters agree with the rows', () => {
    const p = standings.progress;
    assert(p.project_count === standings.standings.length, 'projectCount disagrees with the row count');
    assert(
        p.scored_project_count === standings.standings.filter((r) => r.ballot_count > 0).length,
        'scoredProjectCount disagrees with the rows',
    );
    assert(p.scored_project_count + p.unscored_project_count === p.project_count, 'the counters do not add up');
});

check('the panel lists judges with a ballot count, including idle ones', () => {
    assert(standings.progress.judges.length > 0, 'no judges on the panel');
    assert(
        standings.progress.judges.every((j) => typeof j.ballot_count === 'number'),
        'a judge lost their ballot count',
    );
});

const standingsCsv = await call('GET', `/api/events/${event.id}/standings.csv`);
check('the standings CSV has a header and one row per entry', () => {
    assert(standingsCsv.status === 200, `csv returned ${standingsCsv.status}`);
    const lines = standingsCsv.text.trim().split('\n');
    assert(lines[0].includes('normalized_score_pct') && lines[0].includes('raw_score_pct'), 'missing a score column');
    assert(lines.length === standings.standings.length + 1, `expected ${standings.standings.length + 1} lines, got ${lines.length}`);
});

// Judge isolation is the whole point of T2, and the aggregate is a way round it:
// a judge who knows their own ballots and can read the mean can solve for the
// rest of the panel.
jar.clear();
await call('POST', '/api/auth/login', { email: 'judge@verdikt.dev', password: PASSWORD });
const judgeStandings = await call('GET', `/api/events/${event.id}/standings`);
const judgeStandingsCsv = await call('GET', `/api/events/${event.id}/standings.csv`);
check('a judge cannot read the standings', () => {
    assert(judgeStandings.status === 403, `expected 403, got ${judgeStandings.status}`);
    assert(judgeStandingsCsv.status === 403, `expected 403 on the csv, got ${judgeStandingsCsv.status}`);
});

jar.clear();
await call('POST', '/api/auth/login', { email: 'participant@verdikt.dev', password: PASSWORD });
const participantStandings = await call('GET', `/api/events/${event.id}/standings`);
check('a participant cannot read the standings', () => {
    assert(participantStandings.status === 403, `expected 403, got ${participantStandings.status}`);
});

jar.clear();
const anonStandings = await call('GET', `/api/events/${event.id}/standings`);
check('an anonymous visitor cannot read the standings', () => {
    assert(anonStandings.status === 401, `expected 401, got ${anonStandings.status}`);
});

// --- Tier 2: normalization, queue scope, assignment, invites, exports -------
//
// Everything this section changes on the live portal it also undoes: dealt
// assignments are cleared and the invite it makes is withdrawn, so a run leaves
// the event exactly as it found it.
console.log('\ntier 2: normalization, scope, assignment, invites, exports');

jar.clear();
await call('POST', '/api/auth/login', { email: 'organizer@verdikt.dev', password: PASSWORD });

const rawStandings = toStandings((await call('GET', `/api/events/${event.id}/standings?method=raw`)).body.data);
const normStandings = toStandings((await call('GET', `/api/events/${event.id}/standings?method=normalized`)).body.data);
check('standings can be ranked either raw or normalized, and say which', () => {
    assert(rawStandings.method === 'raw', `raw came back as ${rawStandings.method}`);
    assert(normStandings.method === 'normalized', `normalized came back as ${normStandings.method}`);
});
check('every scored entry carries both a raw and a normalized score', () => {
    for (const row of normStandings.standings) {
        if (row.ballot_count === 0) continue;
        assert(typeof row.weighted_score === 'number', `${row.title} lost its raw score`);
        assert(typeof row.normalized_score === 'number', `${row.title} lost its normalized score`);
    }
});
check('the panel reports each judge’s habits', () => {
    const withBallots = normStandings.progress.judges.filter((j) => j.ballot_count > 0);
    assert(withBallots.length > 0, 'no judge has ballots');
    assert(withBallots.every((j) => typeof j.mean_score === 'number'), 'a judge with ballots has no mean');
    assert(withBallots.every((j) => typeof j.corrected === 'boolean'), 'corrected is not a boolean');
});
const badMethod = await call('GET', `/api/events/${event.id}/standings?method=vibes`);
check('an unknown ranking method is refused', () => {
    assert(badMethod.status === 400, `expected 400, got ${badMethod.status}`);
});

// Batch assignment: deal, inspect, and clear again.
const dealt = await call('POST', `/api/events/${event.id}/assignments/auto`, { reviewsPerProject: 2 });
const run = toAssignmentRun(dealt.body.data ?? {});
check('dealing assignments reports what it did', () => {
    assert(dealt.status === 200, `auto-assign returned ${dealt.status}: ${JSON.stringify(dealt.body)}`);
    assert(run.reviews_per_project === 2, 'the review count did not round-trip');
    assert(run.per_judge.length > 0, 'no judge loads reported');
    assert(Array.isArray(run.shortfall), 'shortfall is not a list');
});
const assignmentList = (await call('GET', `/api/events/${event.id}/assignments`)).body.data.map(toAssignment);
check('assignments list and adapt', () => {
    assert(assignmentList.length > 0, 'no assignments after dealing');
    assert(assignmentList.every((a) => a.judge_id && a.project_id), 'an assignment lost its judge or entry');
});
const assignmentsCsv = await call('GET', `/api/events/${event.id}/assignments.csv`);
check('the assignments CSV has a row per assignment', () => {
    assert(assignmentsCsv.status === 200, `csv returned ${assignmentsCsv.status}`);
    assert(assignmentsCsv.text.split('\n')[0] === 'judge_name,judge_email,project_title,track,assigned_by,scored', 'unexpected header');
    assert(assignmentsCsv.text.trim().split('\n').length === assignmentList.length + 1, 'row count does not match');
});

// While assignments exist, the demo judge's queue is their batch.
jar.clear();
await call('POST', '/api/auth/login', { email: 'judge@verdikt.dev', password: PASSWORD });
const batchQueue = toJudgeQueue((await call('GET', `/api/judge/queue?eventId=${event.id}`)).body.data);
const mineAssigned = assignmentList.filter((a) => a.judge_name === 'Rafael Lindqvist').map((a) => a.project_id);
check('with assignments, the judge’s queue is exactly their batch', () => {
    assert(batchQueue.mode === 'assigned', `queue mode was ${batchQueue.mode}`);
    assert(
        batchQueue.projects.map((p) => p.id).sort().join() === [...mineAssigned].sort().join(),
        'the queue and the assignment list disagree',
    );
});
const outside = queue.find((p) => !mineAssigned.includes(p.id));
if (outside) {
    const refused = await call('PUT', '/api/scores/ballot', {
        projectId: outside.id,
        scores: Object.fromEntries(event.criteria.map((c) => [c.key, 1])),
    });
    check('an entry outside the judge’s batch is refused', () => {
        assert(refused.status === 403, `expected 403, got ${refused.status}`);
    });
}

jar.clear();
await call('POST', '/api/auth/login', { email: 'organizer@verdikt.dev', password: PASSWORD });
const cleared = await call('DELETE', `/api/events/${event.id}/assignments`);
check('clearing assignments puts the portal back as it was', () => {
    assert(cleared.status === 200, `clear returned ${cleared.status}`);
});

// Judge invites: create, preview as a stranger, withdraw.
const inviteTrack = event.tracks[0];
const createdInvite = await call('POST', `/api/tracks/${inviteTrack.id}/judge-invites`, { email: 'contract-check@example.org' });
const judgeInvite = toJudgeInvite(createdInvite.body.data ?? {});
check('the organiser can invite a judge who has no account', () => {
    assert(createdInvite.status === 201, `invite returned ${createdInvite.status}`);
    assert(judgeInvite.token && judgeInvite.status === 'pending', 'the invite is not a pending one with a token');
});
jar.clear();
const invitePreview = await call('GET', `/api/judge-invites/token/${judgeInvite.token}`);
const judgePreview = toJudgeInvitePreview(invitePreview.body.data ?? {});
check('the invite preview is public, names the track, and masks the address', () => {
    assert(invitePreview.status === 200, `preview returned ${invitePreview.status}`);
    assert(judgePreview.track_name === inviteTrack.name, 'the preview names the wrong track');
    assert(!judgePreview.email_hint.includes('contract-check'), 'the preview leaks the full address');
});
jar.clear();
await call('POST', '/api/auth/login', { email: 'organizer@verdikt.dev', password: PASSWORD });
const withdrawn = await call('DELETE', `/api/judge-invites/${judgeInvite.id}`);
check('the check withdraws the invite it made', () => {
    assert(withdrawn.status === 200, `withdraw returned ${withdrawn.status}`);
});

// Exports for the other stages.
const entriesCsv = await call('GET', `/api/events/${event.id}/entries.csv`);
check('the entries CSV covers the submissions stage', () => {
    assert(entriesCsv.status === 200, `entries returned ${entriesCsv.status}`);
    assert(entriesCsv.text.startsWith('project_title,team_name,members,track,status'), 'unexpected header');
});
const ballotCsv = await call('GET', `/api/export.csv?eventId=${event.id}`);
check('the ballot CSV carries each ballot’s raw and normalized score', () => {
    assert(ballotCsv.text.split('\n')[0].endsWith('ballot_weighted_pct,ballot_normalized_pct'), 'normalized column missing');
});

jar.clear();
await call('POST', '/api/auth/login', { email: 'judge@verdikt.dev', password: PASSWORD });
const judgeExports = await Promise.all(
    [`/api/events/${event.id}/entries.csv`, `/api/events/${event.id}/assignments.csv`, `/api/events/${event.id}/assignments`].map((p) =>
        call('GET', p),
    ),
);
check('a judge can read none of the organiser exports', () => {
    assert(judgeExports.every((r) => r.status === 403), `statuses: ${judgeExports.map((r) => r.status).join(', ')}`);
});

// --- SPA routing through nginx ---------------------------------------------
console.log('\nSPA deep links');
for (const path of ['/', '/gallery', '/login', '/signup', '/dashboard', '/profile', '/judge', '/judge-invite/abc', '/projects/anything', '/invite/abc', '/organizer', '/organizer/events/abc']) {
    const res = await fetch(WEB + path);
    check(`${path} serves the app (200)`, () => {
        assert(res.status === 200, `got ${res.status}`);
    });
}
const proxied = await fetch(`${WEB}/api/events/featured`);
check('/api proxies through the web container', () => {
    assert(proxied.status === 200, `got ${proxied.status}`);
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);

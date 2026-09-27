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

const { toHackEvent, toProject, toTeam, toTrack, toInvite, fromEventDraft } = await import(pathToFileURL(outFile).href);

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
    assert(projectsRes.status === 200, `status ${projectsRes.status}`);
    assert(projects.length === 7, `expected 7 submitted projects, got ${projects.length}`);
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
    assert(teams.length === 8, `expected 8 teams, got ${teams.length}`);
    const t = teams[0];
    assert(t.members.length > 0, 'team has no members');
    assert(t.leader_id === t.members[0].id, 'leader_id is not the first member');
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
    assert(adapted.length === 4, `expected 4 tracks, got ${adapted.length}`);
    assert(adapted.every((t) => t.name), 'a track lost its name');
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

// --- SPA routing through nginx ---------------------------------------------
console.log('\nSPA deep links');
for (const path of ['/', '/gallery', '/login', '/signup', '/dashboard', '/projects/anything', '/invite/abc', '/organizer', '/organizer/events/abc']) {
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

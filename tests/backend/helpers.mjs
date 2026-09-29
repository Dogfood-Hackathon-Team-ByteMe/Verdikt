/**
 * Fixture builders shared by the T1 test suites.
 *
 * Everything goes over HTTP where an endpoint exists. Role promotion (making
 * someone an admin or a judge) has no endpoint by design, so those touch the
 * models directly -- the same thing the seed script does.
 */
import mongoose from 'mongoose';
import { createClient } from './harness.mjs';

export const PASSWORD = 'correct-horse-battery';

/** Register a fresh user and return their signed-in client plus their record. */
export async function registerUser(email, name = email.split('@')[0]) {
    const client = createClient();
    const res = await client.post('/api/auth/register', { email, password: PASSWORD, name });
    if (res.status !== 201) throw new Error(`registerUser(${email}) failed: ${res.status} ${res.text}`);
    return { client, user: res.body.data, id: res.body.data._id };
}

/** Promote a user to admin. No HTTP route exists for this on purpose. */
export async function makeAdmin(userId) {
    await mongoose.model('User').findByIdAndUpdate(userId, { isAdmin: true });
}

/**
 * A future date, for an event whose submissions are still open.
 * `hours` ahead of now.
 */
export const future = (hours = 48) => new Date(Date.now() + hours * 3600_000).toISOString();

/**
 * Create an event with the given organizer client.
 *
 * createEvent validates that submissionsClose is in the future, so a closed
 * event cannot be made through the API. Tests that need one call closeEvent().
 */
export async function createEvent(organizerClient, overrides = {}) {
    const res = await organizerClient.post('/api/events', {
        name: 'DOGFOOD 2026',
        description: 'Build the platform that will judge you.',
        submissionsClose: future(48),
        startsAt: new Date().toISOString(),
        minTeamSize: 1,
        maxTeamSize: 4,
        ...overrides,
    });
    if (res.status !== 201) throw new Error(`createEvent failed: ${res.status} ${res.text}`);
    return res.body.data;
}

/**
 * Force an event's deadline into the past.
 *
 * Done at the model layer deliberately: the API refuses to set a past
 * submissionsClose, and we need to test what happens after one passes.
 */
export async function closeEvent(eventId) {
    await mongoose.model('Event').findByIdAndUpdate(eventId, {
        submissionsClose: new Date(Date.now() - 60_000),
    });
}

/** Create a track on an event, as the organizer. */
export async function createTrack(organizerClient, eventId, topic = 'Judging Engines') {
    const res = await organizerClient.post('/api/tracks', { topic, eventId, description: `${topic} track` });
    if (res.status !== 201) throw new Error(`createTrack failed: ${res.status} ${res.text}`);
    return res.body.data;
}

/** Create a team; the creating client becomes its leader. */
export async function createTeam(client, eventId, name = 'Null Island') {
    const res = await client.post('/api/teams', { name, eventId, description: 'A team' });
    if (res.status !== 201) throw new Error(`createTeam failed: ${res.status} ${res.text}`);
    return res.body.data;
}

/** Register a user as a judge on an event and one of its tracks. */
export async function makeJudge(userId, eventId, trackId) {
    await mongoose.model('Event').findByIdAndUpdate(eventId, { $addToSet: { judgeIds: userId } });
    await mongoose.model('User').findByIdAndUpdate(userId, { $addToSet: { judgeIn: trackId } });
    if (trackId) await mongoose.model('Track').findByIdAndUpdate(trackId, { $addToSet: { judges: userId } });
}

/**
 * The whole happy path in one call: organizer, event, track, participant,
 * team, and a draft project. Returns every handle a test might need.
 */
export async function seedScenario() {
    const organizer = await registerUser('organizer@verdikt.dev', 'Mira');
    const event = await createEvent(organizer.client);
    const track = await createTrack(organizer.client, event._id);

    const participant = await registerUser('ada@verdikt.dev', 'Ada');
    const team = await createTeam(participant.client, event._id);

    const projectRes = await participant.client.post('/api/projects', {
        title: 'Quorum',
        tagline: 'Pairwise judging with a replayable audit log',
        summary: 'Bradley-Terry ranking over pairwise comparisons.',
        repoUrl: 'https://github.com/example/quorum',
        trackId: track._id,
        teamId: team._id,
        techTags: ['Go', 'Postgres'],
    });
    if (projectRes.status !== 201) throw new Error(`seed project failed: ${projectRes.status} ${projectRes.text}`);

    return { organizer, event, track, participant, team, project: projectRes.body.data };
}

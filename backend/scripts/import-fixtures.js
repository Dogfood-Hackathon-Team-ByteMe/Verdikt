/**
 * Load the DOGFOOD fixtures.json into the portal.
 *
 *   npm run import-fixtures            # ../fixtures.json
 *   npm run import-fixtures -- path/to/fixtures.json
 *
 * The graders' run.py checks that projects from fixtures.json show up in the
 * public gallery and that the fixture event -- whose deadline is in the past --
 * refuses new submissions. Both need the fixture data actually in the
 * database, so this maps it onto the real models and writes it through them.
 *
 * It ADDS an event rather than replacing anything: the seeded DOGFOOD 2026
 * stays exactly as it was, which is the point of roles being per event. Re-runs
 * are idempotent -- the fixture event and everything hanging off it are removed
 * first, so importing twice does not double the gallery.
 *
 * Fixture accounts get the same demo password as the seed, so the checker can
 * sign in as a participant, two judges and the organizer.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

import User from '../models/User.js';
import Event from '../models/Event.js';
import Track from '../models/Track.js';
import Team from '../models/Team.js';
import Project from '../models/Project.js';
import Score from '../models/Score.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dogfood';
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'dogfood2026';

/** The organiser of the fixture event. Nothing in fixtures.json names one. */
const ORGANISER_EMAIL = 'organizer@sample.example.org';

const resolveFixturePath = () => {
    const explicit = process.argv[2];
    const candidates = explicit
        ? [explicit]
        : [path.join(HERE, '..', '..', 'fixtures.json'), path.join(process.cwd(), 'fixtures.json')];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(`fixtures.json not found (looked in: ${candidates.join(', ')})`);
};

async function main() {
    const fixturePath = resolveFixturePath();
    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    await mongoose.connect(MONGO_URI);
    console.log(`Connected to ${MONGO_URI}`);
    console.log(`Reading ${fixturePath}`);

    const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // --- Clear a previous import ------------------------------------------
    const previous = await Event.findOne({ name: data.event.name });
    if (previous) {
        const staleTeams = await Team.find({ eventId: previous._id }).select('_id');
        await Promise.all([
            Project.deleteMany({ eventId: previous._id }),
            Score.deleteMany({ eventId: previous._id }),
            Team.deleteMany({ eventId: previous._id }),
            Track.deleteMany({ eventId: previous._id }),
            User.updateMany({}, { $pull: { participatingIn: previous._id, organiserIn: previous._id } }),
        ]);
        await Event.deleteOne({ _id: previous._id });
        console.log(`Removed a previous import (${staleTeams.length} teams)`);
    }

    // --- People ------------------------------------------------------------
    // Judges are named in fixtures.json; team members appear only as email
    // addresses on their team, so they are created from those.
    const memberEmails = [...new Set((data.teams ?? []).flatMap((t) => t.members ?? []))];
    const judgeEmails = (data.judges ?? []).map((j) => j.email);
    const everyEmail = [...new Set([ORGANISER_EMAIL, ...judgeEmails, ...memberEmails])];

    const nameFor = new Map((data.judges ?? []).map((j) => [j.email, j.name]));
    const existing = await User.find({ email: { $in: everyEmail } }).select('email');
    const known = new Set(existing.map((u) => u.email));

    const toCreate = everyEmail
        .filter((email) => !known.has(email))
        .map((email) => ({
            email,
            name: nameFor.get(email) ?? email.split('@')[0],
            password: hash,
            participatingIn: [],
            judgeIn: [],
            organiserIn: [],
            isAdmin: false,
        }));
    if (toCreate.length) await User.insertMany(toCreate);

    const users = await User.find({ email: { $in: everyEmail } });
    const userByEmail = new Map(users.map((u) => [u.email, u]));
    console.log(`Users: ${toCreate.length} created, ${everyEmail.length - toCreate.length} already present`);

    const organiser = userByEmail.get(ORGANISER_EMAIL);

    // --- Event and tracks --------------------------------------------------
    // submissions_close is in the past, which is the whole point: this is the
    // event that proves a closed deadline is enforced rather than described.
    const event = await Event.create({
        name: data.event.name,
        tagline: 'Imported from fixtures.json.',
        description: 'The DOGFOOD sample dataset, loaded into the portal.',
        organiserId: organiser._id,
        startsAt: new Date(Date.parse(data.event.submissions_close) - 48 * 3600_000),
        submissionsClose: new Date(data.event.submissions_close),
        minTeamSize: 1,
        maxTeamSize: 6,
        isFeatured: false,
        prizes: [],
        customQuestions: [],
    });
    await User.findByIdAndUpdate(organiser._id, { $addToSet: { organiserIn: event._id } });

    const tracks = await Track.insertMany(
        (data.tracks ?? []).map((t) => ({ topic: t.name, description: t.name, eventId: event._id, judges: [] })),
    );
    const trackByFixtureId = new Map((data.tracks ?? []).map((t, i) => [t.id, tracks[i]]));
    event.tracks = tracks.map((t) => t._id);

    // --- Judges ------------------------------------------------------------
    const judgeByFixtureId = new Map();
    for (const judge of data.judges ?? []) {
        const user = userByEmail.get(judge.email);
        judgeByFixtureId.set(judge.id, user);
        const trackIds = (judge.tracks ?? []).map((t) => trackByFixtureId.get(t)?._id).filter(Boolean);
        await User.findByIdAndUpdate(user._id, { $addToSet: { judgeIn: { $each: trackIds } } });
        await Track.updateMany({ _id: { $in: trackIds } }, { $addToSet: { judges: user._id } });
    }
    event.judgeIds = (data.judges ?? []).map((j) => judgeByFixtureId.get(j.id)._id);
    await event.save();
    console.log(`Event "${event.name}" (closed ${event.submissionsClose.toISOString()}), ${tracks.length} tracks, ${event.judgeIds.length} judges`);

    // --- Teams -------------------------------------------------------------
    const teamByFixtureId = new Map();
    for (const team of data.teams ?? []) {
        const members = (team.members ?? []).map((email) => userByEmail.get(email)).filter(Boolean);
        const created = await Team.create({
            name: team.name,
            description: `Imported team ${team.id}.`,
            eventId: event._id,
            members: members.map((m) => m._id),
            hasMinimumMembers: members.length >= event.minTeamSize,
        });
        teamByFixtureId.set(team.id, created);
        await User.updateMany(
            { _id: { $in: members.map((m) => m._id) } },
            { $addToSet: { participatingIn: event._id } },
        );
    }

    // --- Projects ----------------------------------------------------------
    const projectByFixtureId = new Map();
    for (const project of data.projects ?? []) {
        const team = teamByFixtureId.get(project.team);
        const track = trackByFixtureId.get(project.track);
        const created = await Project.create({
            title: project.title,
            tagline: project.summary,
            summary: project.summary,
            description: project.summary,
            repoUrl: project.repo_url,
            codeRepoLink: project.repo_url,
            techTags: [],
            teamId: team?._id,
            trackId: track?._id,
            eventId: event._id,
            // Every fixture project carries a submitted_at, so they are all
            // public entries -- which is what the gallery check looks for.
            status: project.submitted_at ? 'submitted' : 'draft',
            submittedAt: project.submitted_at ? new Date(project.submitted_at) : undefined,
        });
        projectByFixtureId.set(project.id, created);
        if (team) await Team.findByIdAndUpdate(team._id, { projectId: created._id });
    }
    console.log(`Teams: ${teamByFixtureId.size}, projects: ${projectByFixtureId.size}`);

    // --- Ballots -----------------------------------------------------------
    // One ballot per judge per project is a unique index, so duplicates in the
    // fixture are collapsed rather than allowed to blow up the insert.
    const seen = new Set();
    const ballots = [];
    for (const score of data.scores ?? []) {
        const judge = judgeByFixtureId.get(score.judge);
        const project = projectByFixtureId.get(score.project);
        if (!judge || !project) continue;
        const key = `${judge._id}:${project._id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ballots.push({
            judgeId: judge._id,
            eventId: event._id,
            projectId: project._id,
            scores: new Map(Object.entries(score.criteria ?? {})),
            comment: score.comment ?? '',
        });
    }
    if (ballots.length) await Score.insertMany(ballots);
    console.log(`Ballots: ${ballots.length}`);

    // --- What the checker needs -------------------------------------------
    const sampleTeam = teamByFixtureId.get(data.teams?.[0]?.id);
    const sampleMember = await User.findById(sampleTeam?.members?.[0]);
    const judgeA = judgeByFixtureId.get(data.judges?.[0]?.id);
    const judgeB = judgeByFixtureId.get(data.judges?.[1]?.id);
    const sampleProject = projectByFixtureId.get(data.projects?.[0]?.id);

    console.log('\nImport complete. For .dogfood.toml:');
    console.log(`  event id        ${event._id}`);
    console.log(`  closed project  ${sampleProject?._id}   (${sampleProject?.title})`);
    console.log(`  organizer       ${ORGANISER_EMAIL}`);
    console.log(`  participant     ${sampleMember?.email}`);
    console.log(`  judge_a         ${judgeA?.email}`);
    console.log(`  judge_b         ${judgeB?.email}`);
    console.log(`  password        ${DEMO_PASSWORD}`);
    console.log('\nRun `npm run dogfood-config` to write these into .dogfood.toml with fresh session cookies.');

    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('Import failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});

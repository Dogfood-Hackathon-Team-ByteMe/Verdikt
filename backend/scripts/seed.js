/**
 * Seed a working DOGFOOD-style portal.
 *
 * T1's acceptance criterion is that `docker compose up` produces a *seeded*,
 * working portal, so this runs automatically on container start (see
 * docker-compose.yml) and can be run by hand with `npm run seed`.
 *
 * Idempotent: it wipes the collections it owns first, so re-running gives the
 * same state rather than piling up duplicates. Pass --force to run against a
 * database that already has data outside those collections.
 *
 * Every account uses the same password so the demo is easy to drive; that is
 * fine for seed data and obviously not fine for anything real.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

import User from '../models/User.js';
import Event from '../models/Event.js';
import Track from '../models/Track.js';
import Team from '../models/Team.js';
import Project from '../models/Project.js';
import Score from '../models/Score.js';
import Session from '../models/Session.js';
import Invite from '../models/Invite.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dogfood';
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'dogfood2026';

const hours = (n) => n * 3600_000;

/** One bcrypt hash reused across seed accounts; hashing 12 times is slow. */
let sharedHash;

const makeUser = (email, name, extra = {}) => ({
    email,
    name,
    password: sharedHash,
    participatingIn: [],
    judgeIn: [],
    organiserIn: [],
    isAdmin: false,
    ...extra,
});

const TRACKS = [
    ['Judging Engines', 'Ranking, normalization and audit trails.'],
    ['Developer Tools', 'Things that make building faster.'],
    ['Infrastructure', 'Run it anywhere, reproducibly.'],
    ['Security', 'Abuse resistance and verifiable claims.'],
];

/** title, tagline, summary, tech tags, track index, submitted? */
const PROJECTS = [
    ['Quorum', 'Pairwise judging with a replayable audit log', 'Bradley-Terry ranking over pairwise comparisons, with every comparison replayable.', ['Go', 'Postgres'], 0, true],
    ['Blindfold', 'Disjoint judge batches, enforced in the database', 'Assigns judges so nobody ever sees a peer ballot.', ['Rails', 'Postgres'], 0, true],
    ['Diffscope', 'Reviews PRs by blast radius, not line count', 'Ranks review urgency by what a change can break.', ['Rust', 'CLI'], 1, true],
    ['Seedling', 'Fixture data with the edge cases your tests forgot', 'Generates realistic fixtures from a schema.', ['Python'], 1, true],
    ['Kettle', 'A full staging stack from one compose file', 'Boots seeded infrastructure with no cloud account.', ['Docker', 'Nix'], 2, true],
    ['Offline First', 'Proves an app runs with the cable pulled', 'Fails the build when a hidden network call sneaks in.', ['Bash', 'Docker'], 2, true],
    ['Tripwire', 'Rate limits and a tamper-evident audit trail', 'Duplicate detection for public voting.', ['Python', 'Redis'], 3, true],
    ['Signet', 'Publicly verifiable proof a judge reviewed a project', 'Ed25519 receipts for every completed ballot.', ['Rust', 'Ed25519'], 3, false],
];

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log(`Connected to ${MONGO_URI}`);

    // docker-compose runs this on every `up`, but the Mongo volume persists.
    // Re-seeding by default would silently delete work someone did in the
    // portal between restarts, so an already-populated database is left alone
    // unless SEED_FORCE is set.
    const force = process.env.SEED_FORCE === 'true' || process.argv.includes('--force');
    const existingUsers = await User.estimatedDocumentCount();
    if (existingUsers > 0 && !force) {
        console.log(`Database already has ${existingUsers} users; leaving it alone.`);
        console.log('Re-seed from scratch with SEED_FORCE=true (this deletes everything).');
        await mongoose.disconnect();
        return;
    }

    // Clear the collections this script owns, so re-seeding is repeatable.
    await Promise.all([
        User.deleteMany({}), Event.deleteMany({}), Track.deleteMany({}),
        Team.deleteMany({}), Project.deleteMany({}), Score.deleteMany({}),
        Session.deleteMany({}), Invite.deleteMany({}),
    ]);
    console.log('Cleared existing data');

    sharedHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // --- People -----------------------------------------------------------
    const admin = await User.create(makeUser('admin@verdikt.dev', 'Root Admin', { isAdmin: true }));
    const organizer = await User.create(makeUser('organizer@verdikt.dev', 'Mira Devarajan'));
    const judges = await User.insertMany([
        makeUser('judge@verdikt.dev', 'Rafael Lindqvist'),
        makeUser('judge2@verdikt.dev', 'Nkechi Bello'),
        makeUser('judge3@verdikt.dev', 'Tomas Havel'),
    ]);

    // Sixteen participants: two per project team.
    const participants = await User.insertMany(
        PROJECTS.flatMap((p, i) => [
            makeUser(`participant${i * 2 + 1}@verdikt.dev`, `${p[0]} Lead`),
            makeUser(`participant${i * 2 + 2}@verdikt.dev`, `${p[0]} Second`),
        ]),
    );
    // The account the docs point people at.
    const ada = participants[0];
    ada.email = 'participant@verdikt.dev';
    ada.name = 'Ada Okafor';
    await ada.save();

    console.log(`Created ${2 + judges.length + participants.length} users`);

    // --- Event ------------------------------------------------------------
    const event = await Event.create({
        name: 'DOGFOOD 2026',
        tagline: 'Build the platform that will judge you.',
        description: 'Build a hackathon hosting and judging platform. The platform you build is the platform you are judged on.',
        organiserId: organizer._id,
        judgeIds: judges.map((j) => j._id),
        // Open for another two days, so the deadline demo is live rather than
        // already expired whenever someone runs this.
        startsAt: new Date(Date.now() - hours(24)),
        submissionsClose: new Date(Date.now() + hours(48)),
        minTeamSize: 1,
        maxTeamSize: 4,
        isJudgeApplyOpen: true,
        isFeatured: true,
        eventTags: ['open-source', 'judging', 'self-hosted'],
        prizes: [
            { name: 'Grand Prize', amountUsd: 800, description: 'Best overall submission' },
            { name: 'Runner-Up', amountUsd: 500 },
            { name: 'Third Place', amountUsd: 350 },
            { name: 'Fourth Place', amountUsd: 200 },
            { name: 'Fifth Place', amountUsd: 150 },
        ],
        customQuestions: [
            { key: 'whatsHard', label: 'What was the hardest part?', type: 'longtext', required: true },
            { key: 'nextStep', label: 'What would you build next?', type: 'longtext', required: false },
        ],
        // Keys match the seeded ballots below, so the judging screen opens on
        // real scores rather than on criteria nothing has been scored against.
        criteria: [
            { key: 'technical', label: 'Technical depth', description: 'How much is actually built, and how well?', weight: 3, maxScore: 10 },
            { key: 'originality', label: 'Originality', description: 'Has this been done already?', weight: 2, maxScore: 10 },
            { key: 'completeness', label: 'Completeness', description: 'Does it hold together end to end?', weight: 2, maxScore: 10 },
        ],
    });

    const tracks = await Track.insertMany(
        TRACKS.map(([topic, description]) => ({ topic, description, eventId: event._id, judges: [] })),
    );
    event.tracks = tracks.map((t) => t._id);
    // One prize tied to a specific track, to exercise per-track prizes.
    event.prizes.push({ name: 'Best Judging Engine', amountUsd: 100, trackId: tracks[0]._id });
    await event.save();

    // The panel. Every track gets two judges, and the tracks overlap so the
    // three judges are all connected through shared entries -- which is what
    // lets cross-judge normalization compare all of them (see JUDGING.md).
    // Judging Engines, Developer Tools, Infrastructure, Security:
    const PANEL = [
        [0, [0, 2, 3]], // Rafael: Judging Engines, Infrastructure, Security
        [1, [0, 1]],    // Nkechi: Judging Engines, Developer Tools
        [2, [1, 2, 3]], // Tomas:  Developer Tools, Infrastructure, Security
    ];
    for (const [j, trackIdxs] of PANEL) {
        for (const t of trackIdxs) {
            await Track.findByIdAndUpdate(tracks[t]._id, { $addToSet: { judges: judges[j]._id } });
            await User.findByIdAndUpdate(judges[j]._id, { $addToSet: { judgeIn: tracks[t]._id } });
        }
    }

    await User.findByIdAndUpdate(organizer._id, { $addToSet: { organiserIn: event._id } });
    console.log(`Created event "${event.name}" with ${tracks.length} tracks and ${event.prizes.length} prizes`);

    // --- Teams and projects ----------------------------------------------
    let submitted = 0;
    for (const [i, [title, tagline, summary, techTags, trackIdx, isSubmitted]] of PROJECTS.entries()) {
        const members = [participants[i * 2], participants[i * 2 + 1]];

        const team = await Team.create({
            name: `${title} Team`,
            description: `The team behind ${title}.`,
            eventId: event._id,
            members: members.map((m) => m._id),
            hasMinimumMembers: true,
        });

        await User.updateMany(
            { _id: { $in: members.map((m) => m._id) } },
            { $addToSet: { participatingIn: event._id } },
        );

        const project = await Project.create({
            title,
            tagline,
            summary,
            description: `${summary}\n\nBuilt during DOGFOOD 2026 as a demonstration of the ${TRACKS[trackIdx][0]} track.`,
            repoUrl: `https://github.com/example/${title.toLowerCase().replace(/\s+/g, '-')}`,
            codeRepoLink: `https://github.com/example/${title.toLowerCase().replace(/\s+/g, '-')}`,
            liveUrl: `https://${title.toLowerCase().replace(/\s+/g, '-')}.example.com`,
            demoVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            techTags,
            teamId: team._id,
            trackId: tracks[trackIdx]._id,
            eventId: event._id,
            customAnswers: new Map([
                ['whatsHard', 'Getting cross-judge normalization to be explainable rather than just correct.'],
                ['nextStep', 'Pairwise mode, and an audit log a judge can actually read.'],
            ]),
            // Stagger the timestamps so the gallery's "newest first" ordering
            // is visible rather than arbitrary.
            status: isSubmitted ? 'submitted' : 'draft',
            submittedAt: isSubmitted ? new Date(Date.now() - hours(i + 1)) : undefined,
        });

        await Team.findByIdAndUpdate(team._id, { projectId: project._id });
        if (isSubmitted) submitted++;
    }
    console.log(`Created ${PROJECTS.length} teams and projects (${submitted} submitted, ${PROJECTS.length - submitted} draft)`);

    // --- Judging, half done -------------------------------------------------
    //
    // Deterministic ballots with deliberately different judge habits, so the
    // leaderboard shows normalization doing something: Rafael scores
    // generously, Tomas harshly, Nkechi in between. Kettle has only been seen by
    // generous Rafael and Offline First only by harsh Tomas, so their RAW scores
    // are mostly a verdict on who happened to judge them. Tripwire has no
    // ballots yet, so the dashboard has an unscored entry to flag.
    //
    // Every ballot is inside the judge's own tracks, like the API would insist.
    const QUALITY = { Quorum: 8, Blindfold: 6, Diffscope: 7, Seedling: 5, Kettle: 8, 'Offline First': 7 };
    const HABIT = [1.5, 0, -2]; // Rafael, Nkechi, Tomas
    const WHO = {
        Quorum: [0, 1],
        Blindfold: [0, 1],
        Diffscope: [1, 2],
        Seedling: [1, 2],
        Kettle: [0],
        'Offline First': [2],
    };
    const clampScore = (x) => Math.min(10, Math.max(1, Math.round(x)));

    const byTitle = new Map((await Project.find({ eventId: event._id, status: 'submitted' })).map((p) => [p.title, p]));
    const ballots = [];
    for (const [title, judgeIdxs] of Object.entries(WHO)) {
        const project = byTitle.get(title);
        if (!project) continue;
        for (const j of judgeIdxs) {
            const base = QUALITY[title] + HABIT[j];
            ballots.push({
                judgeId: judges[j]._id,
                eventId: event._id,
                projectId: project._id,
                scores: new Map([
                    ['technical', clampScore(base)],
                    ['originality', clampScore(base - 0.5)],
                    ['completeness', clampScore(base + 0.5)],
                ]),
                comment: j === 2
                    ? 'Works, but I expected more polish for the scope.'
                    : 'Solid work. The audit trail is the strongest part.',
            });
        }
    }
    await Score.insertMany(ballots);
    console.log(`Created ${ballots.length} scores`);

    // --- A second, already-closed event -----------------------------------
    //
    // Two things need this to exist.
    //
    // Roles are per event, not global, and the only way to show that is to
    // have more than one event: the organiser of DOGFOOD 2026 enters a team
    // here as an ordinary competitor, and a competitor from DOGFOOD 2026 runs
    // this one. Neither may take part in the event they run.
    //
    // It is also the only event with a deadline in the past, which is what
    // makes "a closed event refuses submissions" demonstrable rather than
    // asserted. Its project stays a DRAFT so the public gallery still returns
    // exactly the seven submitted entries of the featured event.
    const pastOrganiser = participants[4]; // Diffscope Lead, a competitor above
    const closedEvent = await Event.create({
        name: 'Verdikt Autumn Sprint',
        tagline: 'A weekend build, already wrapped up.',
        description: 'A finished event, kept around so closed-deadline behaviour is visible.',
        organiserId: pastOrganiser._id,
        judgeIds: [judges[1]._id],
        startsAt: new Date(Date.now() - hours(96)),
        submissionsClose: new Date(Date.now() - hours(24)), // shut yesterday
        minTeamSize: 1,
        maxTeamSize: 4,
        isFeatured: false,
        prizes: [{ name: 'Winner', amountUsd: 250 }],
        customQuestions: [],
        criteria: [
            { key: 'technical', label: 'Technical depth', weight: 3, maxScore: 10 },
            { key: 'originality', label: 'Originality', weight: 2, maxScore: 10 },
            { key: 'completeness', label: 'Completeness', weight: 2, maxScore: 10 },
        ],
    });

    const closedTrack = await Track.create({
        topic: 'Weekend Builds',
        description: 'Anything finished in 48 hours.',
        eventId: closedEvent._id,
        judges: [judges[1]._id],
    });
    closedEvent.tracks = [closedTrack._id];
    await closedEvent.save();

    await User.findByIdAndUpdate(pastOrganiser._id, { $addToSet: { organiserIn: closedEvent._id } });
    await User.findByIdAndUpdate(judges[1]._id, { $addToSet: { judgeIn: closedTrack._id } });

    // The organiser of DOGFOOD 2026 competing in somebody else's event.
    const lateTeam = await Team.create({
        name: 'Late Entry',
        description: 'Ran out of clock.',
        eventId: closedEvent._id,
        members: [organizer._id],
        hasMinimumMembers: true,
    });
    await User.findByIdAndUpdate(organizer._id, { $addToSet: { participatingIn: closedEvent._id } });

    const lateProject = await Project.create({
        title: 'Late Entry',
        tagline: 'Never made it past the deadline',
        summary: 'A draft left behind when the window shut.',
        repoUrl: 'https://github.com/example/late-entry',
        codeRepoLink: 'https://github.com/example/late-entry',
        techTags: ['TypeScript'],
        teamId: lateTeam._id,
        trackId: closedTrack._id,
        eventId: closedEvent._id,
        status: 'draft',
    });
    await Team.findByIdAndUpdate(lateTeam._id, { projectId: lateProject._id });

    console.log(`Created closed event "${closedEvent.name}" (organiser ${pastOrganiser.email})`);
    console.log(`  ${organizer.email} organises DOGFOOD 2026 and competes here -- roles are per event`);

    console.log('\nSeed complete. Sign in with any of:');
    console.log(`  admin@verdikt.dev        (admin)       / ${DEMO_PASSWORD}`);
    console.log(`  organizer@verdikt.dev    (organizer)   / ${DEMO_PASSWORD}`);
    console.log(`  judge@verdikt.dev        (judge)       / ${DEMO_PASSWORD}`);
    console.log(`  participant@verdikt.dev  (participant) / ${DEMO_PASSWORD}`);

    await mongoose.disconnect();
}

seed().catch(async (error) => {
    console.error('Seed failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});

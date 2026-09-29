/**
 * Write the [portal], [auth] and [routes] sections run.py reads.
 *
 *   npm run dogfood-config
 *
 * run.py authenticates by sending a literal header string, and this portal
 * authenticates with an httpOnly session cookie, so the header is
 * `Cookie: session=<token>`. Sessions carry a 24-hour TTL, so the values this
 * writes go stale -- re-run it before a grading pass.
 *
 * Sessions are minted straight into Mongo rather than over HTTP, so this works
 * whether or not the API container is up.
 *
 * Everything else it needs -- which project is in the closed event, which
 * account is a plain participant -- is read from the imported fixture event,
 * so `npm run import-fixtures` has to have run first.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import User from '../models/User.js';
import Event from '../models/Event.js';
import Team from '../models/Team.js';
import Project from '../models/Project.js';
import Session from '../models/Session.js';
import { resolveRole } from '../utils/sanitize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dogfood';
const TOML_PATH = process.argv[2] || path.join(HERE, '..', '..', '..', '.dogfood.toml');
const BASE_URL = process.env.DOGFOOD_BASE_URL || 'http://localhost:8080';
const FIXTURE_EVENT = process.env.DOGFOOD_FIXTURE_EVENT || 'Sample Hack 2026';

/** A real session row, so the cookie behaves exactly like a signed-in one. */
const mintCookie = async (user) => {
    const token = crypto.randomBytes(32).toString('hex');
    await Session.create({ token, userId: user._id, role: resolveRole(user) });
    return `Cookie: session=${token}`;
};

/**
 * Replace a [section] in the TOML, or append it if it is not there yet.
 *
 * `\r?` throughout: .dogfood.toml is edited on Windows and arrives with CRLF,
 * and an `\n`-only pattern silently matches nothing -- which appends a second
 * copy of the section and makes the file fail to parse.
 */
const upsertSection = (toml, name, body) => {
    const block = `[${name}]\n${body.trimEnd()}\n`;
    const pattern = new RegExp(`^\\[${name}\\]\\r?\\n(?:(?!^\\[)[\\s\\S])*`, 'm');
    return pattern.test(toml) ? toml.replace(pattern, block) : `${toml.trimEnd()}\n\n${block}`;
};

async function main() {
    await mongoose.connect(MONGO_URI);

    const event = await Event.findOne({ name: FIXTURE_EVENT });
    if (!event) {
        throw new Error(`No event named "${FIXTURE_EVENT}". Run: npm run import-fixtures`);
    }

    const project = await Project.findOne({ eventId: event._id }).sort({ title: 1 });
    if (!project) throw new Error('The fixture event has no projects; re-run the import.');

    const organiser = await User.findById(event.organiserId);
    const judgeA = await User.findById(event.judgeIds[0]);
    const judgeB = await User.findById(event.judgeIds[1]);

    // A participant who is a member of the project's own team: the submit
    // probe has to be refused for the DEADLINE, not for lack of membership,
    // or the check passes for the wrong reason.
    const team = await Team.findById(project.teamId);
    const participant = await User.findById(team.members[0]);

    const [pCookie, jaCookie, jbCookie, oCookie] = await Promise.all([
        mintCookie(participant),
        mintCookie(judgeA),
        mintCookie(judgeB),
        mintCookie(organiser),
    ]);

    let toml = fs.readFileSync(TOML_PATH, 'utf8');

    toml = upsertSection(toml, 'portal', `base_url = "${BASE_URL}"\n`);

    toml = upsertSection(
        toml,
        'auth',
        [
            '# Session cookies, minted by `npm run dogfood-config`. They expire after',
            '# 24 hours -- re-run that command before a grading pass.',
            `participant = "${pCookie}"`,
            `judge_a = "${jaCookie}"`,
            `judge_b = "${jbCookie}"`,
            `organizer = "${oCookie}"`,
            '',
        ].join('\n'),
    );

    // This REPLACES the whole [routes] section, so the template below has to
    // list every route worth documenting -- anything added to .dogfood.toml by
    // hand disappears the next time this runs. Adding a route to the API means
    // adding it HERE, not just to the file; the T3 routes below were nearly
    // lost that way.
    toml = upsertSection(
        toml,
        'routes',
        [
            '# Paths the frontend depends on.',
            'auth_register    = "POST /api/auth/register"',
            'auth_login       = "POST /api/auth/login"',
            'auth_logout      = "POST /api/auth/logout"',
            'auth_me          = "GET  /api/auth/me"',
            'events           = "GET /api/events"',
            'event_featured   = "GET /api/events/featured"',
            'tracks           = "GET /api/tracks"',
            'project_detail   = "GET /api/projects/:id"',
            'teams            = "GET /api/teams"',
            'invite_preview   = "GET /api/invites/token/:token"',
            'invite_accept    = "POST /api/invites/token/:token/accept"',
            'ballot           = "PUT /api/scores/ballot"',
            'scores           = "GET /api/scores?eventId=:id"',
            'track_judges     = "POST /api/tracks/:id/judges"',
            'track_judge      = "DELETE /api/tracks/:id/judges/:userId"',
            'standings        = "GET /api/events/:id/standings"',
            'standings_csv    = "GET /api/events/:id/standings.csv"',
            'entries_csv      = "GET /api/events/:id/entries.csv"',
            'assignments      = "GET|POST|DELETE /api/events/:id/assignments"',
            'assign_auto      = "POST /api/events/:id/assignments/auto"',
            'assignments_csv  = "GET /api/events/:id/assignments.csv"',
            'judge_queue      = "GET /api/judge/queue?eventId=:id"',
            'judge_invites    = "GET|POST /api/tracks/:id/judge-invites"',
            'judge_invite     = "GET /api/judge-invites/token/:token"',
            'judge_accept     = "POST /api/judge-invites/token/:token/accept"',
            'vote             = "POST|DELETE /api/projects/:id/vote"',
            'community        = "GET /api/events/:id/community"',
            'comments         = "GET|POST /api/projects/:id/comments"',
            'comment          = "DELETE /api/comments/:id"',
            'audit            = "GET /api/events/:id/audit"',
            'public_api       = "GET /api/v1"',
            'health           = "GET /health"',
            '',
            '# Bare paths used by run.py. It appends nothing and sends no method,',
            '# so each of these is a complete URL path.',
            'gallery      = "/api/projects"',
            `submit       = "/api/projects/${project._id}/submit"`,
            'judge_scores = "/api/judge/scores"',
            `peer_scores  = "/api/scores?judge=${judgeA._id}"`,
            `csv_export   = "/api/export.csv?eventId=${event._id}"`,
            '',
        ].join('\n'),
    );

    fs.writeFileSync(TOML_PATH, toml);

    console.log(`Wrote ${TOML_PATH}`);
    console.log(`  portal        ${BASE_URL}`);
    console.log(`  event         ${event.name} (closed ${event.submissionsClose.toISOString()})`);
    console.log(`  submit probe  ${project.title} -> /api/projects/${project._id}/submit`);
    console.log(`  participant   ${participant.email} (member of ${team.name})`);
    console.log(`  judge_a       ${judgeA.email}`);
    console.log(`  judge_b       ${judgeB.email}`);
    console.log(`  organizer     ${organiser.email}`);

    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('dogfood-config failed:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});

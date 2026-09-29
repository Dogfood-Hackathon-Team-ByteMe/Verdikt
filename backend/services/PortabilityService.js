/**
 * Bulk export and import (T4): an organizer can leave as easily as they
 * arrived, carrying one JSON file that another Verdikt can rebuild the event
 * from -- structure, panel, entries and every ballot.
 *
 * What is deliberately NOT in the bundle:
 *   - password hashes and session tokens. People are referenced by email and
 *     name only. On import, an email that already has an account here is
 *     linked to it; one that does not gets a locked account (a random
 *     password nobody knows), because inventing sign-in credentials for
 *     someone out of an import file would be an account-takeover machine.
 *   - votes, comments and the audit trail. Those are this instance's history
 *     of its own crowd, not the event's substance; the trail in particular
 *     describes actions taken HERE, and replaying it elsewhere would forge it.
 *
 * References inside the bundle are by local key (t0, m1, p2) rather than by
 * database id, so the file is self-contained and survives being imported into
 * an instance where those ids mean something else.
 */
import crypto from "crypto";
import bcrypt from "bcrypt";
import Event from "../models/Event.js";
import Project from "../models/Project.js";
import Score from "../models/Score.js";
import Team from "../models/Team.js";
import Track from "../models/Track.js";
import User from "../models/User.js";
import * as auditService from "./AuditService.js";
import { ACTIONS } from "./AuditService.js";

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export const FORMAT = "verdikt-event";
export const VERSION = 1;

const loadEventAsOrganiser = async (eventId, user) => {
	const event = await Event.findById(eventId);
	if (!event) throw fail("Event not found", 404);
	const isOrganiser = user.organiserIn?.some((id) => id.toString() === event._id.toString());
	if (!isOrganiser && !user.isAdmin) {
		throw fail("Only the event organiser can export this event", 403);
	}
	return event;
};

const str = (v) => (v == null ? null : String(v));

export const exportEvent = async (eventId, user) => {
	const event = await loadEventAsOrganiser(eventId, user);

	const tracks = await Track.find({ eventId }).populate("judges", "name email");
	const teams = await Team.find({ eventId }).populate("members", "name email");
	const projects = await Project.find({ eventId });
	const scores = await Score.find({ eventId }).populate("judgeId", "name email");
	const eventJudges = await User.find({ _id: { $in: event.judgeIds } }, { name: 1, email: 1 });

	const trackKey = new Map(tracks.map((t, i) => [t._id.toString(), `t${i}`]));
	const teamKey = new Map(teams.map((t, i) => [t._id.toString(), `m${i}`]));
	const projectKey = new Map(projects.map((p, i) => [p._id.toString(), `p${i}`]));

	// Everyone the bundle mentions, by email: members, judges, panel.
	const people = new Map();
	const mention = (u) => {
		if (u && u.email) people.set(u.email, { email: u.email, name: u.name ?? u.email });
	};
	teams.forEach((t) => (t.members ?? []).forEach(mention));
	tracks.forEach((t) => (t.judges ?? []).forEach(mention));
	eventJudges.forEach(mention);
	scores.forEach((s) => mention(s.judgeId));

	const bundle = {
		format: FORMAT,
		version: VERSION,
		exportedAt: new Date().toISOString(),
		event: {
			name: event.name,
			description: event.description ?? null,
			tagline: event.tagline ?? null,
			startsAt: event.startsAt ?? null,
			submissionsClose: event.submissionsClose ?? null,
			minTeamSize: event.minTeamSize,
			maxTeamSize: event.maxTeamSize,
			eventTags: event.eventTags ?? [],
			bannerUrl: event.bannerUrl ?? "",
			prizes: (event.prizes ?? []).map((p) => ({
				name: p.name,
				amountUsd: p.amountUsd ?? 0,
				description: p.description ?? null,
				track: p.trackId ? (trackKey.get(p.trackId.toString()) ?? null) : null,
			})),
			customQuestions: (event.customQuestions ?? []).map((q) => ({
				key: q.key,
				label: q.label,
				type: q.type,
				options: q.options ?? [],
				required: Boolean(q.required),
			})),
			criteria: (event.criteria ?? []).map((c) => ({
				key: c.key,
				label: c.label,
				description: c.description ?? null,
				weight: c.weight,
				maxScore: c.maxScore,
			})),
			judges: eventJudges.map((j) => j.email),
		},
		users: [...people.values()],
		tracks: tracks.map((t) => ({
			key: trackKey.get(t._id.toString()),
			topic: t.topic,
			description: t.description ?? null,
			judges: (t.judges ?? []).map((j) => j.email).filter(Boolean),
		})),
		teams: teams.map((t) => ({
			key: teamKey.get(t._id.toString()),
			name: t.name,
			description: t.description ?? null,
			members: (t.members ?? []).map((m) => m.email).filter(Boolean),
		})),
		projects: projects.map((p) => ({
			key: projectKey.get(p._id.toString()),
			title: p.title,
			tagline: p.tagline ?? null,
			summary: p.summary ?? null,
			description: p.description ?? null,
			repoUrl: p.repoUrl ?? p.codeRepoLink ?? null,
			liveUrl: p.liveUrl ?? null,
			demoVideoUrl: p.demoVideoUrl ?? null,
			techTags: p.techTags ?? [],
			status: p.status,
			submittedAt: p.submittedAt ?? null,
			team: p.teamId ? (teamKey.get(p.teamId.toString()) ?? null) : null,
			track: p.trackId ? (trackKey.get(p.trackId.toString()) ?? null) : null,
			customAnswers: p.customAnswers ? Object.fromEntries(p.customAnswers) : {},
		})),
		scores: scores
			.filter((s) => s.judgeId?.email && projectKey.has(s.projectId.toString()))
			.map((s) => ({
				judge: s.judgeId.email,
				project: projectKey.get(s.projectId.toString()),
				scores: s.scores ? Object.fromEntries(s.scores) : {},
				comment: s.comment ?? "",
			})),
	};

	await auditService.record(null, ACTIONS.EVENT_EXPORTED, {
		actorId: user._id,
		eventId,
		meta: { projects: projects.length, scores: scores.length },
	});

	return bundle;
};

/** An account that exists but cannot be signed into: a password nobody knows. */
const lockedAccount = async (email, name) =>
	await User.create({
		email: email.toLowerCase(),
		name: name || email,
		password: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
	});

/**
 * Rebuild an event from a bundle. The importer becomes its organiser -- they
 * hold the file, they own the copy. Dates are kept as they were, past or not:
 * an archive of a finished event is the normal case, and refusing a closed
 * event would make export-then-import useless for exactly the people it is
 * for.
 */
export const importEvent = async (bundle, user) => {
	if (!bundle || typeof bundle !== "object") throw fail("A bundle is required", 400);
	if (bundle.format !== FORMAT) throw fail(`Not a ${FORMAT} bundle`, 400);
	if (bundle.version !== VERSION) throw fail(`Unsupported bundle version ${str(bundle.version)}`, 400);
	if (!bundle.event?.name) throw fail("The bundle names no event", 400);

	// People first: link by email, mint locked accounts for the rest.
	const byEmail = new Map();
	for (const person of bundle.users ?? []) {
		const email = String(person?.email ?? "").trim().toLowerCase();
		if (!email || byEmail.has(email)) continue;
		const existing = await User.findOne({ email });
		byEmail.set(email, existing ?? (await lockedAccount(email, str(person.name))));
	}
	const userFor = (email) => byEmail.get(String(email ?? "").trim().toLowerCase()) ?? null;

	const src = bundle.event;
	const event = await Event.create({
		name: str(src.name),
		description: str(src.description),
		tagline: str(src.tagline),
		organiserId: user._id,
		startsAt: src.startsAt ? new Date(src.startsAt) : null,
		submissionsClose: src.submissionsClose ? new Date(src.submissionsClose) : null,
		minTeamSize: Number(src.minTeamSize) || 1,
		maxTeamSize: Number(src.maxTeamSize) || 4,
		eventTags: (src.eventTags ?? []).map(str),
		bannerUrl: str(src.bannerUrl) ?? "",
		customQuestions: (src.customQuestions ?? []).map((q) => ({
			key: str(q.key),
			label: str(q.label),
			type: ["text", "longtext", "url", "select"].includes(q.type) ? q.type : "text",
			options: (q.options ?? []).map(str),
			required: Boolean(q.required),
		})),
		criteria: (src.criteria ?? []).map((c) => ({
			key: str(c.key),
			label: str(c.label),
			description: str(c.description),
			weight: Number(c.weight) || 1,
			maxScore: Number(c.maxScore) || 5,
		})),
		judgeIds: (src.judges ?? []).map((e) => userFor(e)?._id).filter(Boolean),
	});
	await User.updateOne({ _id: user._id }, { $addToSet: { organiserIn: event._id } });

	const trackFor = new Map();
	for (const t of bundle.tracks ?? []) {
		const judges = (t.judges ?? []).map((e) => userFor(e)).filter(Boolean);
		const track = await Track.create({
			topic: str(t.topic),
			description: str(t.description),
			eventId: event._id,
			judges: judges.map((j) => j._id),
		});
		trackFor.set(t.key, track);
		for (const judge of judges) {
			await User.updateOne({ _id: judge._id }, { $addToSet: { judgeIn: track._id } });
		}
	}
	await Event.updateOne(
		{ _id: event._id },
		{ $set: { tracks: [...trackFor.values()].map((t) => t._id) } },
	);

	// Prizes could not name their tracks until the tracks existed.
	if ((src.prizes ?? []).length > 0) {
		await Event.updateOne(
			{ _id: event._id },
			{
				$set: {
					prizes: src.prizes.map((p) => ({
						name: str(p.name),
						amountUsd: Number(p.amountUsd) || 0,
						description: str(p.description),
						trackId: p.track ? (trackFor.get(p.track)?._id ?? null) : null,
					})),
				},
			},
		);
	}

	const teamFor = new Map();
	for (const t of bundle.teams ?? []) {
		const members = (t.members ?? []).map((e) => userFor(e)).filter(Boolean);
		const team = await Team.create({
			name: str(t.name),
			description: str(t.description),
			eventId: event._id,
			members: members.map((m) => m._id),
			hasMinimumMembers: members.length >= (Number(src.minTeamSize) || 1),
		});
		teamFor.set(t.key, team);
		for (const member of members) {
			await User.updateOne({ _id: member._id }, { $addToSet: { participatingIn: event._id } });
		}
	}

	const projectFor = new Map();
	for (const p of bundle.projects ?? []) {
		const team = p.team ? teamFor.get(p.team) : null;
		const project = await Project.create({
			title: str(p.title),
			tagline: str(p.tagline),
			summary: str(p.summary),
			description: str(p.description),
			repoUrl: str(p.repoUrl),
			liveUrl: str(p.liveUrl),
			demoVideoUrl: str(p.demoVideoUrl),
			techTags: (p.techTags ?? []).map(str),
			teamId: team?._id ?? null,
			trackId: p.track ? (trackFor.get(p.track)?._id ?? null) : null,
			eventId: event._id,
			customAnswers: p.customAnswers ?? {},
			status: p.status === "submitted" ? "submitted" : "draft",
			submittedAt: p.submittedAt ? new Date(p.submittedAt) : null,
		});
		projectFor.set(p.key, project);
		if (team) await Team.updateOne({ _id: team._id }, { $set: { projectId: project._id } });
	}

	let ballots = 0;
	for (const s of bundle.scores ?? []) {
		const judge = userFor(s.judge);
		const project = projectFor.get(s.project);
		if (!judge || !project) continue;
		await Score.create({
			judgeId: judge._id,
			eventId: event._id,
			projectId: project._id,
			scores: s.scores ?? {},
			comment: str(s.comment) ?? "",
		});
		ballots++;
	}

	await auditService.record(null, ACTIONS.EVENT_IMPORTED, {
		actorId: user._id,
		eventId: event._id,
		meta: {
			name: event.name,
			tracks: trackFor.size,
			teams: teamFor.size,
			projects: projectFor.size,
			ballots,
		},
	});

	return {
		eventId: event._id,
		name: event.name,
		tracks: trackFor.size,
		teams: teamFor.size,
		projects: projectFor.size,
		ballots,
		people: byEmail.size,
	};
};

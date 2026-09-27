/**
 * CSV exports, one per stage of an event.
 *
 *   entries      Submissions stage. Every entry, draft or submitted, with its
 *                answers to the organiser's questions.
 *   assignments  Judging stage. Who was asked to review what, and whether
 *                they have.
 *   ballots      Judging stage. Every ballot, one row per criterion -- the long
 *                shape for analysis -- with each ballot's weighted and
 *                normalized score alongside.
 *   standings    Results stage. One row per entry with its ranks, both scores
 *                and each criterion's average -- the short shape for deciding
 *                prizes.
 *
 * All four are organiser-of-this-event or admin only: each one exposes either
 * drafts, individual ballots, or the aggregate you can derive ballots from.
 * Every text cell goes through csvCell, which quotes it and defuses anything a
 * spreadsheet would run as a formula.
 */
import Project from "../models/Project.js";
import Team from "../models/Team.js";
import { pct, toCsv } from "../utils/csv.js";
import { scoresToObject } from "../utils/rubric.js";
import { scoreBallots } from "../utils/standings.js";
import { getStandings, loadEventAsOrganiser, loadJudgingData } from "./StandingsService.js";
import { listForEvent as listAssignments } from "./AssignmentService.js";

const idOf = (ref) => String(ref?._id ?? ref ?? "");

export const entriesCsv = async (eventId, user) => {
	const event = await loadEventAsOrganiser(eventId, user, "export its entries");

	// Drafts included: at the submissions stage the organiser wants to see who
	// is still working, not only who has finished.
	const projects = await Project.find({ eventId: event._id })
		.populate("trackId", "topic")
		.sort({ status: -1, submittedAt: 1, createdAt: 1 });
	const teams = await Team.find({ eventId: event._id }).populate("members", "name");
	const teamById = new Map(teams.map((t) => [idOf(t._id), t]));

	const questions = event.customQuestions ?? [];

	const rows = projects.map((p) => {
		const team = teamById.get(idOf(p.teamId));
		const answers = p.customAnswers instanceof Map ? Object.fromEntries(p.customAnswers) : (p.customAnswers ?? {});
		return [
			p.title,
			team?.name ?? null,
			(team?.members ?? []).map((m) => m.name).filter(Boolean).join("; "),
			p.trackId?.topic ?? null,
			p.status,
			p.submittedAt ?? null,
			p.repoUrl || p.codeRepoLink || null,
			p.demoVideoUrl || null,
			p.liveUrl || null,
			(p.techTags ?? []).join("; "),
			...questions.map((q) => answers[q.key] ?? null),
		];
	});

	return toCsv(
		[
			"project_title",
			"team_name",
			"members",
			"track",
			"status",
			"submitted_at",
			"repo_url",
			"demo_video_url",
			"live_url",
			"tech_tags",
			// Custom questions are keyed, and the key is a safe column name where
			// the label (free text, possibly with commas) is not.
			...questions.map((q) => `answer_${q.key}`),
		],
		rows,
	);
};

export const assignmentsCsv = async (eventId, user) => {
	await loadEventAsOrganiser(eventId, user, "export its judge assignments");
	const assignments = await listAssignments(eventId, user);

	return toCsv(
		["judge_name", "judge_email", "project_title", "track", "assigned_by", "scored"],
		assignments.map((a) => [a.judgeName, a.judgeEmail, a.projectTitle, a.trackName, a.source, a.scored]),
	);
};

export const ballotsCsv = async (eventId, user) => {
	const event = await loadEventAsOrganiser(eventId, user, "export its ballots");
	const { projects, scores, judges } = await loadJudgingData(event);

	// Every ballot is exported, including any on an entry since withdrawn to
	// draft -- this is the audit record. Only in-scope ballots get a normalized
	// score, because only they took part in normalization.
	const scored = scoreBallots({ projects, scores, criteria: event.criteria });
	const norm = new Map(scored.ballots.map((b) => [`${b.judgeId}:${b.projectId}`, b]));

	const allProjects = await Project.find({ eventId: event._id }).populate("trackId", "topic").populate("teamId", "name");
	const projectById = new Map(allProjects.map((p) => [idOf(p._id), p]));
	const judgeById = new Map(judges.map((j) => [idOf(j._id), j]));

	const rows = [];
	for (const score of scores) {
		const project = projectById.get(idOf(score.projectId));
		const judge = judgeById.get(idOf(score.judgeId));
		const b = norm.get(`${idOf(score.judgeId)}:${idOf(score.projectId)}`);

		for (const [criterion, value] of Object.entries(scoresToObject(score.scores))) {
			rows.push([
				judge?.name ?? "Unknown",
				judge?.email ?? "Unknown",
				project?.title ?? "Unknown",
				project?.teamId?.name ?? "Unknown",
				project?.trackId?.topic ?? "Unknown",
				criterion,
				value,
				score.comment ?? "",
				pct(b?.score),
				pct(b?.normalized),
			]);
		}
	}

	return toCsv(
		[
			"judge_name",
			"judge_email",
			"project_title",
			"team_name",
			"track",
			"criteria",
			"score",
			"comment",
			"ballot_weighted_pct",
			"ballot_normalized_pct",
		],
		rows,
	);
};

export const standingsCsv = async (eventId, user, options = {}) => {
	const { criteria, standings, method } = await getStandings(eventId, user, options);

	return toCsv(
		[
			"rank",
			"track_rank",
			"ranked_by",
			"project_title",
			"team_name",
			"track",
			"ballots",
			"assigned",
			"normalized_score_pct",
			"raw_score_pct",
			...criteria.map((c) => `avg_${c.key}`),
		],
		standings.map((row) => [
			row.rank,
			row.trackRank,
			method,
			row.title,
			row.teamName,
			row.trackName,
			row.ballotCount,
			row.assignedCount,
			pct(row.normalizedScore),
			pct(row.weightedScore),
			...criteria.map((c) => {
				const v = row.perCriterion[c.key];
				return typeof v === "number" ? Math.round(v * 100) / 100 : null;
			}),
		]),
	);
};

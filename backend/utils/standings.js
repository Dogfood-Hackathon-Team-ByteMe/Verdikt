/**
 * Turning ballots into a ranking.
 *
 * Computed on read, never stored. Ballots keep changing until the organizer
 * closes judging, and a stored ranking would go stale silently -- the failure
 * mode being a leaderboard that looks authoritative and is wrong. The Result
 * collection is a different thing: hand-entered final standings, for announcing
 * winners once they are decided.
 *
 * Every entry carries two scores: the raw mean of its ballots, and the mean
 * after cross-judge normalization (normalization.js). The leaderboard ranks by
 * one of them -- normalized by default -- and shows both, so the effect of the
 * correction is always visible rather than taken on trust.
 *
 * Pure functions, no database: everything here takes plain objects, so the
 * ranking rules can be tested without a Mongo instance behind them.
 */
import { normaliseBallots } from "./normalization.js";
import { scoresToObject, weightedScore } from "./rubric.js";

export const METHODS = ["normalized", "raw"];

const FIELD = { normalized: "normalizedScore", raw: "weightedScore" };

/**
 * Mean of an array, or null when there is nothing to average.
 *
 * Null rather than 0, because "no judge has scored this" and "every judge
 * scored it zero" have to look different on a leaderboard.
 */
const mean = (values) => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

/**
 * Two scores this close are the same score.
 *
 * Floating point makes 0.9 computed two ways differ in the sixteenth place, and
 * normalization is more arithmetic still. Without a tolerance an exact tie on
 * the judges' actual numbers could come out as rank 1 and rank 2.
 */
const SAME = 1e-9;
const same = (a, b) => a !== null && b !== null && Math.abs(a - b) < SAME;

const idOf = (ref) => String(ref?._id ?? ref ?? "");

/**
 * Competition ranking (1, 2, 2, 4) over rows already sorted best-first.
 *
 * Ties share a rank and consume the ones behind them, which is what a prize
 * table means by "joint second". Rows with a null score are left unranked --
 * they are unjudged, not last, and numbering them would imply they lost.
 */
export const assignRanks = (rows, field = "weightedScore") => {
	let lastScore = null;
	let lastRank = 0;

	return rows.map((row, index) => {
		const score = row[field];
		if (score === null || score === undefined) return { ...row, rank: null };

		const rank = same(score, lastScore) ? lastRank : index + 1;
		lastScore = score;
		lastRank = rank;
		return { ...row, rank };
	});
};

/**
 * Score every ballot on in-scope entries: raw weighted, then normalized.
 *
 * Only ballots on the given projects take part. A ballot on an entry that was
 * withdrawn to draft is not on the leaderboard, so letting it shape a judge's
 * estimated habits would correct the live entries against work nobody can see.
 */
export const scoreBallots = ({ projects, scores, criteria = [] }) => {
	const live = new Set(projects.map((p) => idOf(p._id)));
	const inScope = scores.filter((s) => live.has(idOf(s.projectId)));

	const ballots = inScope.map((s) => ({
		judgeId: idOf(s.judgeId),
		projectId: idOf(s.projectId),
		scores: scoresToObject(s.scores),
		score: weightedScore(s.scores, criteria),
	}));

	return normaliseBallots(ballots);
};

/**
 * One row per project: raw and normalized scores, per-criterion means, and how
 * many judges have weighed in (and how many were asked to).
 *
 * A project's score is the mean of its BALLOTS' weighted scores, not the
 * weighted mean of its per-criterion means. The two agree when every judge
 * scored every criterion, which the rubric enforces -- but going ballot-first
 * means a partially-filled legacy ballot degrades to "that judge's opinion,
 * slightly under-informed" instead of skewing one criterion's average.
 */
export const summariseProjects = ({ projects, scores, criteria = [], assignments = [], scored = null }) => {
	const { ballots } = scored ?? scoreBallots({ projects, scores, criteria });

	const byProject = new Map();
	for (const b of ballots) {
		if (!byProject.has(b.projectId)) byProject.set(b.projectId, []);
		byProject.get(b.projectId).push(b);
	}

	const assigned = new Map();
	for (const a of assignments) {
		const key = idOf(a.projectId);
		assigned.set(key, (assigned.get(key) ?? 0) + 1);
	}

	return projects.map((project) => {
		const key = idOf(project._id);
		const mine = byProject.get(key) ?? [];

		const perCriterion = {};
		for (const criterion of criteria) {
			perCriterion[criterion.key] = mean(
				mine.map((b) => b.scores[criterion.key]).filter((v) => typeof v === "number"),
			);
		}

		return {
			projectId: key,
			title: project.title,
			teamId: idOf(project.teamId),
			teamName: project.teamId?.name ?? null,
			trackId: project.trackId ? idOf(project.trackId) : null,
			trackName: project.trackId?.topic ?? null,
			ballotCount: mine.length,
			assignedCount: assigned.get(key) ?? 0,
			weightedScore: mean(mine.map((b) => b.score).filter((v) => typeof v === "number")),
			normalizedScore: mean(mine.map((b) => b.normalized).filter((v) => typeof v === "number")),
			// How many of this entry's ballots normalization could actually
			// correct. Zero means its normalized score is its raw score.
			correctedBallots: mine.filter((b) => b.corrected).length,
			perCriterion,
		};
	});
};

/**
 * Rank the summarised rows overall and again within each track, by `method`.
 *
 * Both rankings, because a hackathon usually awards both and the per-track
 * winner is rarely the overall one. Unjudged rows sort to the end and stay
 * unranked in both.
 */
export const rankProjects = (rows, method = "normalized") => {
	const field = FIELD[method] ?? FIELD.normalized;

	// Nulls last, then best first, then by title so the order is stable rather
	// than whatever the database happened to return.
	const bestFirst = (a, b) => {
		const x = a[field];
		const y = b[field];
		if (x === null && y === null) return a.title.localeCompare(b.title);
		if (x === null) return 1;
		if (y === null) return -1;
		if (!same(x, y)) return y - x;
		return a.title.localeCompare(b.title);
	};

	const overall = assignRanks([...rows].sort(bestFirst), field);

	const trackRank = new Map();
	for (const trackId of new Set(rows.map((r) => r.trackId))) {
		const inTrack = assignRanks(overall.filter((r) => r.trackId === trackId).sort(bestFirst), field);
		for (const row of inTrack) trackRank.set(row.projectId, row.rank);
	}

	return overall.map((row) => ({ ...row, trackRank: trackRank.get(row.projectId) ?? null }));
};

/**
 * How far judging has actually got, and each judge's scoring habits.
 *
 * The operational question an organizer has before any of the rankings matter:
 * is everything scored, and which judges still owe ballots? The habits (mean,
 * spread, whether normalization could correct them) are what make the
 * normalized column explainable instead of a number nobody can check.
 */
export const judgingProgress = ({ projects, scores, judges = [], assignments = [], scored = null }) => {
	const live = new Set(projects.map((p) => idOf(p._id)));
	const inScope = scores.filter((s) => live.has(idOf(s.projectId)));
	const scoredProjectIds = new Set(inScope.map((s) => idOf(s.projectId)));
	const stats = scored?.judges ?? new Map();

	const ballotsBy = new Map();
	for (const s of inScope) {
		const key = idOf(s.judgeId);
		ballotsBy.set(key, (ballotsBy.get(key) ?? 0) + 1);
	}

	const assignedBy = new Map();
	const doneBy = new Map();
	const ballotKeys = new Set(inScope.map((s) => `${idOf(s.judgeId)}:${idOf(s.projectId)}`));
	for (const a of assignments) {
		if (!live.has(idOf(a.projectId))) continue;
		const key = idOf(a.judgeId);
		assignedBy.set(key, (assignedBy.get(key) ?? 0) + 1);
		if (ballotKeys.has(`${key}:${idOf(a.projectId)}`)) doneBy.set(key, (doneBy.get(key) ?? 0) + 1);
	}

	return {
		projectCount: projects.length,
		scoredProjectCount: projects.filter((p) => scoredProjectIds.has(idOf(p._id))).length,
		unscoredProjectCount: projects.filter((p) => !scoredProjectIds.has(idOf(p._id))).length,
		ballotCount: inScope.length,
		assignmentCount: assignments.filter((a) => live.has(idOf(a.projectId))).length,
		judges: judges.map((judge) => {
			const key = idOf(judge._id);
			const habit = stats.get(key);
			return {
				judgeId: key,
				name: judge.name ?? null,
				email: judge.email ?? null,
				ballotCount: ballotsBy.get(key) ?? 0,
				assignedCount: assignedBy.get(key) ?? 0,
				assignedDone: doneBy.get(key) ?? 0,
				meanScore: habit ? habit.mean : null,
				spread: habit ? habit.sd : null,
				corrected: habit ? habit.corrected : false,
				// Why a judge's ballots stand as cast: too few to estimate their
				// habits, or nobody to compare them with.
				uncorrectedReason: habit && !habit.corrected ? habit.reason : null,
			};
		}),
	};
};

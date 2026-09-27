/**
 * Does normalization actually help? Measured, not asserted.
 *
 * A simulated event where the true quality of every entry is known, judged by a
 * panel whose biases are known, run through the same normaliseBallots() the
 * leaderboard uses. Each method's ranking is then compared with the truth.
 *
 * Three methods are compared:
 *
 *   raw          the mean of each entry's ballots, uncorrected
 *   naive        a per-judge z-score onto the WHOLE panel -- the textbook
 *                method, kept here only as the thing we chose not to ship
 *   normalized   what Verdikt ships: the same z-score, but onto each judge's
 *                connected group (see normalization.js)
 *
 * across three scenarios, because a method is only understood once you have
 * seen where it fails as well as where it works:
 *
 *   biased-random   Judges are harsh, generous, decisive or flat, and entries
 *                   are dealt to them at random. The case normalization exists
 *                   for.
 *   fair-random     The same with every judge unbiased. Nothing to correct;
 *                   this measures what normalization costs when it is not
 *                   needed.
 *   biased-tracks   Judges only ever see their own track, and the tracks
 *                   genuinely differ in quality. The naive method pulls every
 *                   judge to the panel mean and so erases the real difference
 *                   between tracks; grouping is what stops that.
 *
 * Deterministic: a seeded generator, so the numbers in JUDGING.md reproduce.
 */
import { normaliseBallots, spearman } from './normalization.js';

/** mulberry32: small, fast, seedable. Plenty for a simulation. */
const rng = (seed) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const gaussian = (rand) => {
	const u = Math.max(rand(), 1e-12);
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * The textbook per-judge z-score onto the whole panel. Deliberately NOT
 * exported from normalization.js: it is here to be measured against, and
 * biased-tracks shows why it is not what ships.
 */
const naive = (ballots) => {
	const mu = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
	const sigma = (xs) => Math.sqrt(xs.reduce((a, x) => a + (x - mu(xs)) ** 2, 0) / xs.length);
	const all = ballots.map((b) => b.score);
	const pm = mu(all);
	const ps = sigma(all);
	const byJudge = new Map();
	for (const b of ballots) byJudge.set(b.judgeId, [...(byJudge.get(b.judgeId) ?? []), b.score]);
	return ballots.map((b) => {
		const xs = byJudge.get(b.judgeId);
		const s = sigma(xs);
		if (xs.length < 2) return { ...b, naive: b.score };
		if (s < 1e-9) return { ...b, naive: pm };
		return { ...b, naive: pm + ((b.score - mu(xs)) / s) * ps };
	});
};
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** How many of the true top k also finish in the method's top k. */
const topKOverlap = (truth, scores, k) => {
	const top = (xs) => new Set(xs.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, k).map((p) => p[1]));
	const t = top(truth);
	let hit = 0;
	for (const i of top(scores)) if (t.has(i)) hit++;
	return hit;
};

/**
 * One simulated event.
 *
 * `tracks` > 1 with `isolated` deals entries only to their own track's judges,
 * and `trackLift` makes the tracks differ genuinely in quality.
 */
const simulate = (seed, { projects = 40, judges = 8, reviews = 3, biased = true, tracks = 1, isolated = false, trackLift = 0 }) => {
	const rand = rng(seed);

	const panel = Array.from({ length: judges }, (_, j) => ({
		id: `j${j}`,
		track: j % tracks,
		// Harsh or generous: shifts every score this judge gives.
		offset: biased ? (rand() - 0.5) * 0.4 : 0,
		// Decisive or flat: stretches or squashes their spread.
		scale: biased ? 0.5 + rand() : 1,
	}));

	const entries = Array.from({ length: projects }, (_, p) => {
		const track = p % tracks;
		return { id: `p${p}`, track, quality: clamp01(0.2 + rand() * 0.6 + track * trackLift) };
	});

	// Balanced dealing: each entry goes to the `reviews` eligible judges with the
	// lightest load so far, ties broken at random -- the shape of batch
	// assignment, without the database.
	const load = new Map(panel.map((j) => [j.id, 0]));
	const ballots = [];
	for (const entry of entries) {
		const eligible = panel.filter((j) => !isolated || j.track === entry.track);
		const chosen = eligible
			.map((j) => ({ j, tie: rand() }))
			.sort((a, b) => load.get(a.j.id) - load.get(b.j.id) || a.tie - b.tie)
			.slice(0, reviews)
			.map((x) => x.j);

		for (const judge of chosen) {
			load.set(judge.id, load.get(judge.id) + 1);
			const noise = gaussian(rand) * 0.04;
			const score = clamp01(0.5 + judge.scale * (entry.quality - 0.5) + judge.offset + noise);
			ballots.push({ judgeId: judge.id, projectId: entry.id, score });
		}
	}

	const { ballots: normalized } = normaliseBallots(ballots);
	const withNaive = naive(normalized);

	const perEntry = (key) =>
		entries.map((e) => avg(withNaive.filter((b) => b.projectId === e.id).map((b) => b[key])));

	const truth = entries.map((e) => e.quality);
	const raw = perEntry('score');
	const nai = perEntry('naive');
	const norm = perEntry('normalized');

	return {
		spearmanRaw: spearman(truth, raw),
		spearmanNaive: spearman(truth, nai),
		spearmanNormalized: spearman(truth, norm),
		top5Raw: topKOverlap(truth, raw, 5),
		top5Naive: topKOverlap(truth, nai, 5),
		top5Normalized: topKOverlap(truth, norm, 5),
	};
};

export const SCENARIOS = {
	'biased-random': { biased: true },
	'fair-random': { biased: false },
	'biased-tracks': { biased: true, tracks: 4, isolated: true, trackLift: 0.1 },
};

/**
 * Run every scenario over `trials` seeded events and summarise.
 *
 * Reported per scenario: mean Spearman correlation with the true ranking for
 * each method, how often normalization beat raw, and mean overlap between the
 * true top 5 and each method's top 5 -- the number prizes actually depend on.
 */
export const runProof = ({ trials = 200, seed = 20260927 } = {}) => {
	const report = {};
	for (const [name, options] of Object.entries(SCENARIOS)) {
		const runs = Array.from({ length: trials }, (_, i) => simulate(seed + i, options));
		report[name] = {
			trials,
			spearmanRaw: avg(runs.map((r) => r.spearmanRaw)),
			spearmanNaive: avg(runs.map((r) => r.spearmanNaive)),
			spearmanNormalized: avg(runs.map((r) => r.spearmanNormalized)),
			normalizedWins: runs.filter((r) => r.spearmanNormalized > r.spearmanRaw).length / trials,
			top5Raw: avg(runs.map((r) => r.top5Raw)),
			top5Naive: avg(runs.map((r) => r.top5Naive)),
			top5Normalized: avg(runs.map((r) => r.top5Normalized)),
		};
	}
	return report;
};

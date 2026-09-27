/**
 * Cross-judge normalization.
 *
 * A harsh judge and a generous one scoring the same entry can be twenty points
 * apart, and with only a few judges per entry, which judges an entry happened
 * to draw decides more than the entry does. So each ballot is re-expressed
 * relative to the habits of the judge who cast it before ballots are combined.
 *
 * The method is a per-judge z-score, mapped back onto the scale of the group
 * of judges that judge can be compared with:
 *
 *     normalized = groupMean + (score - judgeMean) / judgeSd * groupSd
 *
 * which removes each judge's offset (harsh vs generous) and their spread
 * (decisive vs everything-is-a-seven), then puts the result back in the same
 * 0..1 units as a raw score so an organizer can still read it.
 *
 * "Group" is a connected component of the judge/entry graph: judges who scored
 * a common entry, directly or through a chain of other judges. Bias can only be
 * measured between judges who saw overlapping work, so that is the only place
 * it is corrected. Rescaling onto the WHOLE panel instead would also flatten
 * any real difference between groups that never overlap -- with judges kept to
 * their own tracks, a genuinely stronger track would be dragged down to the
 * average. utils/normalizationProof.js measures exactly that failure.
 *
 * Three cases cannot be corrected, and are handled explicitly rather than by
 * dividing by zero:
 *
 *   - A judge with fewer than MIN_BALLOTS ballots. One ballot says nothing
 *     about whether the judge is harsh or the entry is weak, so the ballot is
 *     kept as it was cast, and flagged as uncorrected.
 *   - A judge alone in their group. There is nobody to compare them with, so
 *     again the ballot stands as cast.
 *   - A judge whose ballots are all identical. They expressed no preference
 *     between the entries they saw, so each of those ballots becomes the group
 *     mean: neither a boost nor a penalty.
 *
 * See JUDGING.md for the reasoning and the measured results.
 *
 * Pure functions, no database.
 */

/** Below this, a judge's habits cannot be estimated, so their ballots stand as cast. */
export const MIN_BALLOTS = 2;

/** Spread below this is "every ballot identical", not a very decisive judge. */
const FLAT = 1e-9;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Population standard deviation. The same estimator for judges and the panel. */
const sd = (xs) => {
	if (xs.length === 0) return 0;
	const m = mean(xs);
	return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
};

/**
 * Normalize a set of ballots.
 *
 * @param ballots  [{ judgeId, projectId, score }] -- `score` is the ballot's
 *                 weighted score in 0..1 (see rubric.js), null to skip it.
 * @returns {
 *   ballots: the input, each with `normalized` and `corrected` added,
 *   judges:  Map judgeId -> { count, mean, sd, corrected, reason, group, peers },
 *   panel:   { mean, sd, count },
 *   groups:  how many separately-comparable groups the panel split into,
 * }
 */
export const normaliseBallots = (ballots) => {
	const scored = ballots.filter((b) => typeof b.score === 'number' && Number.isFinite(b.score));

	const panelScores = scored.map((b) => b.score);
	const panel = {
		count: panelScores.length,
		mean: panelScores.length ? mean(panelScores) : null,
		sd: sd(panelScores),
	};

	// Judges are only comparable with judges they share entries with, directly
	// or through a chain of other judges. Rescaling everyone onto the whole
	// panel's mean would also erase any REAL difference between groups that
	// never overlap -- a track whose entries are genuinely stronger would be
	// pulled down to the average. So each connected group of the judge/entry
	// graph is rescaled onto its own mean and spread instead. With entries dealt
	// at random the whole panel is one group and this is the textbook z-score.
	const group = groupsOf(scored);
	const groups = new Map();
	for (const b of scored) {
		const g = group.get(`j:${b.judgeId}`);
		if (!groups.has(g)) groups.set(g, []);
		groups.get(g).push(b.score);
	}
	const groupStats = new Map();
	for (const [g, scores] of groups) groupStats.set(g, { mean: mean(scores), sd: sd(scores), count: scores.length });

	const byJudge = new Map();
	for (const b of scored) {
		const key = String(b.judgeId);
		if (!byJudge.has(key)) byJudge.set(key, []);
		byJudge.get(key).push(b.score);
	}

	const judges = new Map();
	for (const [judgeId, scores] of byJudge) {
		const count = scores.length;
		const judgeMean = mean(scores);
		const judgeSd = sd(scores);

		let corrected = true;
		let reason = null;
		if (count < MIN_BALLOTS) {
			corrected = false;
			reason = 'too-few-ballots';
		} else if (judgeSd < FLAT) {
			reason = 'no-spread';
		}

		const g = group.get(`j:${judgeId}`);
		const peers = [...group.entries()].filter(([k, v]) => v === g && k.startsWith('j:')).length;

		// A judge with nobody to compare against -- alone in their group -- is
		// their own reference, and rescaling onto themselves is the identity.
		// Say so rather than claim a correction that did nothing.
		if (corrected && peers < 2) {
			corrected = false;
			reason = 'no-peers';
		}

		judges.set(judgeId, { count, mean: judgeMean, sd: judgeSd, corrected, reason, group: g, peers });
	}

	const out = ballots.map((b) => {
		if (typeof b.score !== 'number' || !Number.isFinite(b.score)) {
			return { ...b, normalized: null, corrected: false };
		}

		const j = judges.get(String(b.judgeId));
		if (!j.corrected) return { ...b, normalized: b.score, corrected: false };

		const target = groupStats.get(j.group);

		// Every ballot identical: no preference was expressed, so land on the
		// group mean rather than dividing by a zero spread.
		if (j.reason === 'no-spread') return { ...b, normalized: target.mean, corrected: true };

		// A group whose every ballot is identical has nothing to rescale to, and
		// every judge in it would have hit the no-spread branch above; this only
		// guards the arithmetic.
		const scale = target.sd < FLAT ? 0 : target.sd;
		const z = (b.score - j.mean) / j.sd;
		return { ...b, normalized: target.mean + z * scale, corrected: true };
	});

	return { ballots: out, judges, panel, groups: groupStats.size };
};

/**
 * Connected groups of the judge/entry graph, by union-find.
 *
 * Returns a Map from `j:<judgeId>` and `p:<projectId>` to a group id. Two
 * judges share a group when they scored a common entry, or are linked through
 * other judges who did.
 */
const groupsOf = (ballots) => {
	const parent = new Map();
	const find = (x) => {
		if (!parent.has(x)) parent.set(x, x);
		let root = x;
		while (parent.get(root) !== root) root = parent.get(root);
		// Path compression, so repeated lookups stay flat.
		while (parent.get(x) !== root) {
			const next = parent.get(x);
			parent.set(x, root);
			x = next;
		}
		return root;
	};
	const union = (a, b) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent.set(ra, rb);
	};

	for (const b of ballots) union(`j:${b.judgeId}`, `p:${b.projectId}`);

	const out = new Map();
	for (const key of parent.keys()) out.set(key, find(key));
	return out;
};

/**
 * Spearman rank correlation between two equal-length number arrays.
 *
 * Used by the normalization proof to ask "how close is this ranking to the
 * true one?". Ties get their average rank, the standard treatment.
 */
export const spearman = (xs, ys) => {
	const rank = (values) => {
		const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
		const ranks = new Array(values.length);
		for (let i = 0; i < order.length; ) {
			let j = i;
			while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
			const avg = (i + j) / 2 + 1;
			for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
			i = j + 1;
		}
		return ranks;
	};

	const rx = rank(xs);
	const ry = rank(ys);
	const mx = mean(rx);
	const my = mean(ry);
	let num = 0;
	let dx = 0;
	let dy = 0;
	for (let i = 0; i < rx.length; i++) {
		num += (rx[i] - mx) * (ry[i] - my);
		dx += (rx[i] - mx) ** 2;
		dy += (ry[i] - my) ** 2;
	}
	return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
};

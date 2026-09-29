/**
 * The organizer's rubric, and what a ballot has to look like to satisfy it.
 *
 * A rubric is a list of criteria on the event. A ballot (Score.scores) is a map
 * of criterion key -> number. The two are checked against each other here so
 * that every road into a score -- create and update -- gets the same answer,
 * and so the rule lives next to the maths that depends on it.
 *
 * Events with no rubric configured accept any map of numbers. That is
 * deliberate: rubrics arrived after the first ballots did, and refusing the
 * older shape would make previously-valid data unwritable.
 */

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** Plain `{key: number}` from a Mongoose Map, a plain object, or nothing. */
export const scoresToObject = (scores) => {
	if (!scores) return {};
	if (scores instanceof Map) return Object.fromEntries(scores);
	return { ...scores };
};

/**
 * Validate a ballot against an event's rubric, returning the cleaned map.
 *
 * Throws 400 rather than silently dropping a bad line: a judge who typed 7 on a
 * 1-5 scale wants to hear about it, and a key the rubric does not define is
 * either a stale form or a hand-rolled request, neither of which should end up
 * in the export as a column nobody can explain.
 */
export const validateBallot = (rawScores, criteria = []) => {
	const scores = scoresToObject(rawScores);
	const keys = Object.keys(scores);

	if (keys.length === 0) throw badRequest("A ballot needs at least one score");

	for (const [key, value] of Object.entries(scores)) {
		if (typeof value !== "number" || Number.isNaN(value)) {
			throw badRequest(`Score for "${key}" must be a number`);
		}
	}

	// No rubric configured: accept any numeric map, as above.
	if (!criteria || criteria.length === 0) return scores;

	const byKey = new Map(criteria.map((c) => [c.key, c]));

	for (const key of keys) {
		if (!byKey.has(key)) {
			throw badRequest(`"${key}" is not a criterion on this event's rubric`);
		}
	}

	for (const criterion of criteria) {
		const value = scores[criterion.key];
		if (value === undefined) {
			throw badRequest(`Missing a score for "${criterion.label}"`);
		}
		const max = criterion.maxScore ?? 5;
		if (value < 0 || value > max) {
			throw badRequest(`"${criterion.label}" must be between 0 and ${max}`);
		}
	}

	return scores;
};

/**
 * A ballot's weighted score, in 0..1, or null if it cannot be computed.
 *
 * Each line is normalised to its own scale before being weighted, so a rubric
 * can mix a 1-5 line with a 1-10 one without the longer scale quietly counting
 * for more than its weight says.
 */
export const weightedScore = (rawScores, criteria = []) => {
	const scores = scoresToObject(rawScores);

	// With no rubric there is nothing to weight by, so every line counts once
	// and the scale is assumed to be 5 -- the only scale the UI has ever shown.
	const lines = criteria.length > 0
		? criteria.map((c) => ({ key: c.key, weight: c.weight ?? 1, max: c.maxScore ?? 5 }))
		: Object.keys(scores).map((key) => ({ key, weight: 1, max: 5 }));

	let total = 0;
	let weight = 0;
	for (const line of lines) {
		const value = scores[line.key];
		if (typeof value !== "number" || line.max <= 0) continue;
		total += (value / line.max) * line.weight;
		weight += line.weight;
	}

	return weight > 0 ? total / weight : null;
};

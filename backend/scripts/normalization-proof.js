/**
 * Print the normalization proof: how close each scoring method's ranking comes
 * to the true one, across simulated events with known judge biases.
 *
 *   npm run normalization-proof
 *
 * The method and the scenarios are described in utils/normalizationProof.js;
 * what the numbers mean is in JUDGING.md.
 */
import { runProof } from '../utils/normalizationProof.js';

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const report = runProof();

console.log('Normalization proof: Spearman correlation with the true ranking (1.0 = perfect)');
console.log('and mean overlap between the true top 5 and each method\'s top 5.\n');
console.log('scenario        trials   raw     naive   shipped   shipped>raw   top5 raw/naive/shipped');
for (const [name, r] of Object.entries(report)) {
	console.log(
		`${name.padEnd(15)} ${String(r.trials).padStart(6)}   ${r.spearmanRaw.toFixed(3)}   ${r.spearmanNaive.toFixed(3)}   ${r.spearmanNormalized.toFixed(3)}     ${pct(r.normalizedWins).padStart(5)}        ${r.top5Raw.toFixed(2)} / ${r.top5Naive.toFixed(2)} / ${r.top5Normalized.toFixed(2)}`,
	);
}

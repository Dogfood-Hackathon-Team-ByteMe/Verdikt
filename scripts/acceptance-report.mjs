/**
 * Write acceptance-report.txt: the official DOGFOOD checker first, then our
 * own 295-test suite underneath it.
 *
 *   npm run acceptance            (from the repo root)
 *
 * Part 1 is `python3 run.py .dogfood.toml`, the organisers' checker. It probes
 * the LIVE portal named in .dogfood.toml, so `docker compose up` must be
 * running, fixtures imported and cookies fresh (see README "Verify it
 * yourself"). run.py and fixtures.json are the organisers' files and are not
 * committed; drop them in the repo root.
 *
 * Part 2 is tests/backend/all.mjs. run.py only has T1/T2 probes, so this suite
 * is the proof for T3 and T4. It needs no running stack: every suite starts
 * its own throwaway MongoDB.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(ROOT, 'acceptance-report.txt');
const RULE = '#'.repeat(70);

/** run.py's output, or a line explaining why there is none. */
function officialChecker() {
    if (!existsSync(join(ROOT, 'run.py'))) {
        return 'run.py was not found in the repo root, so the official checker was not run.\n';
    }
    // `python3` is the documented name; on Windows it is often only `python`.
    for (const python of ['python3', 'python']) {
        const res = spawnSync(python, ['run.py', '.dogfood.toml'], { cwd: ROOT, encoding: 'utf8' });
        if (res.status === 0 && res.stdout.includes('acceptance report')) return res.stdout;
    }
    return 'Could not run run.py: no working python3 or python on PATH.\n';
}

const official = officialChecker();
process.stdout.write(official);

const suiteFile = join(tmpdir(), `verdikt-suite-${process.pid}.txt`);
const suite = spawnSync(process.execPath, [join(ROOT, 'tests', 'backend', 'all.mjs'), '--report', suiteFile], {
    stdio: 'inherit',
});
const suiteText = existsSync(suiteFile) ? readFileSync(suiteFile, 'utf8') : 'The suite did not write a report.\n';
rmSync(suiteFile, { force: true });

writeFileSync(
    REPORT,
    [
        RULE,
        '# PART 1 -- Official DOGFOOD 2026 checker: python3 run.py .dogfood.toml',
        '# Probes the live portal. run.py has T1/T2 checks only, so it cannot',
        '# verify T3/T4; that proof is Part 2.',
        RULE,
        '',
        official.trimEnd(),
        '',
        '',
        RULE,
        '# PART 2 -- Verdikt acceptance suite: node tests/backend/all.mjs',
        '# HTTP-level tests for every tier, each against a throwaway MongoDB.',
        RULE,
        '',
        suiteText.trimEnd(),
        '',
    ].join('\n'),
    'utf8',
);
console.log(`\nReport written to ${REPORT}`);

process.exit(suite.status ?? 1);

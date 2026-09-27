/**
 * Runs every suite in one process and, with `--report <path>`, writes the
 * combined output to a file. That file is acceptance-report.txt, a T1
 * deliverable: the spec calls the acceptance report "your receipt".
 *
 *   node tests/all.mjs
 *   node tests/all.mjs --report ../acceptance-report.txt
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SUITES = [
    ['Authentication and sessions', 'tests/stageB.auth.mjs'],
    ['Tier 1 feature set', 'tests/stageC.t1.mjs'],
    ['Seeded portal (docker compose equivalent)', 'tests/stageD.seed.mjs'],
    ['Regression: previously broken behaviour', 'tests/stageE.regression.mjs'],
];

const reportFlag = process.argv.indexOf('--report');
const reportPath = reportFlag !== -1 ? process.argv[reportFlag + 1] : null;

/** Run one suite as a child process; each needs its own MongoDB instance. */
function runSuite(file) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (d) => {
            out += d;
            process.stdout.write(d);
        });
        child.stderr.on('data', (d) => {
            out += d;
            process.stderr.write(d);
        });
        child.on('close', (code) => resolve({ code, out }));
    });
}

const lines = [];
const say = (text) => {
    console.log(text);
    lines.push(text);
};

say('Verdikt acceptance report');
say(`Generated: ${new Date().toISOString()}`);
say(`Node: ${process.version}`);
say('Tier claimed: 1');
say('');
say('Each suite drives the real Express app over HTTP against a throwaway');
say('MongoDB replica set. No service is called directly, so every role check');
say('below is verified at the API level rather than in the UI.');

let totalPassed = 0;
let totalFailed = 0;

for (const [name, file] of SUITES) {
    say('');
    say('='.repeat(70));
    say(name);
    say('='.repeat(70));

    const { out } = await runSuite(file);
    for (const line of out.split('\n')) lines.push(line.replace(/\r$/, ''));

    const summary = out.match(/(\d+) passed, (\d+) failed/);
    if (summary) {
        totalPassed += Number(summary[1]);
        totalFailed += Number(summary[2]);
    } else {
        // A suite that crashed before printing a summary still counts as failed.
        totalFailed += 1;
        lines.push('SUITE DID NOT REPORT A SUMMARY (crashed before finishing)');
    }
}

say('');
say('='.repeat(70));
say(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
say(totalFailed === 0 ? 'RESULT: Tier 1 acceptance PASSED' : 'RESULT: FAILED');
say('='.repeat(70));

if (reportPath) {
    writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');
    console.log(`\nReport written to ${reportPath}`);
}

process.exit(totalFailed === 0 ? 0 : 1);

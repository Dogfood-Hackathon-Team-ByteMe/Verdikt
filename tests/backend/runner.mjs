/**
 * A very small test runner: describe/it/expect with no dependencies.
 *
 * Node's own test runner would do, but this prints the plain grouped pass/fail
 * list that goes into acceptance-report.txt, which is a T1 deliverable.
 */

const groups = [];
let current = null;

export function describe(name, fn) {
    current = { name, tests: [] };
    groups.push(current);
    fn();
    current = null;
}

export function it(name, fn) {
    if (!current) throw new Error('it() must be called inside describe()');
    current.tests.push({ name, fn });
}

/** Assertions. Each throws an Error whose message names the mismatch. */
export function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        },
        toEqual(expected) {
            const a = JSON.stringify(actual);
            const b = JSON.stringify(expected);
            if (a !== b) throw new Error(`expected ${b}, got ${a}`);
        },
        toBeTruthy() {
            if (!actual) throw new Error(`expected a truthy value, got ${JSON.stringify(actual)}`);
        },
        toBeFalsy() {
            if (actual) throw new Error(`expected a falsy value, got ${JSON.stringify(actual)}`);
        },
        toBeDefined() {
            if (actual === undefined || actual === null) throw new Error('expected a value, got none');
        },
        toContain(needle) {
            if (!String(actual).includes(needle)) throw new Error(`expected "${actual}" to contain "${needle}"`);
        },
        toHaveLength(n) {
            const len = actual ? actual.length : 0;
            if (len !== n) throw new Error(`expected length ${n}, got ${len}`);
        },
        /** For status codes: assert membership in a small set. */
        toBeOneOf(list) {
            if (!list.includes(actual)) throw new Error(`expected one of ${JSON.stringify(list)}, got ${JSON.stringify(actual)}`);
        },
    };
}

/**
 * Run every registered group in order. `beforeEach` runs before each test,
 * used to wipe the database so groups cannot bleed into each other.
 */
export async function run({ beforeEach } = {}) {
    const lines = [];
    let passed = 0;
    let failed = 0;

    const emit = (text) => {
        console.log(text);
        lines.push(text);
    };

    for (const group of groups) {
        emit(`\n${group.name}`);
        for (const test of group.tests) {
            try {
                if (beforeEach) await beforeEach();
                await test.fn();
                emit(`  PASS  ${test.name}`);
                passed++;
            } catch (error) {
                emit(`  FAIL  ${test.name}`);
                emit(`        ${error.message}`);
                failed++;
            }
        }
    }

    emit(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
    return { passed, failed, lines };
}

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  baselineRed,
  classify,
  classifyCheck,
  renderTable,
  uniqueChecks,
  validateManifest,
  type Mutant,
} from './lib';

const good: Mutant = {
  id: 'run-order/01',
  area: 'run-order',
  patch: 'run-order/01.patch',
  rationale: 'swapped comparator',
  checks: ['pnpm vitest run a.test.ts'],
  kind: 'local',
};

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest([good], () => true)).toEqual([]);
  });
  it('rejects a missing patch file, duplicate ids, empty checks and a ci mutant without a note', () => {
    const errors = validateManifest(
      [good, good, { ...good, id: 'b', checks: [] }, { ...good, id: 'c', kind: 'ci' }],
      p => p !== 'missing'
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate id'),
        expect.stringContaining('checks must be a non-empty list'),
        expect.stringContaining('a ci mutant needs a note'),
      ])
    );
    expect(validateManifest([{ ...good, patch: 'missing' }], p => p !== 'missing')).toEqual([
      expect.stringContaining('patch file not found: missing'),
    ]);
  });
  it('rejects a non-array manifest', () => {
    expect(validateManifest({}, () => true)).toEqual(['manifest must be an array']);
  });
});


const report = (failed: number, total: number) =>
  JSON.stringify({ numFailedTests: failed, numTotalTests: total });
const res = (r: string | null, extra = {}) => ({ command: 'a', report: r, ...extra });

describe('classifyCheck (JSON report only)', () => {
  it('a failed test is caught', () => {
    expect(classifyCheck(res(report(1, 5)))).toBe('caught');
  });
  it('all tests passing is pass', () => {
    expect(classifyCheck(res(report(0, 5)))).toBe('pass');
  });
  it('zero tests is an error', () => {
    expect(classifyCheck(res(report(0, 0)))).toBe('error');
  });
  it('a missing report (worker exited unexpectedly, crash) is an error', () => {
    expect(classifyCheck(res(null))).toBe('error');
  });
  it('an unparsable or malformed report is an error', () => {
    expect(classifyCheck(res('{not json'))).toBe('error');
    expect(classifyCheck(res('{}'))).toBe('error');
    expect(classifyCheck(res('null'))).toBe('error');
  });
  it('a timeout or signal is an error even with a failing report', () => {
    expect(classifyCheck(res(report(1, 5), { timedOut: true }))).toBe('error');
    expect(classifyCheck(res(report(1, 5), { signal: 'SIGKILL' }))).toBe('error');
  });
});

describe('classify / baselineRed', () => {
  it('caught beats error; error beats missed', () => {
    expect(classify([res(null), res(report(1, 2))])).toBe('caught');
    expect(classify([res(report(0, 2)), res(null)])).toBe('error');
    expect(classify([res(report(0, 2))])).toBe('missed');
  });
  it('baseline flags anything that is not a passing report with tests', () => {
    const bad = [res(null), res(report(0, 0)), res(report(2, 3))];
    expect(baselineRed([res(report(0, 3)), ...bad])).toEqual(bad);
  });
});

describe('isVitestCheck / manifest', () => {
  it('accepts vitest runs and rejects anything else for a local mutant', () => {
    expect(isVitestCheck('pnpm vitest run a.test.ts')).toBe(true);
    expect(isVitestCheck('cd packages/ringside && pnpm vitest run src/a.test.ts')).toBe(true);
    expect(isVitestCheck('pnpm test')).toBe(false);
    expect(isVitestCheck('pnpm vitest run a.test.ts && echo ok')).toBe(false);
    const errors = validateManifest([{ ...good, checks: ['pnpm test'] }], () => true);
    expect(errors).toEqual([expect.stringContaining('local check must be a vitest run')]);
  });
});

describe('uniqueChecks / renderTable', () => {
  it('dedupes local checks only and renders CAUGHT, MISSED, ERROR and CI rows distinctly', () => {
    const ci: Mutant = { ...good, id: 'sql', kind: 'ci', note: 'CI only', checks: ['psql x'] };
    expect(uniqueChecks([good, { ...good, id: 'b' }, ci])).toEqual(['pnpm vitest run a.test.ts']);
    const row = (id: string, verdict: Row['verdict']): Row => ({
      mutant: { ...good, id },
      verdict,
      caughtBy: [],
    });
    const lines = renderTable([
      row('c', 'caught'),
      row('m', 'missed'),
      row('e', 'error'),
      { mutant: ci, verdict: 'ci-run', caughtBy: [] },
    ]).split('\n');
    expect(lines.find(l => l.includes('| c:'))).toContain('CAUGHT');
    expect(lines.find(l => l.includes('| m:'))).toContain('MISSED');
    const errorRow = lines.find(l => l.includes('| e:'))!;
    expect(errorRow).toContain('ERROR');
    expect(errorRow).not.toContain('MISSED');
    expect(lines.find(l => l.includes('| sql:'))).toContain('CI-run (not run locally)');
  });
});

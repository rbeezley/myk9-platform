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

describe('classify', () => {
  it('is caught when any check exits non-zero, missed when all pass', () => {
    expect(
      classify([
        { command: 'a', exitCode: 0 },
        { command: 'b', exitCode: 1 },
      ])
    ).toBe('caught');
    expect(classify([{ command: 'a', exitCode: 0 }])).toBe('missed');
  });
});

describe('baselineRed', () => {
  it('returns the checks that are already red on the clean tree', () => {
    expect(
      baselineRed([
        { command: 'a', exitCode: 0 },
        { command: 'b', exitCode: 2 },
      ])
    ).toEqual([{ command: 'b', exitCode: 2 }]);
    expect(baselineRed([{ command: 'a', exitCode: 0 }])).toEqual([]);
  });
});

describe('uniqueChecks / renderTable', () => {
  it('dedupes local checks only and renders ci mutants as not run', () => {
    const ci: Mutant = { ...good, id: 'sql', kind: 'ci', note: 'CI only', checks: ['psql x'] };
    expect(uniqueChecks([good, { ...good, id: 'b' }, ci])).toEqual(['pnpm vitest run a.test.ts']);
    const table = renderTable([
      { mutant: good, verdict: 'missed', caughtBy: [] },
      { mutant: ci, verdict: 'ci-run', caughtBy: [] },
    ]);
    expect(table).toContain('MISSED');
    expect(table).toContain('CI-run (not run locally)');
  });
});

describe('classifyCheck', () => {
  it('exit 1 with assertion output is caught', () => {
    expect(
      classifyCheck({ command: 'a', exitCode: 1, output: 'AssertionError: expected 1 to be 2' })
    ).toBe('caught');
  });
  it('127 and 126 are errors', () => {
    expect(classifyCheck({ command: 'a', exitCode: 127 })).toBe('error');
    expect(classifyCheck({ command: 'a', exitCode: 126 })).toBe('error');
  });
  it('a timeout or signal kill is an error', () => {
    expect(classifyCheck({ command: 'a', exitCode: null, signal: 'SIGTERM', timedOut: true })).toBe(
      'error'
    );
    expect(classifyCheck({ command: 'a', exitCode: 1, timedOut: true })).toBe('error');
  });
  it('output showing the run never reached assertions is an error', () => {
    for (const output of [
      'No test files found, exiting with code 1',
      'Transform failed with 1 error',
      'SyntaxError: Unexpected token',
    ]) {
      expect(classifyCheck({ command: 'a', exitCode: 1, output })).toBe('error');
    }
  });
  it('a clean exit is a pass', () => {
    expect(classifyCheck({ command: 'a', exitCode: 0 })).toBe('pass');
  });
  it('classify: error only when no check caught it; baselineRed includes crashes', () => {
    const caught = { command: 'a', exitCode: 1, output: 'AssertionError' };
    const crash = { command: 'b', exitCode: 127 };
    expect(classify([crash])).toBe('error');
    expect(classify([crash, caught])).toBe('caught');
    expect(classify([{ command: 'c', exitCode: 0 }, crash])).toBe('error');
    expect(baselineRed([crash])).toEqual([crash]);
  });
});

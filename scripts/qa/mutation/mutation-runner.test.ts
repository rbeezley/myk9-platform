import { describe, expect, it, vi } from 'vitest';
import {
  BREAK_THRESHOLD,
  exitCodeFor,
  formatSummaryTable,
  runAllTargets,
  scoreFromReport,
} from './mutation-runner';

const targets = ['a', 'b', 'c'];

describe('runAllTargets', () => {
  it('all pass: runs every target and exits 0', () => {
    const spawn = vi.fn<(target: string) => number>(() => 0);
    const results = runAllTargets(targets, { spawn, readScore: () => 90, log: () => {} });
    expect(spawn.mock.calls.map(c => c[0])).toEqual(targets);
    expect(exitCodeFor(results)).toBe(0);
  });

  it('first fails, later pass: still runs all and exits 1', () => {
    const spawn = vi.fn<(target: string) => number>(t => (t === 'a' ? 1 : 0));
    const results = runAllTargets(targets, {
      spawn,
      readScore: t => (t === 'a' ? 39.74 : 85),
      log: () => {},
    });
    expect(spawn.mock.calls.map(c => c[0])).toEqual(targets);
    expect(results.map(r => r.passed)).toEqual([false, true, true]);
    expect(exitCodeFor(results)).toBe(1);
  });

  it('unreadable score counts as failed and the row says so', () => {
    const results = runAllTargets(['a'], { spawn: () => 0, readScore: () => null, log: () => {} });
    expect(exitCodeFor(results)).toBe(1);
    expect(formatSummaryTable(results)).toContain('| a | unreadable');
  });

  it('a signal-killed spawn (null status) fails', () => {
    const results = runAllTargets(['a'], { spawn: () => null, readScore: () => 99, log: () => {} });
    expect(exitCodeFor(results)).toBe(1);
  });
});

describe('formatSummaryTable', () => {
  it('prints target, score, threshold and result', () => {
    const results = runAllTargets(['a', 'b'], {
      spawn: t => (t === 'a' ? 1 : 0),
      readScore: t => (t === 'a' ? 39.74 : 80),
      log: () => {},
    });
    const table = formatSummaryTable(results);
    expect(table).toContain(`| a | 39.74% | ${BREAK_THRESHOLD}% | FAIL |`);
    expect(table).toContain(`| b | 80.00% | ${BREAK_THRESHOLD}% | pass |`);
  });
});

describe('scoreFromReport', () => {
  it('counts killed+timeout over killed+timeout+survived+nocoverage', () => {
    const report = {
      files: {
        'x.ts': {
          mutants: [
            { status: 'Killed' },
            { status: 'Timeout' },
            { status: 'Survived' },
            { status: 'NoCoverage' },
            { status: 'CompileError' },
            { status: 'Ignored' },
          ],
        },
      },
    };
    expect(scoreFromReport(report)).toBe(50);
  });
  it('returns null for malformed or empty reports', () => {
    expect(scoreFromReport({})).toBeNull();
    expect(scoreFromReport({ files: {} })).toBeNull();
  });
});

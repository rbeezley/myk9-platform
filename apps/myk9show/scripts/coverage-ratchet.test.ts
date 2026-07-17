import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  compareCoverageToBaseline,
  readBaseline,
  readCoverageSummary,
  renderComparison,
  runCli,
  writeBaseline,
} from './coverage-ratchet';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('compareCoverageToBaseline', () => {
  it('flags a metric that drops below baseline', () => {
    expect(
      compareCoverageToBaseline(
        { lines: 74.5, statements: 74.87, branches: 76.61, functions: 73.52 },
        { lines: 75.14, statements: 74.87, branches: 76.61, functions: 73.52 }
      ).violations
    ).toEqual([{ metric: 'lines', actual: 74.5, baseline: 75.14 }]);
  });

  it('ignores drift within tolerance', () => {
    const comparison = compareCoverageToBaseline(
      { lines: 75.1, statements: 74.87, branches: 76.61, functions: 73.52 },
      { lines: 75.14, statements: 74.87, branches: 76.61, functions: 73.52 }
    );

    expect(comparison.violations).toEqual([]);
    expect(comparison.improvements).toEqual([]);
  });

  it('records improvements above baseline', () => {
    const comparison = compareCoverageToBaseline(
      { lines: 80, statements: 74.87, branches: 76.61, functions: 73.52 },
      { lines: 75.14, statements: 74.87, branches: 76.61, functions: 73.52 }
    );

    expect(comparison.improvements).toEqual([{ metric: 'lines', actual: 80, baseline: 75.14 }]);
    expect(comparison.violations).toEqual([]);
  });

  it('flags multiple regressed metrics independently', () => {
    const comparison = compareCoverageToBaseline(
      { lines: 60, statements: 60, branches: 76.61, functions: 73.52 },
      { lines: 75.14, statements: 74.87, branches: 76.61, functions: 73.52 }
    );

    expect(comparison.violations.map(v => v.metric).sort()).toEqual(['lines', 'statements']);
  });
});

describe('renderComparison', () => {
  it('tells maintainers how to raise improved baselines', () => {
    const comparison = compareCoverageToBaseline(
      { lines: 80, statements: 74.87, branches: 76.61, functions: 73.52 },
      { lines: 75.14, statements: 74.87, branches: 76.61, functions: 73.52 }
    );

    expect(
      renderComparison({
        comparison,
        metrics: { lines: 80, statements: 74.87, branches: 76.61, functions: 73.52 },
      })
    ).toContain('pnpm coverage:ratchet:update');
  });

  it('reports regressions with actual vs baseline percentages', () => {
    const comparison = compareCoverageToBaseline(
      { lines: 60, statements: 74.87, branches: 76.61, functions: 73.52 },
      { lines: 75.14, statements: 74.87, branches: 76.61, functions: 73.52 }
    );

    const rendered = renderComparison({
      comparison,
      metrics: { lines: 60, statements: 74.87, branches: 76.61, functions: 73.52 },
    });

    expect(rendered).toContain('lines: 60.00% is below baseline 75.14%');
  });
});

describe('readCoverageSummary', () => {
  it('extracts the four headline metrics from an istanbul json-summary report', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'coverage-ratchet-'));
    const summaryPath = join(rootDir, 'coverage-summary.json');

    try {
      writeFileSync(
        summaryPath,
        JSON.stringify({
          total: {
            lines: { total: 100, covered: 75, skipped: 0, pct: 75.14 },
            statements: { total: 100, covered: 74, skipped: 0, pct: 74.87 },
            branches: { total: 100, covered: 76, skipped: 0, pct: 76.61 },
            functions: { total: 100, covered: 73, skipped: 0, pct: 73.52 },
          },
        })
      );

      expect(readCoverageSummary(summaryPath)).toEqual({
        lines: 75.14,
        statements: 74.87,
        branches: 76.61,
        functions: 73.52,
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when the summary has no "total" key', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'coverage-ratchet-'));
    const summaryPath = join(rootDir, 'coverage-summary.json');

    try {
      writeFileSync(summaryPath, JSON.stringify({ 'src/foo.ts': {} }));

      expect(() => readCoverageSummary(summaryPath)).toThrow(/no "total" key/);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe('runCli', () => {
  function writeFixtureTree(rootDir: string, metrics: Record<string, number>) {
    const summaryDir = join(rootDir, 'coverage');
    mkdirSync(summaryDir, { recursive: true });
    writeFileSync(
      join(summaryDir, 'coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { total: 100, covered: metrics.lines, skipped: 0, pct: metrics.lines },
          statements: {
            total: 100,
            covered: metrics.statements,
            skipped: 0,
            pct: metrics.statements,
          },
          branches: { total: 100, covered: metrics.branches, skipped: 0, pct: metrics.branches },
          functions: {
            total: 100,
            covered: metrics.functions,
            skipped: 0,
            pct: metrics.functions,
          },
        },
      })
    );

    const scriptsDir = join(rootDir, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
  }

  it('exits 0 and reports no regressions when coverage matches baseline', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'coverage-ratchet-cli-'));

    try {
      writeFixtureTree(rootDir, {
        lines: 75.14,
        statements: 74.87,
        branches: 76.61,
        functions: 73.52,
      });
      writeBaseline(join(rootDir, 'scripts/coverage-ratchet.baseline.json'), {
        lines: 75.14,
        statements: 74.87,
        branches: 76.61,
        functions: 73.52,
      });

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const exitCode = runCli([], rootDir);

      expect(exitCode).toBe(0);
      logSpy.mockRestore();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('exits 1 when line coverage drops below the recorded baseline', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'coverage-ratchet-cli-'));

    try {
      writeFixtureTree(rootDir, {
        lines: 60,
        statements: 74.87,
        branches: 76.61,
        functions: 73.52,
      });
      writeBaseline(join(rootDir, 'scripts/coverage-ratchet.baseline.json'), {
        lines: 75.14,
        statements: 74.87,
        branches: 76.61,
        functions: 73.52,
      });

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const exitCode = runCli([], rootDir);

      expect(exitCode).toBe(1);
      logSpy.mockRestore();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('writes the baseline and exits 0 with --update-baseline', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'coverage-ratchet-cli-'));

    try {
      writeFixtureTree(rootDir, {
        lines: 80,
        statements: 74.87,
        branches: 76.61,
        functions: 73.52,
      });

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const exitCode = runCli(['--update-baseline'], rootDir);
      logSpy.mockRestore();

      expect(exitCode).toBe(0);

      const written = readBaseline(join(rootDir, 'scripts/coverage-ratchet.baseline.json'));
      expect(written.metrics).toEqual({
        lines: 80,
        statements: 74.87,
        branches: 76.61,
        functions: 73.52,
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('errors gracefully when the coverage summary is missing', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'coverage-ratchet-cli-'));
    mkdirSync(join(rootDir, 'scripts'), { recursive: true });

    try {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const exitCode = runCli([], rootDir);

      expect(exitCode).toBe(1);
      errorSpy.mockRestore();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

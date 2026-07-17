#!/usr/bin/env node
/**
 * Coverage Ratchet (MYK9-40)
 *
 * Fails a PR when line coverage (and the other three headline metrics) drops
 * below the recorded baseline for myK9Show. Mirrors the shape of
 * scripts/qa/code-quality-ratchet.ts at the repo root: a committed baseline
 * JSON, a pure compare function, and a CLI with an `--update-baseline` escape
 * hatch for intentional (improving) baseline moves.
 *
 * Input is a `coverage-summary.json` produced by the `json-summary` vitest/
 * istanbul reporter (v8 provider). In CI this is the report merged from all
 * three `test-show` shards via `vitest --mergeReports` (see
 * .github/workflows/ci.yml), so the ratchet always compares against the same
 * "whole app" coverage the shards jointly produce — not a single shard's
 * partial view.
 *
 * RATCHET UP ONLY — never lower a baseline to make a regression pass; run
 * `pnpm coverage:ratchet:update` after a legitimate coverage improvement.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type CoverageMetricName = 'lines' | 'statements' | 'branches' | 'functions';

export type CoverageMetrics = Record<CoverageMetricName, number>;

export type CoverageRatchetFinding = {
  metric: CoverageMetricName;
  actual: number;
  baseline: number;
};

export type CoverageRatchetComparison = {
  violations: CoverageRatchetFinding[];
  improvements: CoverageRatchetFinding[];
};

export type CoverageRatchetBaseline = {
  version: 1;
  updatedAt: string;
  metrics: CoverageMetrics;
};

export type IstanbulCoverageSummaryTotals = {
  lines: { pct: number };
  statements: { pct: number };
  branches: { pct: number };
  functions: { pct: number };
};

export type IstanbulCoverageSummary = {
  total: IstanbulCoverageSummaryTotals;
};

// Percentage-point tolerance. v8 coverage pct can wobble by fractions of a
// point between otherwise-identical runs (float rounding across merged
// blobs); this keeps the ratchet from flapping on noise while still catching
// real regressions.
const DRIFT_TOLERANCE_PCT = 0.05;

export const DEFAULT_SUMMARY_PATH = 'coverage/coverage-summary.json';
export const DEFAULT_BASELINE_PATH = 'scripts/coverage-ratchet.baseline.json';

export function readCoverageSummary(path: string): CoverageMetrics {
  const summary = JSON.parse(readFileSync(path, 'utf8')) as IstanbulCoverageSummary;

  if (!summary.total) {
    throw new Error(`${path} has no "total" key — is this a json-summary coverage report?`);
  }

  return {
    lines: summary.total.lines.pct,
    statements: summary.total.statements.pct,
    branches: summary.total.branches.pct,
    functions: summary.total.functions.pct,
  };
}

export function compareCoverageToBaseline(
  actual: CoverageMetrics,
  baseline: CoverageMetrics,
  tolerance = DRIFT_TOLERANCE_PCT
): CoverageRatchetComparison {
  const violations: CoverageRatchetFinding[] = [];
  const improvements: CoverageRatchetFinding[] = [];

  for (const metric of Object.keys(baseline) as CoverageMetricName[]) {
    const actualPct = actual[metric];
    const baselinePct = baseline[metric];
    const delta = actualPct - baselinePct;

    if (delta < -tolerance) {
      violations.push({ metric, actual: actualPct, baseline: baselinePct });
    } else if (delta > tolerance) {
      improvements.push({ metric, actual: actualPct, baseline: baselinePct });
    }
  }

  return { violations, improvements };
}

export function renderComparison({
  comparison,
  metrics,
}: {
  comparison: CoverageRatchetComparison;
  metrics: CoverageMetrics;
}) {
  const lines = ['Coverage ratchet (myK9Show):', ''];

  for (const [metric, actual] of Object.entries(metrics)) {
    lines.push(`- ${metric}: ${actual.toFixed(2)}%`);
  }

  if (comparison.violations.length > 0) {
    lines.push('', 'Regressions (coverage dropped vs baseline):');
    for (const violation of comparison.violations) {
      lines.push(
        `- ${violation.metric}: ${violation.actual.toFixed(2)}% is below baseline ${violation.baseline.toFixed(2)}%`
      );
    }
  }

  if (comparison.improvements.length > 0) {
    lines.push('', 'Improvements above baseline:');
    for (const improvement of comparison.improvements) {
      lines.push(
        `- ${improvement.metric}: ${improvement.actual.toFixed(2)}% is above baseline ${improvement.baseline.toFixed(2)}%`
      );
    }
    lines.push('', 'Run `pnpm coverage:ratchet:update` to raise the recorded baseline.');
  }

  return `${lines.join('\n')}\n`;
}

export function readBaseline(path: string): CoverageRatchetBaseline {
  return JSON.parse(readFileSync(path, 'utf8')) as CoverageRatchetBaseline;
}

export function writeBaseline(path: string, metrics: CoverageMetrics) {
  const baseline: CoverageRatchetBaseline = {
    version: 1,
    updatedAt: new Date().toISOString(),
    metrics,
  };

  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

export function resolveSummaryPath(args: string[]) {
  return args.find(arg => arg.startsWith('--summary='))?.split('=')[1] ?? DEFAULT_SUMMARY_PATH;
}

export function resolveBaselinePath(args: string[]) {
  return args.find(arg => arg.startsWith('--baseline='))?.split('=')[1] ?? DEFAULT_BASELINE_PATH;
}

export function resolveRootDir(args: string[], cwd = process.cwd()) {
  return args.find(arg => arg.startsWith('--root='))?.split('=')[1] ?? cwd;
}

export function shouldUpdateBaseline(args: string[]) {
  return args.includes('--update-baseline');
}

export function runCli(args: string[] = process.argv.slice(2), rootDir = resolveRootDir(args)) {
  const summaryPath = join(rootDir, resolveSummaryPath(args));
  const baselinePath = join(rootDir, resolveBaselinePath(args));

  if (!existsSync(summaryPath)) {
    console.error(
      `${summaryPath} not found. Run coverage with the json-summary reporter first ` +
        `(e.g. \`pnpm test:coverage -- --coverage.reporter=json-summary\`).`
    );
    return 1;
  }

  const metrics = readCoverageSummary(summaryPath);

  if (shouldUpdateBaseline(args)) {
    writeBaseline(baselinePath, metrics);
    console.log(`Updated ${baselinePath}`);
    return 0;
  }

  const baseline = readBaseline(baselinePath);
  const comparison = compareCoverageToBaseline(metrics, baseline.metrics);
  console.log(renderComparison({ comparison, metrics }));

  if (comparison.violations.length > 0) {
    return 1;
  }

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runCli();
}

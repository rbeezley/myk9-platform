import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGhaExpression, topLevelAndOperands, type GhaExpr } from './ghaExpressionParser';

/**
 * MYK9-520: `smoke-build`, `A11y smoke` and `E2E PR Smoke` used to carry
 * `github.actor != 'dependabot[bot]'`, so every Dependabot PR skipped all
 * three browser-level jobs, including a React renderer bump that reached main
 * with no rendered-app test. The Dependabot-scope secrets these jobs need are
 * registered (verified 2026-09-25), so the skip is gone: Dependabot PRs run
 * the browser jobs like any other PR. This file pins that:
 *
 * - no browser job's `if:` excludes the dependabot actor, in any shape;
 * - each still gates on the enabled/scope preconditions;
 * - each keeps its actor-gated "Verify Dependabot-run secrets are available"
 *   step, so a secret missing from the Dependabot scope fails loudly instead
 *   of building against an empty value;
 * - smoke scope counts the root package.json and pnpm-lock.yaml as runtime
 *   changes, so a transitive-only bump still gets browser coverage.
 *
 * The `if:` checks parse the real boolean structure with a tiny GHA-expression
 * parser (`./ghaExpressionParser.ts`) instead of pattern-matching text.
 */
const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../../../.github/workflows/ci.yml'),
  'utf8'
);

const BROWSER_JOBS = ['smoke-build:', 'a11y:', 'e2e-myk9show:'];

/** The lines of one job, from its `<name>:` heading at 2-space indent to the next job. */
function jobBlock(jobHeading: string, source: string = workflow): string[] {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `  ${jobHeading}`);
  expect(start, `job "${jobHeading}" not found in workflow`).toBeGreaterThan(-1);
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}\S.*:$/.test(lines[i] ?? '')) break;
    block.push(lines[i] ?? '');
  }
  return block;
}

/** The job-level `if:` value (4-space indent), not a step's. */
function ifExpressionForJob(jobHeading: string, source: string = workflow): string {
  const line = jobBlock(jobHeading, source).find(l => /^ {4}if:/.test(l));
  if (!line) throw new Error(`job "${jobHeading}" has no if: line`);
  return line.trimStart().slice('if:'.length).trim();
}

/** True if `node` is an atom whose text contains `substring`. */
function isAtomContaining(node: GhaExpr, substring: string): boolean {
  return node.type === 'atom' && node.text.includes(substring);
}

/** Recursively true if any atom under `node` contains `substring`. */
function containsText(node: GhaExpr, substring: string): boolean {
  switch (node.type) {
    case 'atom':
      return node.text.includes(substring);
    case 'group':
      return containsText(node.inner, substring);
    case 'and':
    case 'or':
      return node.operands.some(op => containsText(op, substring));
  }
}

/** True if any atom anywhere under `node` excludes the dependabot actor. */
function excludesDependabot(node: GhaExpr): boolean {
  return containsText(node, "github.actor != 'dependabot[bot]'");
}

describe('Browser smoke runs on Dependabot PRs (MYK9-520)', () => {
  it.each(BROWSER_JOBS)('%s: its if: never excludes the dependabot actor', jobHeading => {
    const expr = parseGhaExpression(ifExpressionForJob(jobHeading));
    expect(excludesDependabot(expr)).toBe(false);
  });

  it.each(BROWSER_JOBS)('%s still gates on the smoke-scope/enabled preconditions', jobHeading => {
    const expr = parseGhaExpression(ifExpressionForJob(jobHeading));
    expect(expr.type).toBe('and');
    const operands = topLevelAndOperands(expr);
    expect(operands.some(op => containsText(op, 'MYK9SHOW_SMOKE_CI_ENABLED'))).toBe(true);
    expect(operands.some(op => containsText(op, 'smoke-scope.outputs.run'))).toBe(true);
  });

  it.each(BROWSER_JOBS)(
    '%s keeps its loud Dependabot secrets check, gated on the dependabot actor',
    jobHeading => {
      const block = jobBlock(jobHeading).join('\n');
      expect(block).toContain('Verify Dependabot-run secrets are available');
      expect(block).toContain("if: github.actor == 'dependabot[bot]'");
    }
  );

  it('smoke scope treats the root package.json and pnpm-lock.yaml as runtime changes', () => {
    const scope = jobBlock('smoke-scope:').map(line => line.trim());
    expect(scope).toContain('package.json|\\');
    expect(scope).toContain('pnpm-lock.yaml|\\');
  });

  it('flags the old actor skip in any shape (positive control)', () => {
    const oldBare =
      "(github.event_name == 'push' || github.event.pull_request.draft == false) && vars.MYK9SHOW_SMOKE_CI_ENABLED == 'true' && needs.smoke-scope.outputs.run == 'true' && github.actor != 'dependabot[bot]'";
    const oldLabelEscape =
      "(github.event_name == 'push' || github.event.pull_request.draft == false) && vars.MYK9SHOW_SMOKE_CI_ENABLED == 'true' && needs.smoke-scope.outputs.run == 'true' && (github.actor != 'dependabot[bot]' || (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'run-smoke')))";
    expect(excludesDependabot(parseGhaExpression(oldBare))).toBe(true);
    expect(excludesDependabot(parseGhaExpression(oldLabelEscape))).toBe(true);
  });

  it('dependabot.yml documents the Dependabot-scope secrets the jobs rely on', () => {
    const dependabotConfig = readFileSync(
      resolve(import.meta.dirname, '../../../../../.github/dependabot.yml'),
      'utf8'
    );
    expect(dependabotConfig).toContain('MYK9-520');
    expect(dependabotConfig).toContain('variables -> Dependabot');
  });
});

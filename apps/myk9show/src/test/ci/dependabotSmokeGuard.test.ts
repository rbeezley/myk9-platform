import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGhaExpression, topLevelAndOperands, type GhaExpr } from './ghaExpressionParser';

/**
 * MYK9-520: `smoke-build`, `A11y smoke` and `E2E PR Smoke` each carry
 * `github.actor != 'dependabot[bot]'`, so before this fix every Dependabot PR
 * skipped all three browser-level jobs unconditionally — with no way for a
 * maintainer to force real coverage on a dependency bump that touches runtime
 * code. The `run-smoke` label (read by `smoke-scope`, ci.yml:~40) is the
 * escape hatch: it must sit ANDed alongside the actor check as ONE operand of
 * the job's top-level `&&` chain (`... && (actor-ok || run-smoke-label)`),
 * not loose at the top level (`... && actor-ok || run-smoke-label`) — the
 * second form lets a labelled PR bypass the enabled/scope/draft gates too,
 * since `&&` binds tighter than `||`.
 *
 * A substring/text check cannot tell these two shapes apart — both contain
 * every token the other does, just grouped differently. This file parses the
 * real boolean structure of each job's `if:` line with a tiny GHA-expression
 * parser (`./ghaExpressionParser.ts`) instead of pattern-matching text.
 */
const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../../../.github/workflows/ci.yml'),
  'utf8'
);

const BROWSER_JOBS = ['smoke-build:', 'a11y:', 'e2e-myk9show:'];

/** The `if:` value for a job, found by its `<name>:` heading at 2-space indent. */
function ifExpressionForJob(jobHeading: string, source: string = workflow): string {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `  ${jobHeading}`);
  expect(start, `job "${jobHeading}" not found in workflow`).toBeGreaterThan(-1);

  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trimStart() ?? '';
    if (trimmed.startsWith('if:')) return trimmed.slice('if:'.length).trim();
    // Stop once we reach the next top-level job (2-space indent, ends with ':').
    if (/^ {2}\S.*:$/.test(lines[i] ?? '')) break;
  }

  throw new Error(`job "${jobHeading}" has no if: line`);
}

/** True if `node` is an atom whose text contains `substring`. */
function isAtomContaining(node: GhaExpr, substring: string): boolean {
  return node.type === 'atom' && node.text.includes(substring);
}

/**
 * True if `node` is a single operand — a bare atom, or a `group` wrapping
 * exactly one — that is itself an `or` of (a) the dependabot actor check and
 * (b) something mentioning the run-smoke label. This is the shape a fourth
 * job MUST have for its actor check to be label-overridable; a bare
 * `github.actor != 'dependabot[bot]'` atom with no surrounding `or` fails
 * this, and so does an `or` that is not wrapped as a single top-level AND
 * operand (the review-finding mutation).
 */
function isActorLabelDisjunction(node: GhaExpr): boolean {
  const disjunction = node.type === 'group' ? node.inner : node;
  if (disjunction.type !== 'or') return false;
  const hasActorCheck = disjunction.operands.some(op => isAtomContaining(op, 'dependabot[bot]'));
  const hasLabelEscape = disjunction.operands.some(
    op =>
      isAtomContaining(op, 'run-smoke') || (op.type === 'group' && containsText(op, 'run-smoke'))
  );
  return hasActorCheck && hasLabelEscape;
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

/**
 * `labels:` list per `package-ecosystem` in dependabot.yml, read by indentation
 * rather than by searching the text, so a label named in a comment or under
 * another key does not count (LESSONS comment-satisfies-grep). Handles the
 * block-list shape this file uses; anything else yields no labels and fails.
 */
function dependabotLabelsByEcosystem(config: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let ecosystem: string | undefined;
  let labelsIndent: number | undefined;
  for (const raw of config.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const eco = /^\s*- package-ecosystem:\s*'?([\w-]+)'?/.exec(line);
    if (eco) {
      ecosystem = eco[1]!;
      out.set(ecosystem, []);
      labelsIndent = undefined;
      continue;
    }
    if (labelsIndent !== undefined && indent > labelsIndent) {
      const item = /^\s*-\s*'?([^']+?)'?\s*$/.exec(line);
      if (item && ecosystem) out.get(ecosystem)!.push(item[1]!);
      continue;
    }
    labelsIndent = /^\s*labels:\s*$/.test(line) ? indent : undefined;
  }
  return out;
}

describe('Dependabot actor guard cannot skip browser smoke without an override', () => {
  it.each(BROWSER_JOBS)(
    '%s: the actor/run-smoke disjunction is ONE operand of the top-level AND chain, not a top-level OR',
    jobHeading => {
      const expr = parseGhaExpression(ifExpressionForJob(jobHeading));

      // The regression this test exists to catch (review finding on
      // MYK9-520): dropping the outer parens around the actor/label
      // disjunction turns the whole expression's root into an `or`, because
      // `&&` binds tighter than `||`. A real `or` root means a labelled PR
      // bypasses vars.MYK9SHOW_SMOKE_CI_ENABLED / smoke-scope / draft-push
      // entirely -- so the root must be `and` (or, degenerately, a single
      // operand -- but every real job here has 4).
      expect(expr.type, `job "${jobHeading}" if: parsed to a top-level OR, not AND`).toBe('and');

      const operands = topLevelAndOperands(expr);
      const disjunctionOperand = operands.find(isActorLabelDisjunction);
      expect(
        disjunctionOperand,
        `job "${jobHeading}" has no single AND-operand pairing the dependabot actor check with a run-smoke escape`
      ).toBeDefined();
    }
  );

  it.each(BROWSER_JOBS)('%s still gates on the smoke-scope/enabled preconditions', jobHeading => {
    const operands = topLevelAndOperands(parseGhaExpression(ifExpressionForJob(jobHeading)));
    expect(operands.some(op => containsText(op, 'MYK9SHOW_SMOKE_CI_ENABLED'))).toBe(true);
    expect(operands.some(op => containsText(op, 'smoke-scope.outputs.run'))).toBe(true);
  });

  it('the run-smoke override checks PR labels via contains(), not just naming the label in prose', () => {
    for (const jobHeading of BROWSER_JOBS) {
      const expr = parseGhaExpression(ifExpressionForJob(jobHeading));
      const disjunctionOperand = topLevelAndOperands(expr).find(isActorLabelDisjunction);
      expect(
        disjunctionOperand &&
          containsText(
            disjunctionOperand,
            "contains(github.event.pull_request.labels.*.name, 'run-smoke')"
          )
      ).toBe(true);
    }
  });

  it('rejects a synthetic job whose actor check has no run-smoke escape at all (positive control)', () => {
    // Proves the structural checks above actually fail on the exact defect
    // they exist to prevent -- a job that re-adds a bare, unrescuable actor
    // conjunct -- rather than passing vacuously. Uses a literal fixture
    // rather than mutating ci.yml so this test can never itself be broken by
    // an unrelated future edit to the real workflow.
    const bareActorGuard =
      "(github.event_name == 'push' || github.event.pull_request.draft == false) && vars.MYK9SHOW_SMOKE_CI_ENABLED == 'true' && needs.smoke-scope.outputs.run == 'true' && github.actor != 'dependabot[bot]'";
    const expr = parseGhaExpression(bareActorGuard);
    const operands = topLevelAndOperands(expr);
    expect(operands.some(isActorLabelDisjunction)).toBe(false);
  });

  it('rejects the review-finding mutation: dropping the outer parens turns the root into an OR (positive control)', () => {
    const droppedOuterParens =
      "(github.event_name == 'push' || github.event.pull_request.draft == false) && vars.MYK9SHOW_SMOKE_CI_ENABLED == 'true' && needs.smoke-scope.outputs.run == 'true' && github.actor != 'dependabot[bot]' || (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'run-smoke'))";
    const expr = parseGhaExpression(droppedOuterParens);
    expect(expr.type).toBe('or');
  });

  it('every Dependabot update applies the run-smoke label to the PRs it opens', () => {
    const labels = dependabotLabelsByEcosystem(
      readFileSync(resolve(import.meta.dirname, '../../../../../.github/dependabot.yml'), 'utf8')
    );
    // Both ecosystems are present, so a missing label below is a real gap,
    // not a parse that found nothing.
    expect([...labels.keys()].sort()).toEqual(['github-actions', 'npm']);
    for (const [ecosystem, list] of labels) {
      expect(list, `${ecosystem} update does not label its PRs run-smoke`).toContain('run-smoke');
    }
  });

  it('reads labels structurally: a commented-out or mis-indented label does not count (positive control)', () => {
    const config = [
      'updates:',
      "  - package-ecosystem: 'npm'",
      '    labels:',
      "      - 'dependencies'",
      "      # - 'run-smoke'",
      '    groups:',
      '      npm:',
      '        patterns:',
      "          - 'run-smoke'",
    ].join('\n');
    expect(dependabotLabelsByEcosystem(config).get('npm')).toEqual(['dependencies']);
  });
});

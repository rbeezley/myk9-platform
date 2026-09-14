import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-520: `smoke-build`, `A11y smoke` and `E2E PR Smoke` each carry
 * `github.actor != 'dependabot[bot]'`, so before this fix every Dependabot PR
 * skipped all three browser-level jobs unconditionally — with no way for a
 * maintainer to force real coverage on a dependency bump that touches runtime
 * code. The `run-smoke` label (already read by `smoke-scope`, ci.yml:~40) is
 * the escape hatch: it must be ANDed into the SAME `if:` as the actor check,
 * not just into `smoke-scope`'s own condition, or the label has no effect on
 * whether these jobs run.
 *
 * These assertions read the raw `if:` line for each job rather than grepping
 * the whole file, so a comment that merely NAMES `run-smoke` near the guard
 * (without actually wiring it into the condition) does not satisfy them.
 */
const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../../../.github/workflows/ci.yml'),
  'utf8'
);

const BROWSER_JOBS = ['smoke-build:', 'a11y:', 'e2e-myk9show:'];

/** The `if:` line for a job, found by its `<name>:` heading at 2-space indent. */
function ifLineForJob(jobHeading: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobHeading}`);
  expect(start, `job "${jobHeading}" not found in ci.yml`).toBeGreaterThan(-1);

  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trimStart() ?? '';
    if (trimmed.startsWith('if:')) return trimmed;
    // Stop once we reach the next top-level job (2-space indent, ends with ':').
    if (/^ {2}\S.*:$/.test(lines[i] ?? '')) break;
  }

  throw new Error(`job "${jobHeading}" has no if: line`);
}

describe('Dependabot actor guard cannot skip browser smoke without an override', () => {
  it.each(BROWSER_JOBS)('%s still gates on the smoke-scope/enabled preconditions', jobHeading => {
    const ifLine = ifLineForJob(jobHeading);
    expect(ifLine).toContain("vars.MYK9SHOW_SMOKE_CI_ENABLED == 'true'");
    expect(ifLine).toContain("needs.smoke-scope.outputs.run == 'true'");
  });

  it.each(BROWSER_JOBS)(
    '%s: the dependabot actor check is overridable by the run-smoke label, not a bare skip',
    jobHeading => {
      const ifLine = ifLineForJob(jobHeading);
      expect(ifLine).toContain("github.actor != 'dependabot[bot]'");

      // The regression this test exists to catch: an actor check ANDed into
      // the job condition with no label escape hatch beside it. A bare
      // `&& github.actor != 'dependabot[bot]'` with nothing after it in the
      // expression is exactly the shape the label cannot rescue.
      const actorClauseAndAfter = ifLine.slice(
        ifLine.indexOf("github.actor != 'dependabot[bot]'")
      );
      expect(actorClauseAndAfter).toContain('run-smoke');
      expect(actorClauseAndAfter).toContain('||');
    }
  );

  it('the run-smoke override checks PR labels, not just the actor', () => {
    // Positive control: every occurrence of the override clause reads the
    // real label list off the triggering event, so a maintainer adding the
    // label on GitHub is what flips this — not some unrelated always-true stub.
    for (const jobHeading of BROWSER_JOBS) {
      const ifLine = ifLineForJob(jobHeading);
      expect(ifLine).toContain("contains(github.event.pull_request.labels.*.name, 'run-smoke')");
    }
  });

  it('dependabot.yml documents when to add the run-smoke label', () => {
    const dependabotConfig = readFileSync(
      resolve(import.meta.dirname, '../../../../../.github/dependabot.yml'),
      'utf8'
    );
    expect(dependabotConfig).toContain('run-smoke');
    expect(dependabotConfig).toContain('MYK9-520');
  });
});

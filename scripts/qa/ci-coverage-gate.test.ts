import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Coverage must be COLLECTED on pull requests, not only on pushes to `main`.
 *
 * Each package's `vitest.config.ts` carries `coverage.thresholds`, and vitest
 * only enforces them when `--coverage` is actually passed. So a job that omits
 * the flag on `pull_request` makes those thresholds unenforceable at review
 * time: a change that lowers coverage is green on its own PR and turns `main`
 * red on merge, with nothing to point at but the merge commit.
 *
 * That is not hypothetical. #1990 (MYK9-328) deleted 2,228 lines of
 * well-covered code from `packages/core`, which shrank the coverage
 * DENOMINATOR under the thresholds. `Test packages` requested `--coverage`
 * only on `push`, so the PR was green by construction; `main` then stayed red
 * for 18 hours across 12 commits, and the failure first surfaced on an
 * unrelated docs-only commit.
 *
 * NOT covered by this file, deliberately: `Test myK9Show (coverage)`. That job
 * is push-only ON PURPOSE — it is a post-merge whole-suite report and ratchet,
 * not a gate. Its gate counterpart is `Test myK9Show (coverage gate)`, which
 * merges the shard blobs and runs on PRs.
 */
const workflow = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/ci.yml'),
  'utf8'
);

/**
 * The `run:` line for a step, found by its `- name:` heading.
 *
 * Anchored on lines that START with `run:` once indentation is stripped, so a
 * COMMENT can never satisfy an assertion here. That matters more than it
 * looks: the comment block above this very step in `ci.yml` explains the
 * `--coverage` flag and therefore contains the string `--coverage`. A
 * whole-file `workflow.includes('--coverage')` would pass with the flag
 * deleted — prose about code is indistinguishable from code to a text scan.
 */
function runLineForStep(stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trimStart() === `- name: ${stepName}`);
  expect(start, `step "${stepName}" not found in ci.yml`).toBeGreaterThan(-1);

  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trimStart() ?? '';
    // Stop at the next step rather than running on into the following one.
    if (trimmed.startsWith('- name:')) break;
    if (trimmed.startsWith('run:')) return trimmed;
  }

  throw new Error(`step "${stepName}" has no run: line`);
}

/**
 * The two assertions below catch DIFFERENT regressions, and neither covers the
 * other. Both were mutation-verified against the real `ci.yml`:
 *
 *   flag deleted outright        -> only "passes --coverage" fails
 *   flag made event-conditional  -> only "does not make coverage conditional" fails
 *
 * The second pairing is the counter-intuitive one and the reason both exist:
 * the shipped bug was
 *
 *   ${{ github.event_name == 'push' && ' --coverage' || '' }}
 *
 * which still CONTAINS the substring `--coverage`. A `toContain('--coverage')`
 * check alone passes on it — it would have certified the exact defect it looks
 * like it is guarding. Do not collapse these two into one assertion.
 */
describe('CI collects coverage on pull requests, not only on push', () => {
  it.each(['Test packages', 'Test myK9Show (shard ${{ matrix.shard }}/6)'])(
    '%s passes --coverage',
    stepName => {
      expect(runLineForStep(stepName)).toContain('--coverage');
    }
  );

  it.each(['Test packages', 'Test myK9Show (shard ${{ matrix.shard }}/6)'])(
    '%s does not make coverage conditional on the event',
    stepName => {
      // The exact regression this file exists to prevent, which shipped as:
      //   ${{ github.event_name == 'push' && ' --coverage' || '' }}
      expect(runLineForStep(stepName)).not.toContain('github.event_name');
    }
  );

  it('still finds the step when its run: line is preceded by comments', () => {
    // Positive control for the helper itself. `Test packages` currently DOES
    // carry a comment block between its `- name:` and its `run:`; if the helper
    // silently returned the wrong line, every assertion above would be
    // measuring something else.
    expect(runLineForStep('Test packages')).toMatch(/^run: pnpm test:packages\b/);
  });

  it('leaves the post-merge myK9Show coverage report push-only', () => {
    // The other half of the contract: this one is NOT a gate and must not
    // start running on PRs, or every PR pays for a second full unsharded suite.
    const lines = workflow.split('\n');
    const jobStart = lines.findIndex(line => line.trim() === 'test-show-coverage:');
    expect(jobStart, 'test-show-coverage job not found').toBeGreaterThan(-1);

    const jobBody = lines.slice(jobStart, jobStart + 12).join('\n');
    expect(jobBody).toContain("if: github.event_name == 'push'");
  });
});

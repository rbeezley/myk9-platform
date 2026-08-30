import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every scheduled workflow must report its own state to a tracking issue.
 *
 * A scheduled run's result reaches nobody unless a human opens the Actions
 * tab. On 2026-08-30 four scheduled workflows were red and unread at once:
 * Playwright Regression (4 consecutive weekly runs, since 2026-08-03),
 * Dependency Audit (both monthly runs), and Nightly Health (2 of the last 5).
 * The cost was concrete — `myEntriesZoomReflow.spec.ts` was red across four
 * PRs, and the weekly suite that covers it had been reporting that failure the
 * whole time.
 *
 * These assertions ENUMERATE the scheduled workflows from disk rather than
 * checking a hand-written list. That is the whole point: this repo has been
 * bitten three times by hand-maintained allowlists where a new entry nobody
 * remembers to register silently runs nowhere. A new scheduled workflow added
 * without a notifier fails here instead of joining the silent set.
 */

const workflowsDir = resolve(__dirname, '../../../../../.github/workflows');
const actionPath = resolve(
  __dirname,
  '../../../../../.github/actions/report-scheduled-failure/action.yml'
);

/** Workflow files that run on a cron schedule. */
function scheduledWorkflows(): { file: string; source: string }[] {
  return readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map(file => ({ file, source: readFileSync(join(workflowsDir, file), 'utf8') }))
    .filter(({ source }) => /^\s{2}schedule:/m.test(source));
}

describe('scheduled workflows report their own failures', () => {
  it('finds the scheduled workflows at all', () => {
    // Guards the guard: if the detector broke, every assertion below would
    // pass over an empty list.
    const files = scheduledWorkflows().map(w => w.file);
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files).toContain('nightly-e2e.yml');
  });

  it.each(scheduledWorkflows().map(w => w.file))('%s wires the notifier', file => {
    const source = readFileSync(join(workflowsDir, file), 'utf8');
    expect(source).toContain('./.github/actions/report-scheduled-failure');
  });

  it.each(scheduledWorkflows().map(w => w.file))(
    '%s grants issues: write and reports unconditionally',
    file => {
      const source = readFileSync(join(workflowsDir, file), 'utf8');
      // Without the grant the step 403s; without always() it is skipped on the
      // failure it exists to report — the two ways this ships as a no-op.
      expect(source).toContain('issues: write');
      expect(source).toMatch(/if: always\(\)/);
    }
  );

  describe('the action itself', () => {
    const action = readFileSync(actionPath, 'utf8');

    it('closes the issue on success, not only opens it on failure', () => {
      // This is what makes an OPEN issue mean "currently broken". Without the
      // close, the first failure leaves a permanent issue, everyone learns to
      // ignore it, and the notifier becomes the noise it replaced.
      expect(action).toContain('gh issue close');
      expect(action).toContain('gh issue create');
      expect(action).toContain('gh issue comment');
    });

    it('reuses one issue per workflow instead of opening one per run', () => {
      // Matched on the exact title: `gh issue list --search` ranks by relevance
      // and would happily return a different workflow's issue.
      expect(action).toContain('gh issue list');
      expect(action).toContain('select(.title == ');
      expect(action).not.toContain('--search');
    });

    it('fails loudly when it cannot report', () => {
      // A notifier that swallows its own errors reproduces the exact defect it
      // exists to fix.
      expect(action).toMatch(/set -euo pipefail/);
    });
  });
});

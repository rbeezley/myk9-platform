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
    '%s serializes its runs so the issue lookup cannot race',
    file => {
      // Two overlapping runs would each see no open issue and each create one.
      // `cancel-in-progress: true` is fine — it prevents the overlap too — but
      // the group itself is what makes the reconciliation single-threaded.
      const source = readFileSync(join(workflowsDir, file), 'utf8');
      expect(source).toMatch(/^concurrency:\n\s+group:/m);
    }
  );

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

    it('collapses duplicates a concurrent run could have created', () => {
      // Codex P2 on #1883. Lookup and create are not atomic, so two
      // overlapping runs can each see nothing and each open an issue. The
      // concurrency groups asserted above prevent that; this makes the
      // invariant self-healing if one ever slips through, so a duplicate is
      // collapsed on the next run instead of lingering as the noise this
      // action exists to avoid.
      expect(action).toContain('| sort | .[]');
      expect(action).toContain('Duplicate of #');

      // The final line of a `printf '%s'` list has no trailing newline, so a
      // plain `while read` drops it. Without this, a third duplicate survives
      // — which a dry run caught after the first fix looked correct.
      expect(action).toContain('|| [ -n "$dup" ]');
    });

    it('fails loudly when it cannot report', () => {
      // A notifier that swallows its own errors reproduces the exact defect it
      // exists to fix.
      expect(action).toMatch(/set -euo pipefail/);
    });
  });
});

/**
 * A composite action's manifest is TEMPLATED, description strings included.
 *
 * On 2026-08-31 the notifier failed to load in all four workflows that use it,
 * every time it had ever run, with:
 *
 *   Unrecognized named-value: 'job'. Located at position 1 within expression:
 *   job.status
 *
 * The offending text was a COMMENT — an input description that documented the
 * expression callers should pass by writing it out in full, braces and all.
 * GitHub evaluated it, `job` does not exist inside a composite action, and the
 * whole manifest was rejected before a single line of its shell ran. So the
 * notifier built to stop scheduled failures going unread was itself a
 * scheduled failure going unread, and it reddened runs whose real work passed.
 *
 * The repo's standing lesson is that a text scan cannot tell code from prose
 * about code. This is that lesson inverted, and worse: GitHub's parser cannot
 * either, and it EXECUTES what it finds. Documenting an expression is enough to
 * evaluate it.
 *
 * Nothing local could have caught it. The sibling behaviour test extracts the
 * `run:` block and executes it, which proves the shell works and says nothing
 * about whether the manifest around it loads. Only a real run does — and the
 * cheap standing guard is to forbid the contexts a composite action cannot
 * resolve, anywhere in the file.
 */
describe('composite action manifests', () => {
  const actionsDir = resolve(__dirname, '../../../../../.github/actions');

  /** Contexts GitHub does not resolve inside a composite action. */
  const FORBIDDEN = ['job', 'jobs', 'needs', 'secrets'];

  function compositeActions(): { file: string; source: string }[] {
    return readdirSync(actionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        file: join(entry.name, 'action.yml'),
        source: readFileSync(join(actionsDir, entry.name, 'action.yml'), 'utf8'),
      }))
      .filter(({ source }) => /using:\s*['"]?composite/.test(source));
  }

  it('has at least one composite action to check', () => {
    // Guards the suite against silently passing on an empty set, the way a
    // glob that matches nothing reports success.
    expect(compositeActions().length).toBeGreaterThan(0);
  });

  it.each(compositeActions())(
    '$file resolves every expression it contains',
    ({ source }) => {
      const expressions = [...source.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) =>
        m[1].trim()
      );

      const unresolvable = expressions.filter((expression) =>
        FORBIDDEN.some((context) =>
          new RegExp(`(^|[^\\w.])${context}\\.`).test(expression)
        )
      );

      // Reported with the offending text so the fix is obvious: either the
      // caller should pass it as an input, or — if this is documentation —
      // write the expression without its braces.
      expect(unresolvable).toEqual([]);
    }
  );
});

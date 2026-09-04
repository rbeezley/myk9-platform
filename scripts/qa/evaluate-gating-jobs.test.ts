import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

/**
 * Runs `scripts/ci/evaluate-gating-jobs.sh` — the real script, the one
 * `deploy-staging.yml` invokes — against RECORDED payloads from real CI runs.
 *
 * Recorded rather than hand-written on purpose. The first version of the script
 * reported PROMOTABLE for run 33832052383, in which `Test packages` had FAILED:
 * the `jq` call was missing `<<<"$payload"`, so it evaluated empty input, found
 * no problems, and an empty problem list was read as "nothing wrong". It failed
 * OPEN on a deploy gate and looked perfectly healthy doing it. A hand-written
 * fixture would have caught that too — but only these show the shapes CI
 * actually produces, including the two flavours of `cancelled` that must be
 * treated differently.
 */
const repoRoot = resolve(import.meta.dirname, '../..');
const script = resolve(repoRoot, 'scripts/ci/evaluate-gating-jobs.sh');
const fixtureDir = resolve(repoRoot, 'scripts/qa/fixtures/ci-runs');

type Verdict = { code: number; stdout: string; stderr: string };

function evaluate(payload: string): Verdict {
  const result = spawnSync(script, { input: payload, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function fixture(name: string): string {
  return readFileSync(resolve(fixtureDir, name), 'utf8');
}

/** 0 = promotable, 1 = blocked, 2 = input not trustworthy. */
const PROMOTABLE = 0;
const BLOCKED = 1;
const UNTRUSTWORTHY = 2;

describe('evaluate-gating-jobs, against recorded real CI runs', () => {
  it('promotes a run where every job succeeded', () => {
    // 6d7a2db9a — the last run to promote before the bug stranded three merges.
    const verdict = evaluate(fixture('33880999020-full-success.json'));
    expect(verdict.code).toBe(PROMOTABLE);
    expect(verdict.stdout).toContain('14 jobs examined');
  });

  it('promotes a run whose ONLY non-success job is the informational one', () => {
    // ad060903c — run conclusion `cancelled`, every gating job green, and
    // `Test myK9Show (coverage)` cancelled by the concurrency group. This is
    // the case the whole change exists for.
    const verdict = evaluate(fixture('33888054791-informational-job-cancelled.json'));
    expect(verdict.code).toBe(PROMOTABLE);
    expect(verdict.stdout).toContain('Test myK9Show (coverage) (cancelled)');
  });

  it('BLOCKS a run in which a gating job actually failed', () => {
    // 589b06fca — `Test packages` failed and Build/Smoke/A11y/E2E all SKIPPED
    // as a consequence. The skips must not read as permission to promote.
    const verdict = evaluate(fixture('33832052383-test-packages-failed.json'));
    expect(verdict.code).toBe(BLOCKED);
    expect(verdict.stderr).toContain('job Test packages concluded failure');
    expect(verdict.stderr).toContain('required job Build concluded skipped');
  });

  it('BLOCKS a superseded run whose smoke jobs were cancelled mid-flight', () => {
    // 68a0bd813 — everything green EXCEPT A11y smoke and E2E PR Smoke, which
    // were cut short. A half-run smoke suite is not evidence. This is the
    // closest a blocked run gets to the promotable one above, and the pair is
    // what makes the `cancelled`-is-not-`skipped` distinction load-bearing.
    const verdict = evaluate(fixture('33886627564-superseded-smoke-cancelled.json'));
    expect(verdict.code).toBe(BLOCKED);
    expect(verdict.stderr).toContain('job A11y smoke concluded cancelled');
    expect(verdict.stderr).toContain('job E2E PR Smoke concluded cancelled');
  });

  it('BLOCKS a heavily superseded run', () => {
    const verdict = evaluate(fixture('33885649857-superseded-heavily.json'));
    expect(verdict.code).toBe(BLOCKED);
    expect(verdict.stderr).toContain('required job Build concluded cancelled');
  });

  it('covers every committed fixture, so a new one cannot sit unasserted', () => {
    const fixtures = readdirSync(fixtureDir).filter(name => name.endsWith('.json'));
    const asserted = readFileSync(import.meta.filename, 'utf8');
    for (const name of fixtures) {
      expect(asserted, `fixture ${name} is not referenced by any assertion`).toContain(name);
    }
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });
});

describe('evaluate-gating-jobs refuses input it cannot trust', () => {
  it('rejects a non-payload', () => {
    expect(evaluate('"nope"').code).toBe(UNTRUSTWORTHY);
  });

  it('rejects an empty jobs array rather than reading it as "no problems"', () => {
    // The shape the original bug produced. It must NOT be promotable.
    const verdict = evaluate(JSON.stringify({ total_count: 0, jobs: [] }));
    expect(verdict.code).toBe(UNTRUSTWORTHY);
  });

  it('rejects a truncated page rather than deciding on a subset', () => {
    const full = JSON.parse(fixture('33880999020-full-success.json')) as {
      total_count: number;
      jobs: unknown[];
    };
    const verdict = evaluate(JSON.stringify({ total_count: 14, jobs: full.jobs.slice(0, 9) }));
    expect(verdict.code).toBe(UNTRUSTWORTHY);
    expect(verdict.stderr).toContain('9 of 14 jobs');
  });

  it('rejects a plausible-length payload that is still short of total_count', () => {
    // Guards the floor itself: 8 jobs clears MIN_JOBS but is not the whole run.
    const full = JSON.parse(fixture('33880999020-full-success.json')) as {
      total_count: number;
      jobs: unknown[];
    };
    const verdict = evaluate(JSON.stringify({ total_count: 14, jobs: full.jobs.slice(0, 8) }));
    expect(verdict.code).toBe(UNTRUSTWORTHY);
  });
});

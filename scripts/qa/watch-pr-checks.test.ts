import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const watcher = resolve(repositoryRoot, 'scripts/qa/watch-pr-checks.sh');
const source = readFileSync(watcher, 'utf8');

const scratchDirs: string[] = [];
afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

/** Copy the real script, apply one edit, run its self-test. */
function runMutated(replace: string, withText: string) {
  expect(
    source.includes(replace),
    'mutation anchor not found — the mutation would not have landed, so a green result proves nothing'
  ).toBe(true);

  const dir = mkdtempSync(join(tmpdir(), 'watch-pr-checks-'));
  scratchDirs.push(dir);
  const copy = join(dir, 'watch-pr-checks.sh');
  copyFileSync(watcher, copy);
  writeFileSync(copy, source.replace(replace, withText));
  chmodSync(copy, 0o755);

  return spawnSync('bash', [copy, '--self-test'], { encoding: 'utf8' });
}

/** Call the script's own verdict() with a fixture, via a sourcing shim. */
function verdict(rollup: unknown, required: string[]) {
  const shim = `
    set -uo pipefail
    # Source the script without running its main path.
    # Source from JQ_DEFS, not JQ_ANSWERED_NAMES: verdict() depends on the
    # shared jq definitions above it, and a shim that starts too late compiles
    # to "answered/0 is not defined" rather than testing anything.
    eval "$(sed -n '/^JQ_DEFS=/,/^}/p' ${JSON.stringify(watcher)})"
    verdict ${JSON.stringify(JSON.stringify(rollup))} ${JSON.stringify(JSON.stringify(required))}
  `;
  return spawnSync('bash', ['-c', shim], { encoding: 'utf8' }).stdout.trim();
}

describe('watch-pr-checks harness', () => {
  // The script is the thing under test, not a re-implementation of its jq. A
  // copy of the expression here would drift and certify the copy.
  it('passes its own known-answer self-test', () => {
    const result = spawnSync('bash', [watcher, '--self-test'], { encoding: 'utf8' });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('self-test 11/11');
  });

  // The point of a self-test is that it catches THE bug that shipped. If it
  // cannot, it is decoration. This restores the original conclusion-only
  // denylist, which could not see a Vercel `state` failure at all.
  it('rejects the conclusion-only filter that missed Vercel failures on #2045', () => {
    const result = runMutated(
      `JQ_FAILED_NAMES='[.statusCheckRollup[] | select(answered and (passing | not)) | .name // .context]'`,
      `JQ_FAILED_NAMES='[.statusCheckRollup[] | select((.conclusion // "") | IN("FAILURE","TIMED_OUT","CANCELLED","ACTION_REQUIRED")) | .name // .context]'`
    );

    expect(result.status, 'the harness must refuse to run when it cannot see a failure').toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [vercel-state]');
  });

  // The denylist's other victim: STALE is answered and is not a pass, but was
  // absent from the failure list, so a required check with it read as green.
  it('rejects a classifier that lets STALE through as passing', () => {
    const result = runMutated(
      'then (.conclusion | IN("SUCCESS","NEUTRAL","SKIPPED"))',
      'then (.conclusion | IN("SUCCESS","NEUTRAL","SKIPPED","STALE"))'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [stale-conclusion]');
  });

  // Guards the opposite failure mode: a detector that flags a green board would
  // block every merge, and "it caught the red" alone does not rule that out.
  it('rejects a classifier that treats every answered check as failing', () => {
    const result = runMutated(
      'then (.conclusion | IN("SUCCESS","NEUTRAL","SKIPPED"))',
      'then false'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [all-green]');
  });

  // Codex found this on #2053: "nothing unanswered" is not settled when nothing
  // has registered. Dropping the required-set wait must make the harness refuse.
  it('rejects a green verdict that ignores checks which have not registered', () => {
    // The anchor carries the script's own shell-escaping verbatim (`\$pending`,
    // `\"waiting:\"`), because that is what is on disk.
    const result = runMutated(
      'elif (\\$pending    | length) > 0 then \\"waiting:\\"',
      'elif false then \\"waiting:\\"'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [partial-rollup]');
  });

  // A watcher that hangs is worse than one that errors: it stalls the shipping
  // workflow with no verdict and no signal. `gh api` succeeds so the run reaches
  // its polling loop; `gh pr view` then fails, which is what an outage, a rate
  // limit or an expired token looks like mid-run. Raised in review of #2053,
  // where the retry path skipped the deadline entirely.
  it('honours the deadline when PR reads keep failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-pr-checks-stub-'));
    scratchDirs.push(dir);
    writeFileSync(
      join(dir, 'gh'),
      [
        '#!/bin/bash',
        'case "${1:-}" in',
        '  api)',
        '    if [[ "$*" == *"/rulesets/"* ]]; then echo \'["Quality Checks"]\'; else echo 17085332; fi',
        '    exit 0 ;;',
        '  *) exit 1 ;;',
        'esac',
      ].join('\n')
    );
    chmodSync(join(dir, 'gh'), 0o755);

    const startedAt = Date.now();
    const result = spawnSync('bash', [watcher, '2053', 'deadbeefdeadbeef'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ''}`,
        MYK9_PR_TIMEOUT_SECONDS: '0',
        MYK9_PR_POLL_SECONDS: '1',
      },
      timeout: 30_000,
    });

    expect(result.status, `stdout: ${result.stdout}`).toBe(3);
    expect(result.stdout).toContain('NOT a verdict');
    expect(Date.now() - startedAt).toBeLessThan(20_000);
  });

  it('refuses to poll without a PR number', () => {
    const result = spawnSync('bash', [watcher], { encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('usage');
  });

  describe('verdict()', () => {
    const required = ['Quality Checks', 'Test'];

    it('waits when a required check has not registered yet', () => {
      // The exact shape Codex reproduced: one fast status context, nothing else.
      expect(
        verdict(
          { statusCheckRollup: [{ context: 'Vercel Preview Comments', state: 'SUCCESS' }] },
          required
        )
      ).toBe('waiting:Quality Checks, Test');
    });

    it('is green when every required check answered, ignoring extras', () => {
      expect(
        verdict(
          {
            statusCheckRollup: [
              { name: 'Quality Checks', conclusion: 'SUCCESS' },
              { name: 'Test', conclusion: 'SKIPPED' },
              { context: 'Vercel - app', state: 'SUCCESS' },
            ],
          },
          required
        )
      ).toBe('green');
    });

    // AGENTS.md § Vercel Hobby quota: preview contexts are deliberately not
    // required, so a quota-limited preview must not read as a blocking failure.
    it('separates a non-required failure from a required one', () => {
      expect(
        verdict(
          {
            statusCheckRollup: [
              { name: 'Quality Checks', conclusion: 'SUCCESS' },
              { name: 'Test', conclusion: 'SUCCESS' },
              { context: 'Vercel - app', state: 'FAILURE' },
            ],
          },
          required
        )
      ).toBe('preview-failed:Vercel - app');
    });

    // Classification is an allowlist of PASSING, not a denylist of failing.
    // The denylist version returned green for both of these.
    it.each([
      ['STALE', 'a real GitHub conclusion the denylist missed'],
      ['SOME_FUTURE_VALUE', 'a value GitHub has not shipped yet'],
    ])('fails closed on a required check whose conclusion is %s (%s)', conclusion => {
      expect(
        verdict(
          {
            statusCheckRollup: [
              { name: 'Quality Checks', conclusion: 'SUCCESS' },
              { name: 'Test', conclusion },
            ],
          },
          required
        )
      ).toBe('required-failed:Test');
    });

    it('accepts NEUTRAL and SKIPPED as genuine passes', () => {
      expect(
        verdict(
          {
            statusCheckRollup: [
              { name: 'Quality Checks', conclusion: 'NEUTRAL' },
              { name: 'Test', conclusion: 'SKIPPED' },
            ],
          },
          required
        )
      ).toBe('green');
    });

    it('reports the blocking failure when both kinds are present', () => {
      expect(
        verdict(
          {
            statusCheckRollup: [
              { name: 'Quality Checks', conclusion: 'FAILURE' },
              { name: 'Test', conclusion: 'SUCCESS' },
              { context: 'Vercel - app', state: 'FAILURE' },
            ],
          },
          required
        )
      ).toBe('required-failed:Quality Checks');
    });
  });

  // Exit codes are the contract every caller reads. 3 in particular must never
  // be mistaken for 0 — a timeout is the absence of a verdict, not a green one.
  it('documents every exit code it can return', () => {
    for (const code of [
      '0  every REQUIRED check answered green',
      '5  required checks are green but a NON-required check failed',
      '1  a REQUIRED check failed',
      '2  aborted',
      '3  timed out',
      '4  self-test failed',
      '5  required checks are green but a NON-required check failed',
    ]) {
      expect(source).toContain(code);
    }
  });
});

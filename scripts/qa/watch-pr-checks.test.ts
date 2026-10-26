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

type CheckRun = { name: string; conclusion: string | null };
type Status = { context: string; state: string };

/**
 * A fake `gh` that answers only the REST reads the watcher makes, logs every
 * invocation, and fails any GraphQL route (`gh pr`, `gh issue`, `gh api graphql`)
 * the way a Claude Code cloud session does (MYK9-1414). Lists are served 100
 * rows per `&page=N`, already projected the way the watcher's `--jq` would.
 * `--paginate` gets page 1 and then the proxy's 403, because its next links use
 * `repositories/{id}/…` paths the cloud proxy rejects (MYK9-1425).
 * `pad` bulks every check run with an `output.text` of that many characters,
 * the way a real REST row carries far more than the watcher reads.
 */
function restStub(checkRuns: CheckRun[], statuses: Status[], head = 'deadbeef', pad = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'watch-pr-checks-rest-'));
  scratchDirs.push(dir);
  const log = join(dir, 'calls.log');
  const runs = checkRuns.map((run, index) => ({
    name: run.name,
    status: run.conclusion === null ? 'in_progress' : 'completed',
    conclusion: run.conclusion,
    started_at: '2026-10-25T19:00:00Z',
    details_url: `https://github.com/o/r/actions/runs/100/job/${index + 1}`,
    ...(pad ? { output: { text: 'x'.repeat(pad) } } : {}),
  }));
  const contexts = statuses.map(status => ({ ...status, created_at: '2026-10-25T19:00:00Z' }));
  writeFileSync(join(dir, 'check-runs.json'), JSON.stringify(runs));
  writeFileSync(join(dir, 'statuses.json'), JSON.stringify(contexts));
  writeFileSync(join(dir, 'workflow-runs.json'), JSON.stringify([{ id: 100, name: 'CI' }]));
  writeFileSync(
    join(dir, 'gh'),
    [
      '#!/bin/bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(log)}`,
      '[ "${1:-}" = api ] || { echo "HTTP 403: GitHub GraphQL is not available" >&2; exit 1; }',
      `page=$(printf '%s' "$*" | sed -nE 's#.*[?&]page=([0-9]+).*#\\1#p')`,
      'serve() {',
      `  jq -c --argjson p "\${page:-1}" '.[(($p - 1) * 100):($p * 100)]' ${JSON.stringify(dir)}/"$1"`,
      '}',
      'case "$*" in',
      '  *graphql*) echo "HTTP 403: GitHub GraphQL is not available" >&2; exit 1 ;;',
      `  *"/rulesets/"*) echo '["Quality Checks","Test","A11y smoke","E2E PR Smoke"]' ;;`,
      '  *"/rulesets"*) echo 17085332 ;;',
      `  *"/pulls/"*) echo ${head} ;;`,
      '  *"/check-runs"*) serve check-runs.json ;;',
      '  *"/status"*) serve statuses.json ;;',
      '  *"/actions/runs"*) serve workflow-runs.json ;;',
      '  *) exit 1 ;;',
      'esac',
      'case "$*" in',
      '  *--paginate*)',
      '    echo "gh: Numeric-ID repository paths (repositories/{id}/...) are not supported through this proxy. (HTTP 403)" >&2',
      '    exit 1 ;;',
      'esac',
    ].join('\n')
  );
  chmodSync(join(dir, 'gh'), 0o755);
  return { dir, log };
}

/** Run the watcher pinned to `deadbeef` for exactly one poll against a stub. */
function pollOnce(dir: string) {
  return spawnSync('bash', [watcher, '2053', 'deadbeef'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      MYK9_PR_TIMEOUT_SECONDS: '0',
      MYK9_PR_POLL_SECONDS: '1',
    },
    timeout: 60_000,
  });
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
      'select(answered and (passing | not) and (stale($cur) | not)) | key] as $failed',
      'select((.conclusion // "") | IN("FAILURE","TIMED_OUT","CANCELLED","ACTION_REQUIRED")) | key] as $failed'
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
    const result = runMutated(
      'elif ($pending     | length) > 0 then "waiting:"',
      'elif false then "waiting:"'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [partial-rollup]');
  });

  // MYK9-947: judging by "any answered row" instead of the CURRENT attempt let a
  // draft run's SKIPPED answer for a fresh in-flight run (#2672) and an old
  // CANCELLED row fail a green PR (#2675). Picking the lowest job id instead of
  // the highest is the same bug in the other direction.
  it('rejects a selector that does not pick the highest job id per check name', () => {
    const result = runMutated(
      'sort_by([jobid, started]) | last ]',
      'sort_by([jobid, started]) | first ]'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [cancelled-then-success');
  });

  it('rejects a verdict that lets a required name borrow an older run answer', () => {
    const result = runMutated('and any($cur[]; (.workflowName', 'and any([]; (.workflowName');

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [draft-ready-stale-skip');
  });

  it('rejects a selector that ignores the status-context createdAt timestamp', () => {
    const result = runMutated('(.startedAt // .createdAt // "")', '(.startedAt // "")');

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [ctx-newer-failure-createdAt');
  });

  // A REST check run carries no workflow name; without the join from the run
  // id, the draft->ready stale rule silently stops applying (MYK9-1414).
  it('rejects a REST mapping that drops the workflow-name join', () => {
    const result = runMutated(
      '| .workflowName = ($wf[(.detailsUrl | capture("/runs/(?<n>[0-9]+)")? | .n) // ""] // "")]',
      ']'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [rest-stale-skip]');
  });

  it('rejects a REST mapping that keeps GitHub REST lower-case conclusions', () => {
    const result = runMutated(
      'conclusion: ((.conclusion // "") | ascii_upcase)',
      'conclusion: (.conclusion // "")'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [rest-');
  });

  // The cloud session's proxy rejects every GraphQL route. Running the whole
  // main path, head lookup included, against a gh that 403s them proves the
  // watcher never takes one, which a grep of the source could not.
  it('reaches a verdict through REST alone, with no GraphQL call', () => {
    const { dir, log } = restStub(
      [
        { name: 'Quality Checks', conclusion: 'success' },
        { name: 'Test', conclusion: 'success' },
        { name: 'A11y smoke', conclusion: 'skipped' },
        { name: 'E2E PR Smoke', conclusion: 'failure' },
      ],
      []
    );

    const result = spawnSync('bash', [watcher, '2053'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` },
      timeout: 30_000,
    });

    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain('watching PR #2053 pinned to deadbeef');
    expect(result.stdout).toContain('REQUIRED CHECK FAILED on deadbeef: E2E PR Smoke');
    const calls = readFileSync(log, 'utf8').trim().split('\n');
    expect(calls.every(call => call.startsWith('api ') && !call.includes('graphql'))).toBe(true);
    expect(calls.some(call => call.includes('/pulls/2053'))).toBe(true);
    expect(calls.some(call => call.includes('/commits/deadbeef/check-runs?filter=all'))).toBe(true);
  });

  // Codex, review of #3272: passing a whole REST page to `jq --argjson` dies with
  // E2BIG past Linux's 128 KiB per-argument cap, so an all-green head timed out.
  // 400 bulky rows (~900 KB) must still reach the green verdict on the first poll.
  it('reaches a verdict on a check-runs payload far past the per-argument limit', () => {
    const extra = Array.from({ length: 396 }, (_, i) => ({
      name: `Job ${i}`,
      conclusion: 'success',
    }));
    const { dir, log } = restStub(
      [
        { name: 'Quality Checks', conclusion: 'success' },
        { name: 'Test', conclusion: 'success' },
        { name: 'A11y smoke', conclusion: 'success' },
        { name: 'E2E PR Smoke', conclusion: 'success' },
        ...extra,
      ],
      [],
      'deadbeef',
      2000
    );

    const result = pollOnce(dir);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('GREEN on deadbeef');
    expect(result.stdout).toContain('400 checks seen');
    // 400 rows are four full pages plus an empty fifth, read by hand: the stub
    // 403s `--paginate` past page 1, as the cloud proxy does (MYK9-1425).
    const pages = readFileSync(log, 'utf8')
      .split('\n')
      .filter(call => call.includes('/check-runs?'))
      .map(call => call.match(/[?&]page=(\d+)/)?.[1]);
    expect(pages).toEqual(['1', '2', '3', '4', '5']);
  });

  // A list still full at the page cap is unknown, not complete: the read fails
  // and the run times out (exit 3, not a verdict). The required checks are all
  // green in the first page, so a truncated read would wrongly report GREEN.
  it('fails closed when a list is still full at the page cap', () => {
    const rows = [
      { name: 'Quality Checks', conclusion: 'success' },
      { name: 'Test', conclusion: 'success' },
      { name: 'A11y smoke', conclusion: 'success' },
      { name: 'E2E PR Smoke', conclusion: 'success' },
      ...Array.from({ length: 4996 }, (_, i) => ({ name: `Job ${i}`, conclusion: 'success' })),
    ];
    const { dir } = restStub(rows, []);

    const result = pollOnce(dir);

    expect(result.status, result.stdout + result.stderr).toBe(3);
    expect(result.stdout).toContain('NOT a verdict');
  });

  it('aborts when the head moves while the checks are read', () => {
    const { dir } = restStub(
      [
        { name: 'Quality Checks', conclusion: 'success' },
        { name: 'Test', conclusion: 'success' },
        { name: 'A11y smoke', conclusion: 'success' },
        { name: 'E2E PR Smoke', conclusion: 'success' },
      ],
      [],
      'cafef00d'
    );

    const result = spawnSync('bash', [watcher, '2053', 'deadbeef'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` },
      timeout: 30_000,
    });

    expect(result.status, result.stdout + result.stderr).toBe(2);
    expect(result.stdout).toContain('head moved deadbeef -> cafef00d');
  });

  it('keeps the Vercel quota note off non-Vercel failures', () => {
    const result = runMutated('case "$n" in Vercel*) ;; *) return 1 ;; esac', ':');

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('SELF-TEST FAIL [note-non-vercel]');
  });

  // A watcher that hangs is worse than one that errors: it stalls the shipping
  // workflow with no verdict and no signal. The ruleset reads succeed so the run
  // reaches its polling loop; every check read then fails, which is what an
  // outage, a rate limit or an expired token looks like mid-run. Raised in
  // review of #2053, where the retry path skipped the deadline entirely.
  it('honours the deadline when PR reads keep failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watch-pr-checks-stub-'));
    scratchDirs.push(dir);
    writeFileSync(
      join(dir, 'gh'),
      [
        '#!/bin/bash',
        'case "${1:-}" in',
        '  api)',
        '    if [[ "$*" == *"/rulesets/"* ]]; then echo \'["Quality Checks"]\';',
        '    elif [[ "$*" == *"/rulesets"* ]]; then echo 17085332; else exit 1; fi',
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

  // Green reports the REQUIRED set, not a finished board. If the caller cannot
  // see what is still outstanding, an identical non-required failure blocks
  // shipping when it lands early and is ignored when it lands late — purely on
  // timing. Raised in review of #2053.
  const requiredGreen: CheckRun[] = [
    { name: 'Quality Checks', conclusion: 'success' },
    { name: 'Test', conclusion: 'success' },
    { name: 'A11y smoke', conclusion: 'success' },
    { name: 'E2E PR Smoke', conclusion: 'success' },
  ];
  it.each([
    [
      'names what is still outstanding on green',
      { context: 'Vercel - app', state: 'pending' },
      'STILL OUTSTANDING (non-required, may yet fail): Vercel - app',
    ],
    [
      'says so plainly when the board is finished',
      { context: 'Vercel - app', state: 'success' },
      'Nothing outstanding',
    ],
  ])('%s', (_label, status, expected) => {
    const { dir } = restStub(requiredGreen, [status]);

    const result = spawnSync('bash', [watcher, '2053', 'deadbeef'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` },
      timeout: 30_000,
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain(expected);
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

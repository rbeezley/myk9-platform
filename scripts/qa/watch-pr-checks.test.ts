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

/** Copy the real script, apply one edit, and run it. */
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

describe('watch-pr-checks harness', () => {
  // The script is the thing under test, not a re-implementation of its jq.
  // A copy of the expression in this file would drift and certify the copy.
  it('passes its own known-answer self-test', () => {
    const result = spawnSync('bash', [watcher, '--self-test'], { encoding: 'utf8' });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('self-test 5/5');
  });

  // The point of the self-test is that it catches THE bug that shipped. If it
  // cannot, it is decoration. This restores the original two-arm jq verbatim.
  it('rejects the two-arm jq that missed Vercel failures on #2045', () => {
    const correct = `JQ_FAILED='[.statusCheckRollup[]
  | select(
      ((.conclusion // "") | IN("FAILURE","TIMED_OUT","CANCELLED","ACTION_REQUIRED"))
      or ((.state // "") | IN("FAILURE","ERROR"))
    )
  | .name // .context] | unique | join(", ")'`;

    const originalBug = `JQ_FAILED='[.statusCheckRollup[]
  | select((.conclusion // "") | IN("FAILURE","TIMED_OUT","CANCELLED","ACTION_REQUIRED"))
  , (.statusCheckRollup[]? | select((.state // "") | IN("FAILURE","ERROR")))
  | .name // .context] | unique | join(", ")'`;

    const result = runMutated(correct, originalBug);

    expect(result.status, 'the harness must refuse to run when it cannot see a failure').toBe(4);
    expect(result.stdout).toContain('vercel state failure not detected');
    expect(result.stdout).toContain('refusing to report on real CI');
  });

  // Guards the opposite failure mode: a detector that flags a green board would
  // block every merge, and "it caught the red" alone does not rule that out.
  it('rejects a failure filter that matches everything', () => {
    const result = runMutated(
      '((.state // "") | IN("FAILURE","ERROR"))',
      '((.state // "") | IN("FAILURE","ERROR","SUCCESS"))'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('green rollup reported failures');
  });

  // The answered-count is what decides "settled", so a filter that reads an
  // in-flight run as done would let the poll exit on a partial board.
  it('rejects an answered-count that treats an in-flight run as done', () => {
    const result = runMutated(
      '((.conclusion // "") == "")\n      and (((.state // "") | IN("SUCCESS","FAILURE","ERROR")) | not)',
      'false'
    );

    expect(result.status).toBe(4);
    expect(result.stdout).toContain('in-flight run not counted unanswered');
  });

  it('refuses to poll without a PR number', () => {
    const result = spawnSync('bash', [watcher], { encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('usage');
  });

  // Exit codes are the contract every caller reads. 3 in particular must never
  // be mistaken for 0 — a timeout is the absence of a verdict, not a green one.
  it('documents every exit code it can return', () => {
    for (const code of [
      '0  settled',
      '1  at least one check failed',
      '2  aborted',
      '3  timed out',
      '4  self-test failed',
    ]) {
      expect(source).toContain(code);
    }
  });
});

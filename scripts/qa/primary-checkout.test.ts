import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_BEHIND_LIMIT,
  evaluate,
  findPrimaryCheckout,
  readStatus,
  render,
  type PrimaryCheckoutStatus,
} from './primary-checkout.ts';

/**
 * Every test gets a FRESH repository. An earlier version shared one fixture
 * across the file and failed 2-5 of every 6 shuffled runs: `advanceOrigin` and
 * the final `merge --ff-only` mutated state later tests asserted on, and worse,
 * the incident-reproduction test passed VACUOUSLY in some orders because the
 * merge it expects to fail had already been performed. CI runs vitest with
 * --sequence.shuffle, so per-test isolation is the only safe shape here.
 *
 * These build REAL git repositories rather than stubbing git: a guard tested
 * only against invented fixtures has never met its subject, and a text-level
 * assertion would certify a no-op (LESSONS source-text-tests).
 */

function git(args: readonly string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

interface Fixture {
  root: string;
  origin: string;
  primary: string;
}

let fx: Fixture;

beforeEach(() => {
  // The directory name carries a SPACE on purpose: this repo lives under
  // "AI Projects", and a guard that shells out via a string splits that into
  // two arguments (LESSONS guard-word-split). These tests fail if that regresses.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'myk9 primary guard ')));
  git(['init', '--bare', '--initial-branch=main', 'origin repo'], root);
  const origin = join(root, 'origin repo');
  const primary = join(root, 'primary checkout');
  git(['clone', origin, 'primary checkout'], root);
  git(['config', 'user.email', 'guard@test.local'], primary);
  git(['config', 'user.name', 'Guard Test'], primary);
  git(['config', 'commit.gpgsign', 'false'], primary);
  writeFileSync(join(primary, 'tracked.txt'), 'base\n');
  git(['add', '.'], primary);
  git(['commit', '-m', 'base'], primary);
  git(['push', '-u', 'origin', 'main'], primary);
  fx = { root, origin, primary };
});

afterEach(() => {
  if (fx?.root) rmSync(fx.root, { recursive: true, force: true });
});

/** Advance origin/main by n commits without touching the primary's working tree. */
function advanceOrigin(n: number): void {
  const pusher = join(fx.root, 'pusher');
  rmSync(pusher, { recursive: true, force: true });
  git(['clone', fx.origin, 'pusher'], fx.root);
  git(['config', 'user.email', 'guard@test.local'], pusher);
  git(['config', 'user.name', 'Guard Test'], pusher);
  git(['config', 'commit.gpgsign', 'false'], pusher);
  for (let i = 0; i < n; i += 1) {
    writeFileSync(join(pusher, 'tracked.txt'), `upstream ${i}\n`);
    git(['add', '.'], pusher);
    git(['commit', '-m', `upstream ${i}`], pusher);
  }
  git(['push', 'origin', 'main'], pusher);
  git(['fetch', 'origin'], fx.primary);
}

describe('findPrimaryCheckout', () => {
  it('returns the primary working tree when called from the primary itself', () => {
    expect(findPrimaryCheckout(fx.primary)).toBe(fx.primary);
  });

  it('returns the PRIMARY tree when called from inside a linked worktree', () => {
    // The whole point: it must look past wherever the agent is working.
    const linked = join(fx.root, 'linked worktree');
    git(['worktree', 'add', '-b', 'feature', linked, 'main'], fx.primary);
    expect(findPrimaryCheckout(linked)).toBe(fx.primary);
  });
});

describe('readStatus', () => {
  it('reports a clean, current checkout as clean', () => {
    const status = readStatus(fx.primary);
    expect(status.dirtyFiles).toEqual([]);
    expect(status.branch).toBe('main');
    expect(status.onMain).toBe(true);
    expect(status.behindMain).toBe(0);
    expect(evaluate(status).ok).toBe(true);
  });

  it('detects an uncommitted tracked modification', () => {
    writeFileSync(join(fx.primary, 'tracked.txt'), 'locally edited\n');
    const status = readStatus(fx.primary);
    expect(status.dirtyFiles).toEqual(['tracked.txt']);
    expect(evaluate(status).ok).toBe(false);
  });

  it('detects a STAGED-only modification, which git diff alone would miss', () => {
    writeFileSync(join(fx.primary, 'tracked.txt'), 'staged edit\n');
    git(['add', 'tracked.txt'], fx.primary);
    const status = readStatus(fx.primary);
    expect(status.dirtyFiles).toEqual(['tracked.txt']);
    expect(evaluate(status).ok).toBe(false);
  });

  it('ignores untracked files, which do not abort a pull', () => {
    writeFileSync(join(fx.primary, 'scratch.txt'), 'untracked\n');
    const status = readStatus(fx.primary);
    expect(status.dirtyFiles).toEqual([]);
    expect(evaluate(status).ok).toBe(true);
  });

  it('counts how far behind origin/main the checkout is', () => {
    advanceOrigin(3);
    const status = readStatus(fx.primary);
    expect(status.behindMain).toBe(3);
    expect(evaluate(status, DEFAULT_BEHIND_LIMIT).ok).toBe(true);
  });

  it('fails once the checkout is past the behind-limit', () => {
    advanceOrigin(3);
    const verdict = evaluate(readStatus(fx.primary), 2);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('commits behind origin/main');
  });
});

describe('a primary parked off main', () => {
  it('is reported even when its own upstream says it is current', () => {
    // The gap a reviewer found: `behind` measured against <branch>@{u} is 0 on a
    // feature branch while main drifts arbitrarily far. That is the exact
    // 105-commit staleness this guard exists for, reported as clean.
    git(['checkout', '-qb', 'feature'], fx.primary);
    git(['push', '-qu', 'origin', 'feature'], fx.primary);
    advanceOrigin(30);

    const status = readStatus(fx.primary);
    expect(status.onMain).toBe(false);
    expect(status.behind).toBe(0); // 0 behind origin/feature
    expect(status.behindMain).toBe(30); // but 30 behind main
    const verdict = evaluate(status, DEFAULT_BEHIND_LIMIT);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('not main');
  });
});

describe('the real failure this guard exists for', () => {
  it('fires on the exact state that froze main for 5 days', () => {
    advanceOrigin(1); // upstream changed the same file
    writeFileSync(join(fx.primary, 'tracked.txt'), 'the MYK9-464 draft\n');

    const verdict = evaluate(readStatus(fx.primary));
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('abort every');

    // Positive control: git itself must really refuse, so this is pinned to
    // git's behaviour and not to our belief about it. In the shared-fixture
    // version this silently stopped reproducing under some shuffle orders.
    let pullFailed = false;
    let message = '';
    try {
      git(['merge', '--ff-only', 'origin/main'], fx.primary);
    } catch (error) {
      pullFailed = true;
      message = error instanceof Error ? error.message : String(error);
    }
    expect(pullFailed).toBe(true);
    expect(message).toContain('would be overwritten by merge');
  });

  it('passes once the edit is cleared and the pull can proceed', () => {
    advanceOrigin(1);
    writeFileSync(join(fx.primary, 'tracked.txt'), 'draft\n');
    git(['checkout', '--', 'tracked.txt'], fx.primary);
    git(['merge', '--ff-only', 'origin/main'], fx.primary);

    const verdict = evaluate(readStatus(fx.primary));
    expect(verdict.ok).toBe(true);
    expect(readStatus(fx.primary).behindMain).toBe(0);
  });
});

describe('render', () => {
  const dirty: PrimaryCheckoutStatus = {
    primaryPath: '/tmp/a b/repo',
    branch: 'main',
    dirtyFiles: ['src/x.ts'],
    behind: 40,
    upstream: 'origin/main',
    behindMain: 40,
    onMain: true,
  };

  it('quotes the path so the remedy is copy-pasteable when it contains a space', () => {
    const out = render(evaluate(dirty, 20));
    expect(out).toContain('"/tmp/a b/repo"');
    expect(out).toContain('src/x.ts');
  });

  it('never points the user at a shared /tmp path for their only copy', () => {
    // LESSONS shared-tmp-log: two sessions following the remedy would clobber
    // each other's backup of unrecoverable uncommitted work.
    const out = render(evaluate(dirty, 20));
    expect(out).not.toContain('> /tmp/');
  });

  it('backs up with `git diff HEAD`, which includes STAGED changes', () => {
    // Plain `git diff` omits the index, so a staged-only edit produces an empty
    // "backup" while `git restore <file>` is a no-op and the pull still aborts.
    const out = render(evaluate(dirty, 20));
    expect(out).toContain('diff HEAD');
  });
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DEFAULT_BEHIND_LIMIT,
  evaluate,
  findPrimaryCheckout,
  readStatus,
  render,
  type PrimaryCheckoutStatus,
} from './primary-checkout.ts';

/**
 * These build REAL git repositories rather than stubbing git. A guard tested only
 * against invented fixtures has never met its own subject (LESSONS
 * label-rule-vs-real-columns), and a text-level assertion would certify a no-op
 * (LESSONS source-text-tests).
 */

function git(args: readonly string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

let root: string;
let origin: string;
let primary: string;

beforeAll(() => {
  // The directory name carries a SPACE on purpose: this repo lives under
  // "AI Projects", and a guard that shells out via a string splits that into two
  // arguments (LESSONS guard-word-split). These tests fail if that regresses.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'myk9 primary guard ')));

  git(['init', '--bare', '--initial-branch=main', 'origin repo'], root);
  origin = join(root, 'origin repo');

  primary = join(root, 'primary checkout');
  git(['clone', origin, 'primary checkout'], root);
  git(['config', 'user.email', 'guard@test.local'], primary);
  git(['config', 'user.name', 'Guard Test'], primary);
  git(['config', 'commit.gpgsign', 'false'], primary);

  writeFileSync(join(primary, 'tracked.txt'), 'base\n');
  writeFileSync(join(primary, 'other.txt'), 'other base\n');
  git(['add', '.'], primary);
  git(['commit', '-m', 'base'], primary);
  git(['push', '-u', 'origin', 'main'], primary);
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** Advance origin/main by n commits without touching the primary's working tree. */
function advanceOrigin(n: number): void {
  const pusher = join(root, 'pusher');
  rmSync(pusher, { recursive: true, force: true });
  git(['clone', origin, 'pusher'], root);
  git(['config', 'user.email', 'guard@test.local'], pusher);
  git(['config', 'user.name', 'Guard Test'], pusher);
  git(['config', 'commit.gpgsign', 'false'], pusher);
  for (let i = 0; i < n; i += 1) {
    writeFileSync(join(pusher, 'tracked.txt'), `upstream ${i}\n`);
    git(['add', '.'], pusher);
    git(['commit', '-m', `upstream ${i}`], pusher);
  }
  git(['push', 'origin', 'main'], pusher);
  git(['fetch', 'origin'], primary);
}

describe('findPrimaryCheckout', () => {
  it('returns the primary working tree when called from the primary itself', () => {
    expect(findPrimaryCheckout(primary)).toBe(primary);
  });

  it('returns the PRIMARY tree when called from inside a linked worktree', () => {
    // The whole point of the guard: it must look past wherever the agent is
    // working and report on the primary checkout.
    const linked = join(root, 'linked worktree');
    git(['worktree', 'add', '-b', 'feature', linked, 'main'], primary);
    try {
      expect(findPrimaryCheckout(linked)).toBe(primary);
    } finally {
      git(['worktree', 'remove', '--force', linked], primary);
    }
  });
});

describe('readStatus', () => {
  it('reports a clean, current checkout as clean', () => {
    const status = readStatus(primary);
    expect(status.dirtyFiles).toEqual([]);
    expect(status.branch).toBe('main');
    expect(status.behind).toBe(0);
    expect(evaluate(status).ok).toBe(true);
  });

  it('detects an uncommitted tracked modification', () => {
    writeFileSync(join(primary, 'tracked.txt'), 'locally edited\n');
    try {
      const status = readStatus(primary);
      expect(status.dirtyFiles).toEqual(['tracked.txt']);
      expect(evaluate(status).ok).toBe(false);
    } finally {
      git(['checkout', '--', 'tracked.txt'], primary);
    }
  });

  it('ignores untracked files, which do not abort a pull', () => {
    // .agents/skills/impeccable/ was untracked in the real checkout and did NOT
    // block the pull; flagging untracked would fire on harmless scratch dirs.
    writeFileSync(join(primary, 'scratch.txt'), 'untracked\n');
    try {
      const status = readStatus(primary);
      expect(status.dirtyFiles).toEqual([]);
      expect(evaluate(status).ok).toBe(true);
    } finally {
      rmSync(join(primary, 'scratch.txt'), { force: true });
    }
  });

  it('counts how far behind upstream the checkout is', () => {
    advanceOrigin(3);
    const status = readStatus(primary);
    expect(status.behind).toBe(3);
    expect(status.upstream).toBe('origin/main');
    // Below the limit, so still a pass.
    expect(evaluate(status, DEFAULT_BEHIND_LIMIT).ok).toBe(true);
  });

  it('fails once the checkout is past the behind-limit', () => {
    const verdict = evaluate(readStatus(primary), 2);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join('\n')).toContain('commits behind origin/main');
  });
});

describe('the real failure this guard exists for', () => {
  it('fires on the exact state that froze main for 5 days', () => {
    // An uncommitted edit to a file upstream also changed.
    writeFileSync(join(primary, 'tracked.txt'), 'the MYK9-464 draft\n');
    try {
      const verdict = evaluate(readStatus(primary));
      expect(verdict.ok).toBe(false);
      expect(verdict.reasons.join('\n')).toContain('abort every');

      // Positive control: confirm git really does refuse here, so this test is
      // pinned to actual git behaviour and not to our belief about it.
      let pullFailed = false;
      let message = '';
      try {
        git(['merge', '--ff-only', 'origin/main'], primary);
      } catch (error) {
        pullFailed = true;
        message = error instanceof Error ? error.message : String(error);
      }
      expect(pullFailed).toBe(true);
      expect(message).toContain('would be overwritten by merge');
    } finally {
      git(['checkout', '--', 'tracked.txt'], primary);
    }
  });

  it('passes once the edit is cleared and the pull can proceed', () => {
    git(['merge', '--ff-only', 'origin/main'], primary);
    const verdict = evaluate(readStatus(primary));
    expect(verdict.ok).toBe(true);
    expect(readStatus(primary).behind).toBe(0);
  });
});

describe('render', () => {
  const dirty: PrimaryCheckoutStatus = {
    primaryPath: '/tmp/a b/repo',
    branch: 'main',
    dirtyFiles: ['src/x.ts'],
    behind: 40,
    upstream: 'origin/main',
  };

  it('quotes the path so the remedy is copy-pasteable when it contains a space', () => {
    const out = render(evaluate(dirty, 20));
    expect(out).toContain('"/tmp/a b/repo"');
    expect(out).toContain('src/x.ts');
  });
});

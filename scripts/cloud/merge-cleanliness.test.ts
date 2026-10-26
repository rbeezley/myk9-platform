/**
 * isCleanMerge against real merges in a throwaway repository, so the test
 * proves what git does rather than what a stub says it does.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isCleanMerge } from './merge-cleanliness.ts';

let repo: string;
const shas: Record<string, string> = {};

// No user config or hooks leak in from the machine running the test.
function git(...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } }
  ).trim();
}

function commitFile(name: string, content: string, message: string): string {
  writeFileSync(join(repo, name), content);
  git('add', name);
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'merge-cleanliness-'));
  git('init', '-q', '-b', 'main');
  commitFile('shared.txt', 'base\n', 'base');

  // A clean merge: the branches touch different files.
  git('checkout', '-q', '-b', 'feature');
  shas.feature = commitFile('feature.txt', 'feature\n', 'feature work');
  git('checkout', '-q', 'main');
  commitFile('main.txt', 'main\n', 'main work');
  git('checkout', '-q', 'feature');
  git('merge', '-q', '--no-edit', 'main');
  shas.clean = git('rev-parse', 'HEAD');

  // An "evil" merge: conflict-free, but amended to add a file neither parent has.
  writeFileSync(join(repo, 'smuggled.txt'), 'new code\n');
  git('add', 'smuggled.txt');
  git('commit', '-q', '--amend', '--no-edit');
  shas.evil = git('rev-parse', 'HEAD');
  git('reset', '-q', '--hard', shas.clean);

  // A conflicted merge, resolved by hand.
  git('checkout', '-q', 'main');
  commitFile('shared.txt', 'main edit\n', 'main edits shared');
  git('checkout', '-q', 'feature');
  commitFile('shared.txt', 'feature edit\n', 'feature edits shared');
  try {
    git('merge', '-q', '--no-edit', 'main');
  } catch {
    // Expected: the conflict.
  }
  writeFileSync(join(repo, 'shared.txt'), 'resolved by hand\n');
  git('add', 'shared.txt');
  git('commit', '-q', '--no-edit');
  shas.resolved = git('rev-parse', 'HEAD');
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('isCleanMerge', () => {
  it('is true for a merge whose tree is exactly the automatic merge of its parents', () => {
    expect(isCleanMerge(shas.clean!, repo)).toBe(true);
  });

  it('is false for a conflicted merge resolved by hand', () => {
    expect(isCleanMerge(shas.resolved!, repo)).toBe(false);
  });

  it('is false for a conflict-free merge that adds a change of its own', () => {
    expect(isCleanMerge(shas.evil!, repo)).toBe(false);
  });

  it('is false for an ordinary commit', () => {
    expect(isCleanMerge(shas.feature!, repo)).toBe(false);
  });

  it('is false, not an exception, for a commit the repository does not have', () => {
    expect(isCleanMerge('0'.repeat(40), repo)).toBe(false);
  });
});

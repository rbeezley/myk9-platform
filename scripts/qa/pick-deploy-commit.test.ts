import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * MYK9-896: "Deploy myK9Show" took `head -n 1` of `gh run list` as the newest
 * green commit and shipped a 2026-09-03 commit over ~780 newer ones. These tests
 * run the real script against a throwaway repo and a stub `gh` whose green list
 * comes back in whatever order the test wants, so the API order can never matter.
 */
const SCRIPT = resolve(import.meta.dirname, 'pick-deploy-commit.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  }).trim();
}

interface Fixture {
  repo: string;
  /** main commits, oldest first: shas[0] is the root, the last is origin/main. */
  shas: string[];
  /** a commit reachable from main only through a merge's second parent. */
  sideSha: string;
}

function makeRepo(mainCommits: number): Fixture {
  const repo = mkdtempSync(join(tmpdir(), 'pick-deploy-'));
  dirs.push(repo);
  git(repo, 'init', '-q', '-b', 'main');
  const shas: string[] = [];
  const commit = (subject: string): string => {
    git(repo, 'commit', '-q', '--allow-empty', '-m', subject);
    return git(repo, 'rev-parse', 'HEAD');
  };
  shas.push(commit('c0'));
  git(repo, 'checkout', '-q', '-b', 'feature');
  const sideSha = commit('side work');
  git(repo, 'checkout', '-q', 'main');
  shas.push(commit('c1'));
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge feature', 'feature');
  shas.push(git(repo, 'rev-parse', 'HEAD'));
  for (let i = shas.length; i < mainCommits; i += 1) shas.push(commit(`c${i}`));
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { repo, shas, sideSha };
}

function run(
  fx: Fixture,
  green: string[],
  env: Record<string, string> = {}
): { status: number | null; stdout: string; stderr: string; output: string } {
  const bin = mkdtempSync(join(tmpdir(), 'gh-stub-'));
  dirs.push(bin);
  const listing = join(bin, 'green.txt');
  writeFileSync(listing, green.map(s => `${s}\n`).join(''));
  // Stub for: gh run list ... --jq '.[].headSha' -> one SHA per line, in the
  // order the test chose (that order is the thing under test).
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\ncat "${listing}"\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  const out = join(bin, 'github-output');
  writeFileSync(out, '');
  const r = spawnSync('bash', [SCRIPT], {
    cwd: fx.repo,
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: process.env.HOME,
      GITHUB_OUTPUT: out,
      REQUESTED_SHA: '',
      ...env,
    },
  });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    output: readFileSync(out, 'utf8'),
  };
}

describe('pick-deploy-commit.sh', () => {
  it('picks the newest main commit that is green even when the green list is out of order', () => {
    const fx = makeRepo(12);
    const newest = fx.shas[11]!;
    const older = fx.shas[8]!;
    const oldest = fx.shas[3]!;
    // The 2026-09-03 incident shape: the newest green SHA is NOT first.
    const r = run(fx, [oldest, older, newest]);
    expect(r.status).toBe(0);
    expect(r.output).toBe(`commit_sha=${newest}\n`);
    // and the old `head -n 1` rule would have shipped the ancient one
    expect([oldest, older, newest][0]).toBe(oldest);
  });

  it('skips newer main commits that are not green and reports how far behind it is', () => {
    const fx = makeRepo(12);
    const green = fx.shas[8]!;
    const r = run(fx, [fx.shas[3]!, green]);
    expect(r.status).toBe(0);
    expect(r.output).toBe(`commit_sha=${green}\n`);
    expect(r.stdout).toContain(green);
    expect(r.stdout).toContain('c8');
    expect(r.stdout).toContain('3 commit(s)');
  });

  it('fails when the newest green commit is more than 50 commits behind main', () => {
    const fx = makeRepo(60);
    const r = run(fx, [fx.shas[3]!]);
    expect(r.status).toBe(1);
    expect(r.output).toBe('');
    expect(r.stderr).toMatch(/56 commits behind/);
    expect(r.stderr).toMatch(/limit 50/);
  });

  it('allows exactly 50 commits behind', () => {
    const fx = makeRepo(60);
    const r = run(fx, [fx.shas[9]!]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('50 commit(s)');
  });

  it('honours an explicit commit_sha unchanged, even far behind main', () => {
    const fx = makeRepo(60);
    const pinned = fx.shas[3]!;
    const r = run(fx, [fx.shas[59]!, pinned], { REQUESTED_SHA: pinned });
    expect(r.status).toBe(0);
    expect(r.output).toBe(`commit_sha=${pinned}\n`);
  });

  it('still rejects an explicit commit_sha that is not green, malformed, or off main', () => {
    const fx = makeRepo(12);
    const notGreen = run(fx, [fx.shas[11]!], { REQUESTED_SHA: fx.shas[5]! });
    expect(notGreen.status).toBe(1);
    expect(notGreen.stderr).toContain('no successful main CI push run');

    const short = run(fx, [fx.shas[11]!], { REQUESTED_SHA: fx.shas[11]!.slice(0, 12) });
    expect(short.status).toBe(1);
    expect(short.stderr).toContain('40-character');

    git(fx.repo, 'checkout', '-q', '-b', 'stray', fx.shas[11]!);
    git(fx.repo, 'commit', '-q', '--allow-empty', '-m', 'stray');
    const stray = git(fx.repo, 'rev-parse', 'HEAD');
    const offMain = run(fx, [stray], { REQUESTED_SHA: stray });
    expect(offMain.status).toBe(1);
    expect(offMain.stderr).toContain('not reachable');
  });

  it('never auto-picks a green SHA that is not on main first-parent history', () => {
    const fx = makeRepo(12);
    const r = run(fx, [fx.sideSha, fx.shas[5]!]);
    expect(r.status).toBe(0);
    expect(r.output).toBe(`commit_sha=${fx.shas[5]!}\n`);
    const onlySide = run(fx, [fx.sideSha]);
    expect(onlySide.status).toBe(1);
    expect(onlySide.stderr).toContain('first-parent');
  });

  it('fails when nothing on main is green', () => {
    const fx = makeRepo(12);
    const r = run(fx, ['0'.repeat(40)]);
    expect(r.status).toBe(1);
    expect(r.output).toBe('');
  });
});

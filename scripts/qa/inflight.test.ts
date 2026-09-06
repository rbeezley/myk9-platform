import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  committedPaths,
  findOverlaps,
  pathsOverlap,
  renderOverlaps,
  statusPaths,
  type ChangeSource,
} from './inflight';

const SCRIPT = resolve(import.meta.dirname, 'inflight.ts');

describe('pathsOverlap', () => {
  it.each([
    ['a/b.ts', 'a/b.ts', true],
    ['a', 'a/b.ts', true],
    ['a/b.ts', 'a', true],
    ['./a/b.ts', 'a/b.ts', true],
    ['a/', 'a/b/c.ts', true],
    ['a/b.ts', 'a/c.ts', false],
    ['ab', 'a/b.ts', false],
    ['a/b', 'a/bc/d.ts', false],
    ['', 'a', false],
  ])('%j vs %j -> %s', (a, b, want) => {
    expect(pathsOverlap(a, b)).toBe(want);
  });
});

describe('findOverlaps', () => {
  const pr: ChangeSource = {
    kind: 'pr',
    id: '#2062',
    branch: 'worktree-track-agents-skills',
    files: ['.agents/skills/qa/SKILL.md', '.agents/skills/wizard/template.sh'],
  };
  const wt: ChangeSource = {
    kind: 'worktree',
    id: '/wt/other',
    branch: 'claude/other',
    files: ['apps/myk9show/src/x.ts'],
  };

  it('reports the #2062 case: a directory this branch touches that an open PR already changed', () => {
    const o = findOverlaps(['.agents/skills'], [pr, wt]);
    expect(o.map(x => x.source.id)).toEqual(['#2062', '#2062']);
  });

  it('excludes the current branch and its own PR', () => {
    expect(
      findOverlaps(['.agents/skills'], [pr], { branch: 'worktree-track-agents-skills' })
    ).toEqual([]);
    expect(findOverlaps(['.agents/skills'], [pr], { prNumber: 2062 })).toEqual([]);
  });

  it('finds work in another worktree that has no PR yet', () => {
    expect(findOverlaps(['apps/myk9show/src/x.ts'], [pr, wt])[0].source.kind).toBe('worktree');
  });

  it('is empty when nothing overlaps', () => {
    expect(findOverlaps(['docs/README.md'], [pr, wt])).toEqual([]);
  });

  it('renders a readable, grouped report', () => {
    const text = renderOverlaps(findOverlaps(['.agents/skills'], [pr]));
    expect(text).toContain('pr #2062');
    expect(text).toContain('.agents/skills  ~  .agents/skills/qa/SKILL.md');
    expect(renderOverlaps([])).toMatch(/no open PR/);
  });
});

/** CLI against a real temp repo (two worktrees) and a stub `gh` on PATH. */
describe('inflight CLI', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function git(cwd: string, ...args: string[]) {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  }

  function repo(): { main: string; other: string; bin: string } {
    const root = mkdtempSync(join(tmpdir(), 'inflight-'));
    dirs.push(root);
    const main = join(root, 'repo');
    mkdirSync(main);
    git(main, 'init', '-q', '-b', 'main');
    git(main, 'config', 'user.email', 't@t');
    git(main, 'config', 'user.name', 't');
    mkdirSync(join(main, 'src'));
    writeFileSync(join(main, 'src', 'a.ts'), 'a');
    writeFileSync(join(main, 'README.md'), 'r');
    git(main, 'add', '.');
    git(main, 'commit', '-q', '-m', 'base');
    git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    // Another worktree with an UNCOMMITTED edit — work with no PR.
    const other = join(root, 'other');
    git(main, 'worktree', 'add', '-q', '-b', 'other-branch', other);
    writeFileSync(join(other, 'src', 'a.ts'), 'edited elsewhere');
    // Our branch, with a committed change to a different file.
    git(main, 'checkout', '-q', '-b', 'mine');
    writeFileSync(join(main, 'src', 'b.ts'), 'b');
    git(main, 'add', 'src/b.ts');
    git(main, 'commit', '-q', '-m', 'mine');
    const bin = join(root, 'bin');
    mkdirSync(bin);
    return { main, other, bin };
  }

  /** Stub gh: `pr list --state open` -> prs, `--state merged` -> merged; `fail` makes every call exit 1. */
  function stubGh(bin: string, prs: unknown[], merged: string[] = [], fail = false) {
    writeFileSync(join(bin, 'open.json'), JSON.stringify(prs));
    writeFileSync(
      join(bin, 'merged.json'),
      JSON.stringify(merged.map(headRefName => ({ headRefName })))
    );
    const body = fail
      ? ['#!/usr/bin/env bash', 'echo "gh: not logged in" >&2', 'exit 1', ''].join(
          String.fromCharCode(10)
        )
      : [
          '#!/usr/bin/env bash',
          `case "$*" in *"--state merged"*) cat "${join(bin, 'merged.json')}";; *) cat "${join(bin, 'open.json')}";; esac`,
          '',
        ].join(String.fromCharCode(10));
    writeFileSync(join(bin, 'gh'), body);
    chmodSync(join(bin, 'gh'), 0o755);
  }

  function runCli(cwd: string, bin: string, ...args: string[]): { code: number; out: string } {
    try {
      const out = execFileSync(
        'node',
        [
          '--experimental-strip-types',
          '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
          SCRIPT,
          ...args,
        ],
        {
          cwd,
          encoding: 'utf8',
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      return { code: 0, out };
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string };
      return { code: e.status, out: `${e.stdout}${e.stderr}` };
    }
  }

  it('reads porcelain paths without eating the first character (leading-space status column)', () => {
    const { other } = repo();
    // ` M src/a.ts` — the index column is a space; trimming it broke slice(3).
    expect(statusPaths(other)).toEqual(['src/a.ts']);
  });

  it('fails when an open PR touches a path this branch changes, and names it', () => {
    const { main, bin } = repo();
    stubGh(bin, [
      {
        number: 2062,
        headRefName: 'someone-else',
        url: 'https://x/pull/2062',
        author: { login: 'rb' },
        files: [{ path: 'src/b.ts' }],
      },
    ]);
    const r = runCli(main, bin);
    expect(r.code).toBe(1);
    expect(r.out).toContain('pr #2062');
    expect(r.out).toContain('src/b.ts');
  });

  it('fails on an UNCOMMITTED edit in another worktree — work with no PR yet', () => {
    const { main, bin } = repo();
    stubGh(bin, []);
    const r = runCli(main, bin, 'src/a.ts');
    expect(r.code).toBe(1);
    expect(r.out).toContain('worktree');
    expect(r.out).toContain('other-branch');
  });

  it('passes when nothing in flight overlaps', () => {
    const { main, bin } = repo();
    stubGh(bin, [{ number: 1, headRefName: 'x', files: [{ path: 'docs/other.md' }] }]);
    const r = runCli(main, bin);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/no open PR/);
  });

  it("excludes the current branch's own PR", () => {
    const { main, bin } = repo();
    stubGh(bin, [{ number: 7, headRefName: 'mine', files: [{ path: 'src/b.ts' }] }]);
    expect(runCli(main, bin).code).toBe(0);
  });

  it('exits 2, not 0, when gh cannot list PRs — an unknown PR list is never a clean result', () => {
    const { main, bin } = repo();
    stubGh(bin, [], [], true);
    const r = runCli(main, bin);
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT a clean result');
  });

  it('ignores a local branch whose PR already squash-merged', () => {
    const { main, bin } = repo();
    git(main, 'checkout', '-q', '-b', 'finished');
    writeFileSync(join(main, 'src', 'b.ts'), 'finished elsewhere');
    git(main, 'add', 'src/b.ts');
    git(main, 'commit', '-q', '-m', 'finished');
    git(main, 'checkout', '-q', 'mine');
    stubGh(bin, [], ['finished']);
    expect(runCli(main, bin).code).toBe(0);
    stubGh(bin, [], []);
    const r = runCli(main, bin);
    expect(r.code).toBe(1);
    expect(r.out).toContain('branch finished');
  });

  it('counts both sides of a rename in another worktree', () => {
    const { main, other, bin } = repo();
    git(other, 'mv', 'src/a.ts', 'src/renamed.ts');
    stubGh(bin, []);
    expect(runCli(main, bin, 'src/a.ts').code).toBe(1);
    expect(runCli(main, bin, 'src/renamed.ts').code).toBe(1);
  });

  it('keeps the UNCOMMITTED files of a worktree whose branch already merged', () => {
    const { main, bin } = repo();
    stubGh(bin, [], ['other-branch']);
    const r = runCli(main, bin, 'src/a.ts');
    expect(r.code).toBe(1);
    expect(r.out).toContain('worktree');
  });

  it('counts both sides of a COMMITTED rename on another branch', () => {
    const { main, bin } = repo();
    // Cut from origin/main, not from `mine`, so only the rename is past the base.
    git(main, 'checkout', '-q', '-b', 'renamer', 'origin/main');
    git(main, 'mv', 'src/a.ts', 'src/moved.ts');
    git(main, 'commit', '-q', '-m', 'rename');
    git(main, 'checkout', '-q', 'mine');
    expect(committedPaths('origin/main', 'renamer', main).sort()).toEqual([
      'src/a.ts',
      'src/moved.ts',
    ]);
    stubGh(bin, []);
    expect(runCli(main, bin, 'src/a.ts').code).toBe(1);
    expect(runCli(main, bin, 'src/moved.ts').code).toBe(1);
  });

  it('reads a path containing a space and a non-ASCII character verbatim', () => {
    const { main, other, bin } = repo();
    mkdirSync(join(other, 'docs'), { recursive: true });
    writeFileSync(join(other, 'docs', 'show day café.md'), 'x');
    expect(statusPaths(other)).toContain('docs/show day café.md');
    stubGh(bin, []);
    expect(runCli(main, bin, 'docs/show day café.md').code).toBe(1);
  });

  it('enumerates every local branch — the 45th, oldest branch is still found', () => {
    const { main, bin } = repo();
    git(main, 'checkout', '-q', '-b', 'oldest', 'origin/main');
    writeFileSync(join(main, 'src', 'b.ts'), 'old work');
    git(main, 'add', 'src/b.ts');
    execFileSync('git', ['commit', '-q', '-m', 'old'], {
      cwd: main,
      env: { ...process.env, GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' },
      stdio: 'ignore',
    });
    for (let i = 0; i < 44; i += 1) {
      git(main, 'checkout', '-q', '-b', `newer-${i}`, 'origin/main');
      writeFileSync(join(main, `n${i}.txt`), 'x');
      git(main, 'add', `n${i}.txt`);
      git(main, 'commit', '-q', '-m', `n${i}`);
    }
    git(main, 'checkout', '-q', 'mine');
    stubGh(bin, []);
    const r = runCli(main, bin, 'src/b.ts');
    expect(r.code).toBe(1);
    expect(r.out).toContain('branch oldest');
  });

  it('exits 2 when a git comparison cannot run (unknown base) — never a clean result', () => {
    const { main, bin } = repo();
    stubGh(bin, []);
    const r = runCli(main, bin, '--base=refs/remotes/origin/does-not-exist');
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT a clean result');
  });

  it('inspects commits in a DETACHED worktree', () => {
    const { main, bin } = repo();
    const detached = join(main, '..', 'detached');
    git(main, 'worktree', 'add', '-q', '--detach', detached, 'origin/main');
    writeFileSync(join(detached, 'src', 'a.ts'), 'detached work');
    git(detached, 'add', 'src/a.ts');
    git(detached, 'commit', '-q', '-m', 'detached');
    stubGh(bin, []);
    const r = runCli(main, bin, 'src/a.ts');
    expect(r.code).toBe(1);
    expect(r.out).toContain('worktree');
  });

  it('--warn reports but exits 0', () => {
    const { main, bin } = repo();
    stubGh(bin, [{ number: 2062, headRefName: 'someone-else', files: [{ path: 'src/b.ts' }] }]);
    const r = runCli(main, bin, '--warn');
    expect(r.code).toBe(0);
    expect(r.out).toContain('pr #2062');
  });
});

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
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

  function stubGh(bin: string, prs: unknown[]) {
    const file = join(bin, 'prs.json');
    writeFileSync(file, JSON.stringify(prs));
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\ncat "${file}"\n`);
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

  it('--warn reports but exits 0', () => {
    const { main, bin } = repo();
    stubGh(bin, [{ number: 2062, headRefName: 'someone-else', files: [{ path: 'src/b.ts' }] }]);
    const r = runCli(main, bin, '--warn');
    expect(r.code).toBe(0);
    expect(r.out).toContain('pr #2062');
  });
});

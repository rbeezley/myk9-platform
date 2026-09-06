import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    sameRepo: true,
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

  /**
   * Stub gh. `prs` are open PRs (REST shape served paged through /pulls?state=open,
   * files through /pulls/N/files); `merged` maps branch -> merged head sha,
   * answered per branch via `pr list --state merged --head X`; `fail` makes
   * every call exit 1.
   */
  function stubGh(
    bin: string,
    prs: {
      number: number;
      headRefName: string;
      url?: string;
      author?: { login: string };
      fork?: boolean;
      files: { path: string; previous?: string }[];
    }[],
    merged: [string, string][] = [],
    fail = false
  ) {
    // A test may call stubGh twice; stale answer files from the first call must not survive.
    for (const f of readdirSync(bin))
      if (/^(merged-|files-|open\.json)/.test(f)) rmSync(join(bin, f));
    const rest = prs.map(pr => ({
      number: pr.number,
      head: { ref: pr.headRefName, repo: { full_name: pr.fork ? 'someone/fork' : 'o/r' } },
      html_url: pr.url,
      user: pr.author,
    }));
    const openPages: unknown[][] = [];
    for (let i = 0; i < rest.length; i += 100) openPages.push(rest.slice(i, i + 100));
    writeFileSync(join(bin, 'open.json'), JSON.stringify(openPages.length ? openPages : [[]]));
    for (const [branch, sha] of merged)
      writeFileSync(join(bin, `merged-${branch}.json`), JSON.stringify([{ headRefOid: sha }]));
    for (const pr of prs) {
      const files = pr.files.map(f => ({ filename: f.path, previous_filename: f.previous }));
      const pages: unknown[][] = [];
      for (let i = 0; i < files.length; i += 100) pages.push(files.slice(i, i + 100));
      writeFileSync(
        join(bin, `files-${pr.number}.json`),
        JSON.stringify(pages.length ? pages : [[]])
      );
    }
    const NL = String.fromCharCode(10);
    const body = fail
      ? ['#!/usr/bin/env bash', 'echo "gh: not logged in" >&2', 'exit 1', ''].join(NL)
      : [
          '#!/usr/bin/env bash',
          'case "$*" in',
          `  *"repo view"*) echo '{"nameWithOwner":"o/r"}';;`,
          `  *"--state merged"*) b=$(printf '%s' "$*" | sed -E 's#.*--head ([^ ]+).*#\\1#'); f="${bin}/merged-$b.json"; if [ -f "$f" ]; then cat "$f"; else echo '[]'; fi;;`,
          `  *"/pulls/"*"/files"*) n=$(printf '%s' "$*" | sed -E 's#.*/pulls/([0-9]+)/files.*#\\1#'); cat "${bin}/files-$n.json";;`,
          `  *"/pulls?state=open"*) cat "${join(bin, 'open.json')}";;`,
          `  *) echo "stub gh: unexpected args: $*" >&2; exit 1;;`,
          'esac',
          '',
        ].join(NL);
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
    const finishedTip = git(main, 'rev-parse', 'finished').trim();
    git(main, 'checkout', '-q', 'mine');
    // The merged PR's head IS this tip: nothing new since the merge.
    stubGh(bin, [], [['finished', finishedTip]]);
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
    stubGh(bin, [], [['other-branch', git(main, 'rev-parse', 'other-branch').trim()]]);
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
    expect(committedPaths('renamer', ['origin/main'], main).sort()).toEqual([
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

  it('reads every file of a PR with more than 100 files', () => {
    const { main, bin } = repo();
    const files = Array.from({ length: 149 }, (_, i) => ({ path: `docs/f${i}.md` }));
    files.push({ path: 'src/b.ts' });
    stubGh(bin, [{ number: 9, headRefName: 'big', files }]);
    const r = runCli(main, bin);
    expect(r.code).toBe(1);
    expect(r.out).toContain('pr #9');
  });

  it("counts a PR rename's ORIGINAL path", () => {
    const { main, bin } = repo();
    stubGh(bin, [
      { number: 4, headRefName: 'mover', files: [{ path: 'src/moved.ts', previous: 'src/b.ts' }] },
    ]);
    expect(runCli(main, bin).code).toBe(1);
  });

  it('treats a merged branch name with NEW commits past the merged head as in flight again', () => {
    const { main, bin } = repo();
    git(main, 'checkout', '-q', '-b', 'reused', 'origin/main');
    writeFileSync(join(main, 'src', 'b.ts'), 'first, merged');
    git(main, 'add', 'src/b.ts');
    git(main, 'commit', '-q', '-m', 'merged work');
    const mergedHead = git(main, 'rev-parse', 'HEAD').trim();
    writeFileSync(join(main, 'src', 'b.ts'), 'second, after the merge');
    git(main, 'add', 'src/b.ts');
    git(main, 'commit', '-q', '-m', 'new work on a reused name');
    git(main, 'checkout', '-q', 'mine');
    stubGh(bin, [], [['reused', mergedHead]]);
    const r = runCli(main, bin);
    expect(r.code).toBe(1);
    expect(r.out).toContain('branch reused');
    git(main, 'branch', '-f', 'reused', mergedHead);
    expect(runCli(main, bin).code).toBe(0);
  });

  it('pages the open-PR inventory — the 150th open PR is still found', () => {
    const { main, bin } = repo();
    const prs = Array.from({ length: 149 }, (_, i) => ({
      number: i + 1,
      headRefName: `other-${i}`,
      files: [{ path: `docs/f${i}.md` }],
    }));
    prs.push({ number: 150, headRefName: 'overlapper', files: [{ path: 'src/b.ts' }] });
    stubGh(bin, prs);
    const r = runCli(main, bin);
    expect(r.code).toBe(1);
    expect(r.out).toContain('pr #150');
  });

  it('does not re-report the already-shipped commits of a reused, unrebased branch', () => {
    const { main, bin } = repo();
    // First commit changed src/a.ts and was squash-merged; the branch was then
    // reused for a commit touching only docs/new.md, without rebasing.
    git(main, 'checkout', '-q', '-b', 'reused', 'origin/main');
    writeFileSync(join(main, 'src', 'a.ts'), 'shipped');
    git(main, 'add', 'src/a.ts');
    git(main, 'commit', '-q', '-m', 'shipped');
    const mergedHead = git(main, 'rev-parse', 'HEAD').trim();
    writeFileSync(join(main, 'docs-new.md'), 'new');
    git(main, 'add', 'docs-new.md');
    git(main, 'commit', '-q', '-m', 'new work');
    git(main, 'checkout', '-q', 'mine');
    // Silence the other worktree's dirty src/a.ts for this case.
    writeFileSync(join(main, '..', 'other', 'src', 'a.ts'), 'a');
    stubGh(bin, [], [['reused', mergedHead]]);
    expect(runCli(main, bin, 'src/a.ts').code).toBe(0); // shipped, not in flight
    expect(runCli(main, bin, 'docs-new.md').code).toBe(1); // the new work is
  });

  it('does not attribute main content merged INTO a reused branch to that branch', () => {
    const { main, bin } = repo();
    git(main, 'checkout', '-q', 'main');
    writeFileSync(join(main, 'main-only.md'), 'from main');
    git(main, 'add', 'main-only.md');
    git(main, 'commit', '-q', '-m', 'main moves on');
    git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(main, 'checkout', '-q', '-b', 'reused', 'origin/main~1');
    writeFileSync(join(main, 'src', 'a.ts'), 'shipped');
    git(main, 'add', 'src/a.ts');
    git(main, 'commit', '-q', '-m', 'shipped');
    const mergedHead = git(main, 'rev-parse', 'HEAD').trim();
    git(main, 'merge', '-q', '--no-edit', 'origin/main');
    writeFileSync(join(main, 'docs-new.md'), 'new');
    git(main, 'add', 'docs-new.md');
    git(main, 'commit', '-q', '-m', 'new work');
    git(main, 'checkout', '-q', 'mine');
    writeFileSync(join(main, '..', 'other', 'src', 'a.ts'), 'a');
    stubGh(bin, [], [['reused', mergedHead]]);
    expect(runCli(main, bin, 'main-only.md').code).toBe(0);
    expect(runCli(main, bin, 'src/a.ts').code).toBe(0);
    expect(runCli(main, bin, 'docs-new.md').code).toBe(1);
  });

  it("counts a merge commit's own conflict resolution, but not what the merge brought in", () => {
    const { main, bin } = repo();
    git(main, 'checkout', '-q', 'main');
    writeFileSync(join(main, 'src', 'a.ts'), 'main version');
    writeFileSync(join(main, 'main-only.md'), 'm');
    git(main, 'add', '.');
    git(main, 'commit', '-q', '-m', 'main edits a');
    git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(main, 'checkout', '-q', '-b', 'resolver', 'origin/main~1');
    writeFileSync(join(main, 'src', 'a.ts'), 'branch version');
    git(main, 'commit', '-q', '-am', 'branch edits a');
    try {
      git(main, 'merge', '-q', '--no-edit', 'origin/main');
    } catch {
      /* conflict expected */
    }
    writeFileSync(join(main, 'src', 'a.ts'), 'resolved by hand');
    writeFileSync(join(main, 'resolution-note.md'), 'why');
    git(main, 'add', '.');
    execFileSync('git', ['commit', '-q', '--no-edit', '-m', 'merge main'], {
      cwd: main,
      stdio: 'ignore',
    });
    git(main, 'checkout', '-q', 'mine');
    writeFileSync(join(main, '..', 'other', 'src', 'a.ts'), 'a');
    stubGh(bin, []);
    expect(committedPaths('resolver', ['origin/main'], main).sort()).toEqual([
      'resolution-note.md',
      'src/a.ts',
    ]);
    expect(runCli(main, bin, 'main-only.md').code).toBe(0);
    expect(runCli(main, bin, 'resolution-note.md').code).toBe(1);
  });

  it('applies the merged-head exclusion to the CURRENT branch as well', () => {
    const { main, bin } = repo();
    const mergedHead = git(main, 'rev-parse', 'HEAD').trim();
    writeFileSync(join(main, 'docs-new.md'), 'new');
    git(main, 'add', 'docs-new.md');
    git(main, 'commit', '-q', '-m', 'new work on mine');
    writeFileSync(join(main, '..', 'other', 'src', 'b.ts'), 'their edit');
    stubGh(bin, [], [['mine', mergedHead]]);
    expect(runCli(main, bin).code).toBe(0);
    stubGh(bin, [], []);
    expect(runCli(main, bin).code).toBe(1);
  });

  it('does not mistake a FORK PR with the same branch name for our own PR', () => {
    const { main, bin } = repo();
    stubGh(bin, [{ number: 7, headRefName: 'mine', fork: true, files: [{ path: 'src/b.ts' }] }]);
    const r = runCli(main, bin);
    expect(r.code).toBe(1);
    expect(r.out).toContain('pr #7');
  });

  it('does not exclude a PR whose ownership is unknown', () => {
    const unknown: ChangeSource = { kind: 'pr', id: '#1', branch: 'mine', files: ['src/b.ts'] };
    expect(findOverlaps(['src/b.ts'], [unknown], { branch: 'mine' })).toHaveLength(1);
  });

  it('--warn reports but exits 0', () => {
    const { main, bin } = repo();
    stubGh(bin, [{ number: 2062, headRefName: 'someone-else', files: [{ path: 'src/b.ts' }] }]);
    const r = runCli(main, bin, '--warn');
    expect(r.code).toBe(0);
    expect(r.out).toContain('pr #2062');
  });
});

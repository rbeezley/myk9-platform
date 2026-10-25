/**
 * Agent instructions find the main checkout instead of naming a Mac path
 * (MYK9-1397). The snippet each skill carries is executed here from a linked
 * worktree under a path with spaces, the shape of the Mac checkout, so the
 * test proves the command works rather than that someone typed it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const SKILL_FILES = [
  '.claude/skills/ship-it/SKILL.md',
  '.claude/skills/ship-pr/SKILL.md',
  '.claude/skills/orchestrate/references/linear-issue-run.md',
];

const SNIPPET_LINE = /^MAIN="\$\(git worktree list --porcelain .*\)"$/m;

describe('tracked agent and script files carry no Mac home path', () => {
  it('has no /Users/ outside test fixtures', () => {
    const tracked = execFileSync(
      'git',
      ['ls-files', '-z', '--', '.claude', '.codex', '.agents', 'scripts'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }
    )
      .split('\0')
      .filter(file => file && !/\.test\.tsx?$/.test(file));
    const offenders = tracked.filter(file => {
      try {
        return readFileSync(join(REPO_ROOT, file), 'utf8').includes('/Users/');
      } catch {
        return false; // a tracked symlink to a directory, or a deleted file
      }
    });
    expect(offenders).toEqual([]);
  });
});

describe('the main-checkout discovery snippet', () => {
  let base: string;
  let main: string;
  let linked: string;

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'discovery ')));
    main = join(base, 'AI Projects', 'myk9-platform');
    linked = join(main, '.claude', 'worktrees', 'issue one');
    mkdirSync(main, { recursive: true });
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', main, ...args], { stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git(
      '-c',
      'user.email=t@example.com',
      '-c',
      'user.name=t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'root'
    );
    git('worktree', 'add', '-q', linked, '-b', 'claude/issue-one');
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it.each(SKILL_FILES)('%s resolves the main checkout from a linked worktree', file => {
    const snippet = SNIPPET_LINE.exec(readFileSync(join(REPO_ROOT, file), 'utf8'))?.[0];
    expect(snippet).toBeDefined();
    const result = spawnSync('bash', ['-c', `${snippet}\nprintf '%s' "$MAIN"`], {
      cwd: linked,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(main);
  });
});

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBranchPushes } from './push-squash-base';

const HOOKS = resolve(import.meta.dirname, '../../.githooks');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * Throwaway repo + bare remote; the real pre-push hook runs. `main` holds a base commit. `other`
 * simulates another session: it lands changes on remote main and the repo's `origin/main` moves
 * under the feature branch (git worktrees share refs, so a fetch elsewhere does exactly this).
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'myk9-push-squash-'));
  roots.push(root);
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['init', '-q', '--initial-branch=main', repo]);
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('remote', 'add', 'origin', remote);
  const gh = join(root, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
case "$*" in
  'api repos/{owner}/{repo} --jq .full_name') echo 'owner/repo' ;;
  'api search/issues?q='*) echo '{"total_count":0,"incomplete_results":false,"items":[]}' ;;
  *) echo '[]' ;;
esac
`
  );
  chmodSync(gh, 0o755);
  const commit = (file: string, message: string) => {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), `${message}\n`);
    git('add', file);
    git('commit', '-qm', message);
    return git('rev-parse', 'HEAD').trim();
  };
  const push = (args: string[], env: Record<string, string> = {}) => {
    const result = spawnSync('git', ['-C', repo, 'push', ...args], {
      encoding: 'utf8',
      env: { ...process.env, GH_BIN: gh, ...env },
    });
    return { code: result.status, output: `${result.stdout}${result.stderr}` };
  };
  commit('base.txt', 'base');
  // The base reaches remote main before the hook is installed.
  expect(push(['origin', 'main']).code).toBe(0);
  git('config', 'core.hooksPath', HOOKS);
  git('checkout', '-qb', 'feature');
  commit('work/one.ts', 'wip 1');
  commit('work/two.ts', 'wip 2');
  commit('work/three.ts', 'wip 3');
  const originalTip = git('rev-parse', 'HEAD').trim();
  /** Someone else's merged PRs: change files the branch never touched, then fetch (moves origin/main). */
  const mainMoves = () => {
    git('checkout', '-q', 'main');
    commit('merged/a.ts', 'PR A');
    commit('merged/b.ts', 'PR B');
    // Other sessions' app-file merges would trip the docs-only main guard; that is not under test.
    expect(push(['origin', 'main'], { MYK9_ALLOW_NON_DOCS_MAIN_PUSH: '1' }).code).toBe(0);
    git('checkout', '-q', 'feature');
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'main').trim());
    // Rewind local main to the old base, as a worktree that was cut before the other fetch.
    git('branch', '-f', 'main', 'main~2');
  };
  return { git, commit, push, originalTip, mainMoves };
}

describe('push-squash-base parsing', () => {
  it('reads only branch updates that are not deletions or main', () => {
    const zero = '0'.repeat(40);
    expect(
      parseBranchPushes(
        `refs/heads/x aaa refs/heads/feature bbb\nrefs/heads/m ccc refs/heads/main ddd\n` +
          `(delete) ${zero} refs/heads/gone eee\nrefs/tags/t fff refs/tags/t ggg\n`
      )
    ).toEqual([{ localRef: 'refs/heads/x', localSha: 'aaa', remoteSha: 'bbb' }]);
  });
});

describe('pre-push hook: squash against a moved origin/main', () => {
  it('refuses the MYK9-1133 shape, naming the reverted files', () => {
    const f = fixture();
    f.mainMoves();
    // The trap: reset --soft to the NEW origin/main keeps the old working tree.
    f.git('reset', '--soft', 'origin/main');
    f.git('commit', '-qm', 'squashed');
    const result = f.push(['origin', 'feature']);
    expect(result.code).toBe(1);
    expect(result.output).toContain('merged/a.ts');
    expect(result.output).toContain('merged/b.ts');
    expect(result.output).not.toContain('work/one.ts');
    expect(result.output).toContain('git merge-base');
  });

  it('refuses it after the branch was already pushed (remote sha is the previous tip)', () => {
    const f = fixture();
    expect(f.push(['-u', 'origin', 'feature']).code).toBe(0);
    f.mainMoves();
    f.git('reset', '--soft', 'origin/main');
    f.git('commit', '-qm', 'squashed');
    const result = f.push(['--force', 'origin', 'feature']);
    expect(result.code).toBe(1);
    expect(result.output).toContain('merged/a.ts');
  });

  it('lets a squash against the merge-base through', () => {
    const f = fixture();
    f.mainMoves();
    f.git('reset', '--soft', f.git('merge-base', 'HEAD', 'origin/main').trim());
    f.git('commit', '-qm', 'squashed');
    const result = f.push(['origin', 'feature']);
    expect(result.code, result.output).toBe(0);
  });

  it('lets a rebase onto the new main that keeps the same work through', () => {
    const f = fixture();
    expect(f.push(['-u', 'origin', 'feature']).code).toBe(0);
    f.mainMoves();
    f.git('rebase', '-q', 'origin/main');
    const result = f.push(['--force', 'origin', 'feature']);
    expect(result.code, result.output).toBe(0);
  });

  it('lets a normal fast-forward push through', () => {
    const f = fixture();
    expect(f.push(['-u', 'origin', 'feature']).code).toBe(0);
    f.mainMoves();
    f.commit('work/four.ts', 'wip 4');
    const result = f.push(['origin', 'feature']);
    expect(result.code, result.output).toBe(0);
  });

  it('lets a first push of a new branch with no history through', () => {
    const f = fixture();
    f.mainMoves();
    f.git('checkout', '-qb', 'fresh', 'origin/main');
    f.commit('fresh/new.ts', 'new work');
    const result = f.push(['origin', 'fresh']);
    expect(result.code, result.output).toBe(0);
  });

  it('honors the override and says so', () => {
    const f = fixture();
    f.mainMoves();
    f.git('reset', '--soft', 'origin/main');
    f.git('commit', '-qm', 'squashed');
    const result = f.push(['origin', 'feature'], { MYK9_ALLOW_SQUASH_BASE_REWRITE: '1' });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('MYK9_ALLOW_SQUASH_BASE_REWRITE=1');
    expect(result.output).toContain('merged/a.ts');
  });
});

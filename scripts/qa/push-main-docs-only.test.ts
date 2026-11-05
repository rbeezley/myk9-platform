import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isDocsOnlyPath, parseMainPushes } from './push-main-docs-only';

const HOOKS = resolve(import.meta.dirname, '../../.githooks');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A throwaway repo + bare remote whose `main` already holds one docs commit; the real hook runs. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'myk9-push-main-docs-'));
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
  // push-hold needs a gh; this one reports an empty feed, so no hold exists.
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
  const push = (refspec: string, env: Record<string, string> = {}) => {
    const result = spawnSync('git', ['-C', repo, 'push', 'origin', refspec], {
      encoding: 'utf8',
      env: { ...process.env, GH_BIN: gh, ...env },
    });
    return { code: result.status, output: `${result.stdout}${result.stderr}` };
  };
  const remoteMain = () =>
    spawnSync('git', ['--git-dir', remote, 'rev-parse', '--verify', '-q', 'refs/heads/main'], {
      encoding: 'utf8',
    }).stdout.trim();
  commit('docs/base.md', 'base');
  git('config', 'core.hooksPath', HOOKS);
  expect(push('HEAD:refs/heads/main').code).toBe(0);
  return { git, commit, push, remoteMain };
}

describe('push-main-docs-only scope', () => {
  it('matches the documented docs-only scope', () => {
    for (const ok of [
      'docs/plan-x.md',
      'docs/a b/with space.md',
      'apps/myk9show/docs/notes.md',
      'README.md',
      'TECHNICAL_DEBT.md',
      'packages/replication/README.md',
      'supabase/functions/foo/README.md',
    ]) {
      expect(isDocsOnlyPath(ok), ok).toBe(true);
    }
    for (const bad of [
      'apps/myk9show/src/a.ts',
      'CLAUDE.md',
      'AGENTS.md',
      'docs/agents/shared-rules.md',
      '.claude/settings.json',
      '.codex/x.md',
      '.agents/x.md',
      '.github/workflows/ci.yml',
      'docs/script.sh',
      'supabase/functions/foo/index.ts',
    ]) {
      expect(isDocsOnlyPath(bad), bad).toBe(false);
    }
  });

  it('reads only main updates that are not deletions', () => {
    const zero = '0'.repeat(40);
    expect(
      parseMainPushes(
        `refs/heads/x aaa refs/heads/main bbb\nrefs/heads/f ccc refs/heads/feature ddd\n` +
          `(delete) ${zero} refs/heads/main eee\n`
      )
    ).toEqual([{ localSha: 'aaa', remoteSha: 'bbb' }]);
  });
});

describe('pre-push hook: pushes to main', () => {
  it('lets a docs-only commit through', () => {
    const f = fixture();
    const sha = f.commit('docs/plan-ok.md', 'docs only');
    const result = f.push('HEAD:refs/heads/main');
    expect(result.code, result.output).toBe(0);
    expect(f.remoteMain()).toBe(sha);
  });

  it('refuses a commit touching apps/**, naming the commit and file', () => {
    const f = fixture();
    const before = f.remoteMain();
    const sha = f.commit('apps/myk9show/src/feature.ts', 'feature');
    const result = f.push('HEAD:refs/heads/main');
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(sha.slice(0, 12));
    expect(result.output).toContain('apps/myk9show/src/feature.ts');
    expect(f.remoteMain()).toBe(before);
  });

  it('refuses a mixed range even when the newest commit is docs', () => {
    const f = fixture();
    const before = f.remoteMain();
    const feature = f.commit('apps/myk9show/src/feature.ts', 'feature');
    f.commit('docs/plan-late.md', 'docs on top');
    const result = f.push('HEAD:refs/heads/main');
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(feature.slice(0, 12));
    expect(result.output).not.toContain('docs/plan-late.md');
    expect(f.remoteMain()).toBe(before);
  });

  it('lets a docs commit through after origin/main (with app commits) was merged into it', () => {
    const f = fixture();
    // Someone else's reviewed app change lands on remote main (a PR merge, simulated).
    f.git('checkout', '-qb', 'other');
    f.commit('apps/myk9show/src/merged-elsewhere.ts', 'merged via PR');
    expect(f.push('other:refs/heads/main', { MYK9_ALLOW_NON_DOCS_MAIN_PUSH: '1' }).code).toBe(0);
    // Locally: a docs commit on the old main, then `git merge origin/main`.
    f.git('checkout', '-q', 'main');
    const docs = f.commit('docs/plan-after-merge.md', 'docs');
    f.git('fetch', '-q', 'origin');
    f.git('merge', '-q', '--no-edit', 'origin/main');
    const result = f.push('HEAD:refs/heads/main');
    expect(result.code, result.output).toBe(0);
    expect(result.output).not.toContain('merged-elsewhere.ts');
    expect(f.git('merge-base', '--is-ancestor', docs, f.remoteMain()).trim()).toBe('');
  });

  it('still refuses a local feature branch merged into main', () => {
    const f = fixture();
    const before = f.remoteMain();
    f.git('checkout', '-qb', 'feature');
    const feature = f.commit('apps/myk9show/src/feature.ts', 'feature');
    f.git('checkout', '-q', 'main');
    f.commit('docs/plan-x.md', 'docs');
    f.git('merge', '-q', '--no-ff', '--no-edit', 'feature');
    const result = f.push('HEAD:refs/heads/main');
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(feature.slice(0, 12));
    expect(result.output).toContain('apps/myk9show/src/feature.ts');
    expect(f.remoteMain()).toBe(before);
  });

  it('leaves a push of non-docs commits to a feature branch alone', () => {
    const f = fixture();
    f.commit('apps/myk9show/src/feature.ts', 'feature');
    const result = f.push('HEAD:refs/heads/feature');
    expect(result.code, result.output).toBe(0);
  });

  it('honors the override and says it was used', () => {
    const f = fixture();
    const sha = f.commit('apps/myk9show/src/feature.ts', 'feature');
    const result = f.push('HEAD:refs/heads/main', { MYK9_ALLOW_NON_DOCS_MAIN_PUSH: '1' });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('MYK9_ALLOW_NON_DOCS_MAIN_PUSH=1');
    expect(result.output).toContain('apps/myk9show/src/feature.ts');
    expect(f.remoteMain()).toBe(sha);
  });
});

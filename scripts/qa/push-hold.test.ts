import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePushDirective, parsePushRefs } from './push-hold';

const HOOKS = resolve(import.meta.dirname, '../../.githooks');
const SCRIPT = resolve(import.meta.dirname, 'push-hold.ts');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function comment(
  id: number,
  body: string,
  association = 'OWNER',
  createdAt = '2026-09-13T00:00:10Z',
  issueNumber = 7
) {
  return {
    id,
    body,
    author_association: association,
    created_at: createdAt,
    updated_at: createdAt,
    issue_url: `https://api.github.com/repos/owner/repo/issues/${issueNumber}`,
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'myk9-push-hold-'));
  roots.push(root);
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  const calls = join(root, 'gh-calls');
  mkdirSync(repo);
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['init', '-q', '--initial-branch=feature', repo]);
  execFileSync('git', ['-C', repo, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', repo, 'config', 'user.email', 'test@example.com']);
  writeFileSync(join(repo, 'readme'), 'test\n');
  execFileSync('git', ['-C', repo, 'add', 'readme']);
  execFileSync('git', ['-C', repo, 'commit', '-qm', 'test']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', remote]);
  execFileSync('git', ['-C', repo, 'config', 'core.hooksPath', HOOKS]);
  const gh = join(root, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GH_CALLS"
case "$*" in
  'api repos/{owner}/{repo} --jq .full_name') echo 'owner/repo' ;;
  'api repos/owner/repo/issues/comments?sort=created&direction=desc&per_page=100&page='*)
    page="$(printf '%s' "$*" | sed 's/.*page=//')"
    if [ -f "$GH_FIXTURE_DIR/page-$page.json" ]; then cat "$GH_FIXTURE_DIR/page-$page.json"; else echo '[]'; fi ;;
  'api repos/owner/repo/issues/'*)
    number="$(printf '%s' "$*" | sed 's#.*/##')"
    cat "$GH_FIXTURE_DIR/issue-$number.json" ;;
  *) echo 'unexpected gh call' >&2; exit 9 ;;
esac
`
  );
  chmodSync(gh, 0o755);
  const setIssue = (number: number, isPr: boolean) =>
    writeFileSync(
      join(root, `issue-${number}.json`),
      JSON.stringify({ state: 'closed', ...(isPr ? { pull_request: { url: 'pr' } } : {}) })
    );
  setIssue(7, true);
  setIssue(8, true);
  setIssue(9, false);
  const setComments = (comments: ReturnType<typeof comment>[]) =>
    writeFileSync(join(root, 'page-1.json'), JSON.stringify(comments));
  setComments([]);
  const setPage = (page: number, comments: ReturnType<typeof comment>[]) =>
    writeFileSync(join(root, `page-${page}.json`), JSON.stringify(comments));
  const runPush = (dryRun = true) => {
    const result = spawnSync(
      'git',
      ['-C', repo, 'push', ...(dryRun ? ['--dry-run'] : []), 'origin', 'HEAD:refs/heads/feature'],
      {
        encoding: 'utf8',
        env: { ...process.env, GH_BIN: gh, GH_CALLS: calls, GH_FIXTURE_DIR: root },
      }
    );
    return { code: result.status, output: `${result.stdout}${result.stderr}` };
  };
  return { root, remote, calls, setComments, setPage, setIssue, runPush };
}

describe('operator push hold', () => {
  it('only recognizes trusted, first-line directives', () => {
    const staleHold = comment(1, 'PUSH HOLD: old hold');
    staleHold.updated_at = '2026-09-15T00:00:00Z';
    expect(parsePushDirective(staleHold, 7)?.createdAt).toBe(staleHold.created_at);
    expect(parsePushDirective(comment(2, 'PUSH RELEASE', 'MEMBER'), 7)?.kind).toBe('release');
    expect(parsePushDirective(comment(3, 'PUSH HOLD: outsider', 'NONE'), 7)).toBeUndefined();
    expect(parsePushDirective(comment(4, '> PUSH HOLD: quoted'), 7)).toBeUndefined();
  });

  it('parses every ref, including first-push and deletion ref lines', () => {
    expect(
      parsePushRefs(
        'refs/heads/one abc refs/heads/one 0000000000000000000000000000000000000000\n' +
          'refs/heads/two 0000000000000000000000000000000000000000 refs/heads/two abc\n'
      )
    ).toEqual(['refs/heads/one', 'refs/heads/two']);
  });

  it('blocks an actual first-push dry run when the historical hold PR is closed', () => {
    const f = fixture();
    f.setComments([comment(1, 'Hold all pushes until further notice — Richard is running G9.')]);
    const result = f.runPush();
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('PUSH BLOCKED: Richard is running G9.');
    expect(result.output).toContain('refs/heads/feature');
    expect(readFileSync(f.calls, 'utf8')).not.toMatch(/pr comment|Review gate:/);
  });

  it('one trusted release on another closed PR allows a real push without resurrecting the old hold', () => {
    const f = fixture();
    f.setComments([comment(1, 'PUSH HOLD: G9 load rehearsal')]);
    expect(f.runPush().code).not.toBe(0);
    f.setComments([
      comment(2, 'PUSH RELEASE', 'MEMBER', undefined, 8),
      comment(1, 'PUSH HOLD: G9 load rehearsal'),
    ]);
    const result = f.runPush(false);
    expect(result.code).toBe(0);
    const remoteHead = execFileSync(
      'git',
      ['--git-dir', f.remote, 'rev-parse', 'refs/heads/feature'],
      {
        encoding: 'utf8',
      }
    ).trim();
    expect(remoteHead).toMatch(/^[0-9a-f]{40}$/);
    expect(readFileSync(f.calls, 'utf8')).not.toMatch(/pr comment|Review gate:/);
  });

  it('orders same-second directives by ID even when GitHub returns them backwards', () => {
    const f = fixture();
    const second = '2026-09-13T00:00:10Z';
    f.setComments([
      comment(10, 'PUSH RELEASE', 'MEMBER', second, 8),
      comment(11, 'PUSH HOLD: later hold', 'OWNER', second, 7),
      comment(9, 'ordinary earlier comment', 'OWNER', '2026-09-13T00:00:09Z'),
    ]);
    const blocked = f.runPush();
    expect(blocked.code).not.toBe(0);
    expect(blocked.output).toContain('later hold');

    f.setComments([
      comment(10, 'PUSH HOLD: earlier hold', 'OWNER', second, 7),
      comment(11, 'PUSH RELEASE', 'MEMBER', second, 8),
      comment(9, 'ordinary earlier comment', 'OWNER', '2026-09-13T00:00:09Z'),
    ]);
    expect(f.runPush().code).toBe(0);
  });

  it('reads the next page when same-second directives straddle a page boundary', () => {
    const f = fixture();
    const second = '2026-09-13T00:00:10Z';
    f.setPage(1, [
      ...Array.from({ length: 99 }, (_, id) =>
        comment(100 + id, 'ordinary comment', 'OWNER', second)
      ),
      comment(10, 'PUSH RELEASE', 'MEMBER', second, 8),
    ]);
    f.setPage(2, [
      comment(11, 'PUSH HOLD: boundary hold', 'OWNER', second, 7),
      comment(9, 'ordinary earlier comment', 'OWNER', '2026-09-13T00:00:09Z'),
    ]);
    const result = f.runPush();
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('boundary hold');
    expect(readFileSync(f.calls, 'utf8')).toContain('page=2');
  });

  it('fails closed when GitHub hold state is unavailable', () => {
    const f = fixture();
    writeFileSync(join(f.root, 'page-1.json'), 'not JSON');
    const result = f.runPush();
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('could not verify operator hold state');
  });

  it('does not treat quoted or untrusted hold text as an instruction', () => {
    const f = fixture();
    f.setComments([
      comment(1, 'PUSH HOLD: outsider', 'NONE'),
      comment(2, '> PUSH HOLD: quoted example'),
    ]);
    expect(f.runPush().code).toBe(0);
  });

  it('ignores a newer directive on a regular issue and keeps scanning for the latest PR directive', () => {
    const f = fixture();
    f.setComments([
      comment(3, 'PUSH HOLD: issue-only', 'OWNER', undefined, 9),
      comment(2, 'PUSH RELEASE', 'MEMBER', undefined, 8),
      comment(1, 'PUSH HOLD: old PR hold'),
    ]);
    expect(f.runPush().code).toBe(0);
  });

  it('continues onto older pages and fails closed if the bounded scan cannot find a directive', () => {
    const f = fixture();
    const noise = Array.from({ length: 100 }, (_, id) => comment(100 + id, 'ordinary comment'));
    f.setPage(1, noise);
    f.setPage(2, [comment(1, 'PUSH HOLD: older closed PR')]);
    const found = f.runPush();
    expect(found.code).not.toBe(0);
    expect(found.output).toContain('older closed PR');
    expect(readFileSync(f.calls, 'utf8')).toContain('page=2');
    for (let page = 1; page <= 20; page++) f.setPage(page, noise);
    const exhausted = f.runPush();
    expect(exhausted.code).not.toBe(0);
    expect(exhausted.output).toContain('scanned 2000 newest comments');
  });

  it('blocks all refs in one hook invocation', () => {
    const f = fixture();
    f.setComments([comment(1, 'PUSH HOLD: rehearsal')]);
    const result = spawnSync(
      'node',
      ['--experimental-strip-types', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', SCRIPT],
      {
        input: 'refs/heads/a abc refs/heads/a 000\nrefs/heads/b def refs/heads/b 000\n',
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_BIN: join(f.root, 'gh'),
          GH_CALLS: f.calls,
          GH_FIXTURE_DIR: f.root,
        },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refs/heads/a, refs/heads/b');
  });
});

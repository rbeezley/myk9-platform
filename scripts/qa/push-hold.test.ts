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
  'api repos/owner/repo/issues/comments?sort=updated&direction=desc&since='*'&per_page=100&page='*)
    page="$(printf '%s' "$*" | sed 's/.*page=//')"
    since="$(printf '%s' "$*" | sed -E 's/.*since=([^&]*)&.*/\\1/' | sed 's/%3A/:/g')"
    if [ -f "$GH_FIXTURE_DIR/page-$page.json" ]; then
      if [ -f "$GH_FIXTURE_DIR/filter-since" ]; then
        node -e 'const s=Date.parse(process.argv[2]);const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify(c.filter(x=>Date.parse(x.updated_at)>=s)))' "$GH_FIXTURE_DIR/page-$page.json" "$since"
      else cat "$GH_FIXTURE_DIR/page-$page.json"; fi
    else echo '[]'; fi ;;
  'api search/issues?q='*)
    if [ -f "$GH_FIXTURE_DIR/search-fail" ]; then echo 'search down' >&2; exit 1; fi
    page="$(printf '%s' "$*" | sed 's/.*page=//')"
    if [ "$page" = 1 ] && [ -f "$GH_FIXTURE_DIR/search.json" ]; then cat "$GH_FIXTURE_DIR/search.json"
    else echo '{"total_count":0,"incomplete_results":false,"items":[]}'; fi ;;
  'api repos/owner/repo/issues/'*/comments*)
    number="$(printf '%s' "$*" | sed -E 's#.*issues/([0-9]+)/comments.*#\\1#')"
    page="$(printf '%s' "$*" | sed 's/.*page=//')"
    if [ -f "$GH_FIXTURE_DIR/issuec-$number-$page.json" ]; then cat "$GH_FIXTURE_DIR/issuec-$number-$page.json"; else echo '[]'; fi ;;
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
  // Directives older than the recent feed are found through search + the PR's own comments.
  const setSearch = (prs: number[], incomplete = false) =>
    writeFileSync(
      join(root, 'search.json'),
      JSON.stringify({
        total_count: prs.length,
        incomplete_results: incomplete,
        items: prs.map(number => ({ number, pull_request: { url: 'pr' } })),
      })
    );
  const setPrComments = (number: number, comments: ReturnType<typeof comment>[]) =>
    writeFileSync(join(root, `issuec-${number}-1.json`), JSON.stringify(comments));
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
  return { root, remote, calls, setComments, setPage, setIssue, setSearch, setPrComments, runPush };
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

  it('continues onto older recent-feed pages for a directive still inside the window', () => {
    const f = fixture();
    const now = new Date().toISOString();
    f.setPage(
      1,
      Array.from({ length: 100 }, (_, id) => comment(100 + id, 'ordinary comment', 'OWNER', now))
    );
    f.setPage(2, [comment(1, 'PUSH HOLD: older closed PR', 'OWNER', now)]);
    const found = f.runPush();
    expect(found.code).toBe(1);
    expect(found.output).toContain('older closed PR');
    expect(readFileSync(f.calls, 'utf8')).toContain('page=2');
  });

  it('a hold on page 6 inside the lag window is blocked even when search has not indexed it', () => {
    const f = fixture();
    const now = new Date().toISOString();
    const noise = Array.from({ length: 100 }, (_, id) =>
      comment(100 + id, 'Review gate: ok', 'OWNER', now)
    );
    for (let page = 1; page <= 5; page++) f.setPage(page, noise);
    f.setPage(6, [comment(1, 'PUSH HOLD: unindexed fresh hold', 'OWNER', now)]);
    const result = f.runPush();
    expect(result.code).toBe(1);
    expect(result.output).toContain('unindexed fresh hold');
  });

  describe('edited comments (updated_at window)', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const editedHold = () => ({
      ...comment(1, 'PUSH HOLD: edited into a hold', 'OWNER', hoursAgo(3)),
      updated_at: new Date().toISOString(),
    });

    it('blocks on an old comment recently edited into a hold even though search is stale', () => {
      const f = fixture();
      writeFileSync(join(f.root, 'filter-since'), '');
      f.setSearch([8]);
      f.setPrComments(8, [comment(2, 'PUSH RELEASE', 'MEMBER', hoursAgo(5), 8)]);
      f.setPage(1, [
        ...Array.from({ length: 99 }, (_, id) => ({
          ...comment(100 + id, 'Review gate: ok', 'OWNER', hoursAgo(2)),
          updated_at: hoursAgo(0.1),
        })),
        editedHold(),
      ]);
      f.setPage(2, []);
      const result = f.runPush();
      expect(result.code).toBe(1);
      expect(result.output).toContain('edited into a hold');
    });

    it('queries the feed by updated time with a since bound', () => {
      const f = fixture();
      f.runPush();
      expect(readFileSync(f.calls, 'utf8')).toMatch(/sort=updated&direction=desc&since=\d{4}-/);
    });

    it('a comment last updated before the window is left to search, and noise there cannot block', () => {
      const f = fixture();
      writeFileSync(join(f.root, 'filter-since'), '');
      const stale = Array.from({ length: 100 }, (_, id) =>
        comment(100 + id, 'Review gate: ok', 'OWNER', hoursAgo(3))
      );
      for (let page = 1; page <= 20; page++) f.setPage(page, stale);
      expect(f.runPush().code).toBe(0);
    });
  });

  it('fails closed when the lag window is not covered within the page cap', () => {
    const f = fixture();
    const now = new Date().toISOString();
    const noise = Array.from({ length: 100 }, (_, id) =>
      comment(100 + id, 'Review gate: ok', 'OWNER', now)
    );
    for (let page = 1; page <= 20; page++) f.setPage(page, noise);
    const result = f.runPush();
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('could not verify operator hold state');
    expect(result.output).toContain('cannot be ruled out');
  });

  it('a recent noisy feed that reaches past the window with no directive allows the push', () => {
    const f = fixture();
    const now = new Date().toISOString();
    const fresh = Array.from({ length: 100 }, (_, id) =>
      comment(100 + id, 'Review gate: ok', 'OWNER', now)
    );
    for (let page = 1; page <= 3; page++) f.setPage(page, fresh);
    f.setPage(
      4,
      Array.from({ length: 100 }, (_, id) => comment(500 + id, 'Review gate: ok'))
    );
    expect(f.runPush().code).toBe(0);
  });

  describe('directive older than the recent comment window (MYK9-1015)', () => {
    const noisyFeed = (f: ReturnType<typeof fixture>) => {
      // Real GitHub drops comments last updated before `since`; so does the mock.
      writeFileSync(join(f.root, 'filter-since'), '');
      const noise = Array.from({ length: 100 }, (_, id) => comment(100 + id, 'Review gate: ok'));
      for (let page = 1; page <= 20; page++) f.setPage(page, noise);
    };

    it('still blocks on an old trusted hold', () => {
      const f = fixture();
      noisyFeed(f);
      f.setSearch([7]);
      f.setPrComments(7, [comment(1, 'PUSH HOLD: ancient hold')]);
      const result = f.runPush();
      expect(result.code).toBe(1);
      expect(result.output).toContain('ancient hold');
    });

    it('hold then release (both old) allows the push', () => {
      const f = fixture();
      noisyFeed(f);
      f.setSearch([7, 8]);
      f.setPrComments(7, [comment(1, 'PUSH HOLD: ancient hold', 'OWNER', '2026-09-01T00:00:00Z')]);
      f.setPrComments(8, [comment(2, 'PUSH RELEASE', 'MEMBER', '2026-09-02T00:00:00Z', 8)]);
      expect(f.runPush().code).toBe(0);
    });

    it('release then hold (both old) blocks, whichever PR search lists first', () => {
      const f = fixture();
      noisyFeed(f);
      f.setSearch([8, 7]);
      f.setPrComments(8, [comment(2, 'PUSH RELEASE', 'MEMBER', '2026-09-01T00:00:00Z', 8)]);
      f.setPrComments(7, [comment(1, 'PUSH HOLD: second hold', 'OWNER', '2026-09-02T00:00:00Z')]);
      const result = f.runPush();
      expect(result.code).toBe(1);
      expect(result.output).toContain('second hold');
    });

    it('ignores an old untrusted or quoted directive', () => {
      const f = fixture();
      noisyFeed(f);
      f.setSearch([7]);
      f.setPrComments(7, [
        comment(1, 'PUSH HOLD: outsider', 'NONE'),
        comment(2, '> PUSH HOLD: quoted'),
      ]);
      expect(f.runPush().code).toBe(0);
    });

    it('a hold in the recent feed beats an older indexed release (search lag)', () => {
      const f = fixture();
      f.setSearch([8]);
      f.setPrComments(8, [comment(2, 'PUSH RELEASE', 'MEMBER', '2026-09-01T00:00:00Z', 8)]);
      f.setComments([
        comment(3, 'PUSH HOLD: fresh, not yet indexed', 'OWNER', '2026-09-03T00:00:00Z'),
      ]);
      const result = f.runPush();
      expect(result.code).toBe(1);
      expect(result.output).toContain('fresh, not yet indexed');
    });

    it('fails closed when search errors or reports incomplete results', () => {
      const f = fixture();
      writeFileSync(join(f.root, 'search-fail'), '');
      const down = f.runPush();
      expect(down.code).not.toBe(0);
      expect(down.output).toContain('could not verify operator hold state');
      rmSync(join(f.root, 'search-fail'));
      f.setSearch([7], true);
      const partial = f.runPush();
      expect(partial.code).not.toBe(0);
      expect(partial.output).toContain('incomplete');
    });

    it('fails closed when a candidate PR comment listing cannot be read', () => {
      const f = fixture();
      f.setSearch([7]);
      writeFileSync(join(f.root, 'issuec-7-1.json'), 'not JSON');
      expect(f.runPush().code).not.toBe(0);
    });

    it('no directive anywhere means no hold, even with a full noisy feed', () => {
      const f = fixture();
      noisyFeed(f);
      expect(f.runPush().code).toBe(0);
    });
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

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * The db-push skill's migration-collision sweep is a shell snippet an agent
 * pastes, so it is tested by running the snippet itself, extracted from the
 * skill, against a fake `gh`. The fake behaves like the Claude Code cloud
 * proxy (MYK9-1425): `--paginate` gets a 403, because GitHub's next links use
 * `repositories/{id}/…` paths, and every non-`api` command is GraphQL and
 * gets one too. Lists are served 100 rows per `&page=N`, through real `jq`.
 */
const skill = readFileSync(
  resolve(import.meta.dirname, '../../.claude/skills/db-push/SKILL.md'),
  'utf8'
);

/** From `set -o pipefail` to the sweep's `sort -u`: the part an agent runs to sweep. */
function sweepSnippet(): string {
  const start = skill.indexOf('set -o pipefail\n');
  const end = skill.indexOf('| sort -u\n', start);
  expect(start, 'sweep start not found in SKILL.md').toBeGreaterThan(-1);
  expect(end, 'sweep end not found in SKILL.md').toBeGreaterThan(start);
  const snippet = skill.slice(start, end + '| sort -u'.length);
  expect(snippet, 'extracted text is not the sweep').toContain("grep '^supabase/migrations/'");
  return snippet;
}

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

type Fixture = {
  /** Open PR numbers, in list order. */
  open: number[];
  /** Each PR's files, as REST rows. */
  files?: Record<number, { filename: string; previous_filename?: string }[]>;
  /** PRs whose files read fails. */
  failing?: number[];
};

function fakeGh(fixture: Fixture) {
  const dir = mkdtempSync(join(tmpdir(), 'db-push-sweep-'));
  scratch.push(dir);
  writeFileSync(
    join(dir, 'repos_o_r_pulls.json'),
    JSON.stringify(fixture.open.map(number => ({ number })))
  );
  for (const [pr, rows] of Object.entries(fixture.files ?? {})) {
    writeFileSync(join(dir, `repos_o_r_pulls_${pr}_files.json`), JSON.stringify(rows));
  }
  for (const pr of fixture.failing ?? []) writeFileSync(join(dir, `fail-${pr}`), '');
  writeFileSync(
    join(dir, 'gh'),
    [
      '#!/bin/bash',
      `dir=${JSON.stringify(dir)}`,
      'printf \'%s\\n\' "$*" >> "$dir/calls.log"',
      'case " $* " in *" --paginate "*)',
      '  echo "gh: Numeric-ID repository paths (repositories/{id}/...) are not supported (HTTP 403)" >&2',
      '  exit 1 ;;',
      'esac',
      '[ "${1:-}" = api ] || { echo "HTTP 403: GitHub GraphQL is not available" >&2; exit 1; }',
      'path=$2 expr=. prev=',
      'for arg in "$@"; do [ "$prev" = --jq ] && expr=$arg; prev=$arg; done',
      'if [ "$path" = "repos/{owner}/{repo}" ]; then',
      '  echo \'{"full_name":"o/r"}\' | jq -r "$expr"',
      '  exit',
      'fi',
      'base=${path%%\\?*}',
      'pr=$(printf %s "$base" | sed -nE \'s#.*/pulls/([0-9]+)/files$#\\1#p\')',
      '[ -n "$pr" ] && [ -f "$dir/fail-$pr" ] && { echo "gh: HTTP 502" >&2; exit 1; }',
      'page=$(printf %s "$path" | sed -nE \'s#.*[?&]page=([0-9]+).*#\\1#p\')',
      'file="$dir/$(printf %s "$base" | tr / _).json"',
      '[ -f "$file" ] || echo "[]" > "$file"',
      'jq -c --argjson p "${page:-1}" \'.[(($p - 1) * 100):($p * 100)]\' "$file" | jq -r "$expr"',
    ].join('\n')
  );
  chmodSync(join(dir, 'gh'), 0o755);
  return dir;
}

function runSweep(dir: string, shell = 'bash') {
  const result = spawnSync(shell, ['-c', sweepSnippet()], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` },
    timeout: 60_000,
  });
  const log = join(dir, 'calls.log');
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...result, calls };
}

const migration = (name: string) => ({ filename: `supabase/migrations/${name}.sql` });

/** 150 open PRs: page 2 of the list is where a `--paginate` cut would bite. */
const busyRepo: Fixture = {
  open: Array.from({ length: 150 }, (_, i) => i + 1),
  files: {
    7: [migration('20990101000000_early'), { filename: 'apps/x.ts' }],
    120: [
      {
        filename: 'supabase/migrations/20990101000002_renamed.sql',
        previous_filename: 'supabase/migrations/20990101000001_before.sql',
      },
    ],
  },
};

describe('db-push skill: migration-collision sweep', () => {
  it.each(['bash', ...(spawnSync('zsh', ['-c', 'true']).status === 0 ? ['zsh'] : [])])(
    'finds migrations past page 1 of the open-PR list, both sides of a rename, with no --paginate or GraphQL (%s)',
    shell => {
      const dir = fakeGh(busyRepo);
      const result = runSweep(dir, shell);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim().split('\n')).toEqual([
        'supabase/migrations/20990101000000_early.sql',
        'supabase/migrations/20990101000001_before.sql',
        'supabase/migrations/20990101000002_renamed.sql',
      ]);
      expect(
        result.calls.every(call => call.startsWith('api ') && !call.includes('--paginate'))
      ).toBe(true);
      expect(result.calls.filter(call => call.includes('pulls?state=open&'))).toHaveLength(2);
    }
  );

  it('reports nothing, cleanly, when no open PR touches a migration', () => {
    const result = runSweep(fakeGh({ open: [1, 2], files: { 1: [{ filename: 'docs/a.md' }] } }));

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
  });

  // An unreadable PR must never read as "no collision" (the skill's pipefail contract).
  it('fails the whole sweep when one PR files read fails', () => {
    const result = runSweep(fakeGh({ ...busyRepo, failing: [120] }));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('HTTP 502');
  });

  it('fails rather than truncating a list still full at the page cap', () => {
    const result = runSweep(
      fakeGh({
        open: [1],
        files: { 1: Array.from({ length: 5100 }, (_, i) => migration(`209901010${i}`)) },
      })
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('still full after 50 pages');
    expect(result.calls.filter(call => call.includes('/pulls/1/files'))).toHaveLength(50);
  });
});

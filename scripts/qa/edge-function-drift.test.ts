import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classify,
  collectSources,
  parseDeployed,
  parseIgnoreRevs,
  pickSourceCommit,
  prettierNormalizer,
  resolveByContent,
  runCli,
  type DeployedFunction,
  type Downloader,
  type DriftRow,
  type SourceFunction,
} from './edge-function-drift.ts';

/**
 * MYK9-597: the cleanup skill dated every function with `git log -1 -- <dir>`,
 * which in a shallow clone returns the graft boundary's date for anything
 * untouched since, and flagged 20 of 45 functions as stale — all false. These
 * tests build REAL shallow clones (a guard tested only against invented git
 * output has never met its subject) in a directory whose name holds a space,
 * because this repo lives under "AI Projects" (LESSONS guard-word-split).
 */

vi.setConfig({ testTimeout: 30_000 });

const ms = (iso: string) => Date.parse(iso);
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('parseIgnoreRevs', () => {
  it('keeps full SHAs and drops comments, blanks and abbreviations', () => {
    const got = parseIgnoreRevs(
      `# header\n\n${SHA_A}\n  ${SHA_B.toUpperCase()}  # trailing\nd6e775f9d\n`
    );
    expect([...got].sort()).toEqual([SHA_A, SHA_B]);
  });
});

describe('pickSourceCommit', () => {
  it('returns the newest commit that is not ignored', () => {
    const log = `${SHA_A}\t2026-05-01T00:00:00Z\n${SHA_B}\t2026-03-01T00:00:00Z\n`;
    expect(pickSourceCommit(log, new Set())).toEqual({
      sha: SHA_A,
      dateMs: ms('2026-05-01T00:00:00Z'),
    });
    expect(pickSourceCommit(log, new Set([SHA_A]))).toEqual({
      sha: SHA_B,
      dateMs: ms('2026-03-01T00:00:00Z'),
    });
    expect(pickSourceCommit(log, new Set([SHA_A, SHA_B]))).toBeUndefined();
  });
});

describe('parseDeployed', () => {
  it('reads slug and epoch-ms updated_at from `functions list -o json`', () => {
    expect(parseDeployed('[{"slug":"x","name":"x","updated_at":1788718795753}]')).toEqual([
      { slug: 'x', updatedAtMs: 1788718795753 },
    ]);
  });
  it('refuses a row without the fields it compares', () => {
    expect(() => parseDeployed('[{"slug":"x","updated_at":"2026-01-01"}]')).toThrow(/row 0/);
    expect(() => parseDeployed('{}')).toThrow(/array/);
  });
});

describe('classify', () => {
  const src = (
    name: string,
    date: string | undefined,
    atShallowFloor = false,
    dir = 'supabase/functions'
  ): SourceFunction => ({
    name,
    dir,
    atShallowFloor,
    commit: date ? { sha: SHA_A, dateMs: ms(date) } : undefined,
  });
  const dep = (slug: string, date: string): DeployedFunction => ({ slug, updatedAtMs: ms(date) });

  it.each([
    ['deploy after source', src('f', '2026-03-01T00:00:00Z'), 'current'],
    ['source newer by an hour', src('f', '2026-04-01T01:00:00Z'), 'sub-day'],
    ['source newer by days', src('f', '2026-04-10T00:00:00Z'), 'stale'],
    // The real edit is at or before the floor, the deploy after it: provably current.
    ['floor older than deploy', src('f', '2026-03-01T00:00:00Z', true), 'current'],
    // The incident: the floor is newer than the deploy, so history cannot decide.
    ['floor newer than deploy', src('f', '2026-05-01T00:00:00Z', true), 'unknown'],
    ['no dating commit at all', src('f', undefined), 'unknown'],
  ])('%s', (_label, source, want) => {
    const [row] = classify([source], [dep('f', '2026-04-01T00:00:00Z')]);
    expect(row!.status).toBe(want);
  });

  it('never calls a floor-dated function stale, however large the gap', () => {
    const [row] = classify(
      [src('f', '2026-09-03T17:17:15Z', true)],
      [dep('f', '2026-07-13T15:12:16Z')]
    );
    expect(row!.status).toBe('unknown');
    expect(row!.note).toMatch(/shallow history floor/);
  });

  it('reports never-deployed and dual-location functions', () => {
    const rows = classify(
      [
        src('lonely', '2026-03-01T00:00:00Z'),
        src('twin', '2026-03-01T00:00:00Z'),
        src('twin', '2026-03-01T00:00:00Z', false, 'apps/myk9show/supabase/functions'),
      ],
      [dep('twin', '2026-04-01T00:00:00Z')]
    );
    expect(rows.map(r => [r.name, r.status])).toEqual([
      ['lonely', 'never-deployed'],
      ['twin', 'dual-location'],
    ]);
  });
});

describe('against real git history', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function git(cwd: string, args: readonly string[], date?: string): string {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env,
    });
  }

  function write(root: string, rel: string, text: string) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }

  /**
   * c0 2025-12-01 scaffolding
   * c1 2026-01-01 add alpha, beta, gamma
   * c2 2026-03-01 edit beta
   * c3 2026-05-01 reformat beta (listed in .git-blame-ignore-revs)
   * c4 2026-06-01 edit gamma
   * A --depth 4 clone makes c1 the graft boundary.
   */
  function build(): { origin: string; shallow: string; full: string; formatSha: string } {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'edge drift ')));
    dirs.push(base);
    const origin = join(base, 'origin repo');
    mkdirSync(origin);
    git(origin, ['init', '-q', '--initial-branch=main']);
    git(origin, ['config', 'user.email', 't@test.local']);
    git(origin, ['config', 'user.name', 'T']);
    git(origin, ['config', 'commit.gpgsign', 'false']);
    const commit = (msg: string, date: string) => {
      git(origin, ['add', '-A']);
      git(origin, ['commit', '-q', '-m', msg], date);
      return git(origin, ['rev-parse', 'HEAD']).trim();
    };
    write(origin, 'README.md', 'x\n');
    commit('c0', '2025-12-01T00:00:00Z');
    for (const f of ['alpha', 'beta', 'gamma']) {
      write(origin, `supabase/functions/${f}/index.ts`, `export const v = 1;\n`);
    }
    write(origin, 'supabase/functions/_shared/util.ts', 'export {};\n');
    commit('c1', '2026-01-01T00:00:00Z');
    write(origin, 'supabase/functions/beta/index.ts', 'export const v = 2;\n');
    commit('c2', '2026-03-01T00:00:00Z');
    write(origin, 'supabase/functions/beta/index.ts', 'export const v  =  2;\n');
    const formatSha = commit('c3 format', '2026-05-01T00:00:00Z');
    write(origin, 'supabase/functions/gamma/index.ts', 'export const v = 3;\n');
    commit('c4', '2026-06-01T00:00:00Z');

    const shallow = join(base, 'shallow clone');
    git(base, ['clone', '-q', '--depth', '4', pathToFileURL(origin).href, 'shallow clone']);
    const full = join(base, 'full clone');
    git(base, ['clone', '-q', origin, 'full clone']);
    return { origin, shallow, full, formatSha };
  }

  const deployed = (entries: Record<string, string>) =>
    JSON.stringify(Object.entries(entries).map(([slug, d]) => ({ slug, updated_at: ms(d) })));

  it('a shallow clone dates untouched functions at the boundary and marks them', () => {
    const { shallow } = build();
    expect(git(shallow, ['rev-parse', '--is-shallow-repository']).trim()).toBe('true');
    const byName = Object.fromEntries(collectSources(shallow).map(s => [s.name, s]));
    expect(Object.keys(byName).sort()).toEqual(['alpha', 'beta', 'gamma']); // _shared skipped
    expect(byName.alpha!.atShallowFloor).toBe(true);
    expect(byName.alpha!.commit!.dateMs).toBe(ms('2026-01-01T00:00:00Z'));
    expect(byName.gamma!.atShallowFloor).toBe(false);
  });

  it('the incident, reproduced: floor-dated functions are unknown, never stale', async () => {
    const { shallow, full } = build();
    const list = deployed({
      alpha: '2025-12-15T00:00:00Z', // older than the floor: undecidable in the shallow clone
      beta: '2026-04-01T00:00:00Z',
      gamma: '2026-07-01T00:00:00Z',
    });
    const status = (root: string) =>
      Object.fromEntries(
        classify(collectSources(root), parseDeployed(list)).map(r => [r.name, r.status])
      );
    // The complete clone knows alpha's real edit (2026-01-01) postdates its deploy.
    expect(status(full).alpha).toBe('stale');
    expect(status(shallow).alpha).toBe('unknown');
  });

  it('skips a formatting commit listed in .git-blame-ignore-revs', () => {
    const { full, formatSha } = build();
    const list = parseDeployed(
      deployed({
        alpha: '2026-07-01T00:00:00Z',
        beta: '2026-04-01T00:00:00Z',
        gamma: '2026-07-01T00:00:00Z',
      })
    );
    const beta = () => classify(collectSources(full), list).find(r => r.name === 'beta')!;
    expect(beta().status).toBe('stale'); // dated by the reformat, 2026-05-01
    writeFileSync(join(full, '.git-blame-ignore-revs'), `# formatting\n${formatSha}\n`);
    expect(beta().status).toBe('current'); // dated by the real edit, 2026-03-01
  });

  it('runCli exits 1 on an unknown row and 0 once everything is current', async () => {
    const { shallow } = build();
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void logs.push(a.join(' ')));
    const file = join(shallow, 'deployed.json');
    writeFileSync(
      file,
      deployed({
        alpha: '2025-12-15T00:00:00Z',
        beta: '2026-07-01T00:00:00Z',
        gamma: '2026-07-01T00:00:00Z',
      })
    );
    expect(await runCli(shallow, ['--deployed', file])).toBe(1);
    expect(logs.join('\n')).toMatch(/^unknown\s+alpha/m);
    expect(logs.join('\n')).toMatch(/--content/);
    writeFileSync(
      file,
      deployed({
        alpha: '2026-07-01T00:00:00Z',
        beta: '2026-07-01T00:00:00Z',
        gamma: '2026-07-01T00:00:00Z',
      })
    );
    expect(await runCli(shallow, ['--deployed', file])).toBe(0);
  });

  it('runCli --content settles an unknown row by what is deployed', async () => {
    const { shallow } = build();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const file = join(shallow, 'deployed.json');
    writeFileSync(
      file,
      deployed({
        alpha: '2025-12-15T00:00:00Z',
        beta: '2026-07-01T00:00:00Z',
        gamma: '2026-07-01T00:00:00Z',
      })
    );
    // A download that mirrors the source tree exactly: every row is current.
    const mirror: Downloader = (name, workdir) => {
      for (const rel of [`${name}/index.ts`, '_shared/util.ts']) {
        const text = readFileSync(join(shallow, 'supabase/functions', rel), 'utf8');
        write(workdir, `supabase/functions/${rel}`, text);
      }
      return true;
    };
    expect(await runCli(shallow, ['--deployed', file, '--content'], mirror)).toBe(0);
    // One download failing makes the whole run incomplete: exit 2, not 0.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const flaky: Downloader = (name, workdir) => name !== 'beta' && mirror(name, workdir);
    expect(await runCli(shallow, ['--deployed', file, '--content'], flaky)).toBe(2);
  });
});

describe('resolveByContent', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function repo(files: Record<string, string>): string {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'edge content ')));
    dirs.push(root);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  }
  const deploying =
    (files: Record<string, string>): Downloader =>
    (_name, workdir) => {
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(join(workdir, 'supabase/functions', rel, '..'), { recursive: true });
        writeFileSync(join(workdir, 'supabase/functions', rel), text);
      }
      return true;
    };
  const identity = async (t: string) => t;
  const row = (status: DriftRow['status']): DriftRow => ({
    name: 'fn',
    status,
    dirs: ['supabase/functions'],
    note: 'dated',
  });
  const SOURCE = {
    'supabase/functions/fn/index.ts': "import { h } from '../_shared/h.ts';\nh();\n",
    'supabase/functions/fn/index.test.ts': 'test only, never bundled\n',
    'supabase/functions/_shared/h.ts':
      'export function h(a: number, b: number) {\n  return a + b;\n}\n',
  };

  it('a deploy identical to source is current, and test files are not compared', async () => {
    const root = repo(SOURCE);
    const [got] = await resolveByContent(
      [row('unknown')],
      root,
      deploying({
        'fn/index.ts': SOURCE['supabase/functions/fn/index.ts'],
        '_shared/h.ts': SOURCE['supabase/functions/_shared/h.ts'],
      }),
      identity
    );
    expect(got).toMatchObject({ status: 'current', note: 'content matches deploy (2 files)' });
  });

  it('a date-current row whose bundled _shared file changed is stale', async () => {
    const root = repo(SOURCE);
    const [got] = await resolveByContent(
      [row('current')],
      root,
      deploying({
        'fn/index.ts': SOURCE['supabase/functions/fn/index.ts'],
        '_shared/h.ts': 'export function h(a: number, b: number) {\n  return a - b;\n}\n',
      }),
      identity
    );
    expect(got).toMatchObject({ status: 'stale', note: 'content differs: _shared/h.ts' });
  });

  it('formatting-only differences are current under Prettier and stale byte-for-byte', async () => {
    const root = repo(SOURCE);
    const reformatted = deploying({
      'fn/index.ts': 'import { h } from "../_shared/h.ts"\nh()\n',
      '_shared/h.ts': 'export function h(a: number,b: number) { return a + b }\n',
    });
    const [pretty] = await resolveByContent(
      [row('unknown')],
      root,
      reformatted,
      prettierNormalizer
    );
    expect(pretty!.status).toBe('current');
    const [bytes] = await resolveByContent([row('unknown')], root, reformatted, identity);
    expect(bytes!.status).toBe('stale');
  });

  it('a deployed file missing from source is a difference', async () => {
    const root = repo(SOURCE);
    const [got] = await resolveByContent(
      [row('unknown')],
      root,
      deploying({
        'fn/index.ts': SOURCE['supabase/functions/fn/index.ts'],
        '_shared/gone.ts': 'export {};\n',
      }),
      identity
    );
    expect(got).toMatchObject({
      status: 'stale',
      note: 'content differs: _shared/gone.ts (not in source)',
    });
  });

  it('a failed or empty download is check-failed, never left at its dated status', async () => {
    const root = repo(SOURCE);
    // Codex review: a date-current row that could not be compared stayed
    // `current`, so --content exited 0 without having compared it.
    const [failed] = await resolveByContent([row('current')], root, () => false, identity);
    expect(failed).toMatchObject({ status: 'check-failed' });
    expect(failed!.note).toMatch(/download error/);
    const [empty] = await resolveByContent([row('current')], root, () => true, identity);
    expect(empty).toMatchObject({ status: 'check-failed' });
    expect(empty!.note).toMatch(/no fn\/ files/);
  });

  it('never-deployed and dual-location rows are not downloaded', async () => {
    const download = vi.fn<Downloader>(() => true);
    const rows = [row('never-deployed'), row('dual-location')];
    expect(await resolveByContent(rows, repo(SOURCE), download, identity)).toEqual(rows);
    expect(download).not.toHaveBeenCalled();
  });
});

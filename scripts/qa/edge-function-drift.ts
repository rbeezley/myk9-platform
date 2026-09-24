/**
 * Edge-function deploy drift: compares each function's source last-edit date
 * with its deployed `updated_at` (the cleanup skill's § Edge Function Deploys).
 *
 * Two traps made the hand-run version of this check flag 20 of 45 functions as
 * stale on 2026-09-15, every one a false positive (MYK9-597):
 *
 * 1. **Shallow clones.** In a shallow clone `git log -1 -- <dir>` bottoms out
 *    at the graft boundary for any file untouched since, and returns the
 *    BOUNDARY's date, not the file's real last edit. The real edit is at or
 *    before that date, so a deploy newer than the boundary is still provably
 *    current; a deploy older than it cannot be judged from history at all and
 *    is reported `unknown`, never `stale`.
 * 2. **Formatting-only sweeps.** A commit listed in `.git-blame-ignore-revs`
 *    (the one-time Prettier pass, #2121) changes no behaviour, so it is skipped
 *    when dating a function, exactly as `git blame` skips it.
 *
 * Usage:
 *   pnpm qa:edge-function-drift                      # asks the Supabase CLI
 *   pnpm qa:edge-function-drift --deployed list.json # `functions list -o json`
 *   pnpm qa:edge-function-drift --content            # check every deployed row by
 *                                                    # download + formatted compare
 *
 * Dates never see a `_shared/*` edit (it touches no function dir); `--content`
 * does, because a download carries every `_shared` file the function bundles.
 * Both modes only READ the project: nothing here deploys.
 *
 * `stale` exists only in date mode: the source's dating commit is newer than
 * the deploy. `--content` never says `stale`. A mismatch there is `differs`,
 * because two copies that are not the same say nothing about which one is
 * newer: the deploy may carry a live-only change the repo lacks.
 *
 * Exit 0: every function is current (sub-day gaps are ordering noise).
 * Exit 1: at least one stale, differs, unknown, never-deployed, orphan-deploy
 *         or dual-location row.
 * Exit 2: the check itself could not run, including any `--content` download
 *         that failed (a row it could not compare is `check-failed`, never
 *         left at its dated status).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROJECT_REF = 'sojmvhhwsjxmfistvzbe';
export const FUNCTION_DIRS = ['supabase/functions', 'apps/myk9show/supabase/functions'] as const;
export const IGNORE_REVS_FILE = '.git-blame-ignore-revs';
const DAY_MS = 24 * 60 * 60 * 1000;

export type DriftStatus =
  | 'current'
  | 'sub-day'
  | 'stale'
  | 'differs'
  | 'unknown'
  | 'never-deployed'
  | 'orphan-deploy'
  | 'dual-location'
  | 'check-failed';

export interface SourceFunction {
  name: string;
  dir: string;
  /** Last commit touching the function dir, after skipping ignored revs. */
  commit?: { sha: string; dateMs: number };
  /** True when `commit` is a shallow-clone graft boundary: the real edit is at or before it. */
  atShallowFloor: boolean;
}

export interface DeployedFunction {
  slug: string;
  updatedAtMs: number;
}

export interface DriftRow {
  name: string;
  status: DriftStatus;
  dirs: string[];
  sourceDateMs?: number;
  deployedDateMs?: number;
  note: string;
}

/** SHAs from a `.git-blame-ignore-revs` file: comments and blank lines skipped. */
export function parseIgnoreRevs(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (/^[0-9a-f]{40}$/i.test(line)) out.add(line.toLowerCase());
  }
  return out;
}

/** `git log --format=%H%x09%cI` output, newest first. */
export function pickSourceCommit(
  logOutput: string,
  ignore: ReadonlySet<string>
): { sha: string; dateMs: number } | undefined {
  for (const line of logOutput.split('\n')) {
    const [sha, date] = line.trim().split('\t');
    if (!sha || !date || ignore.has(sha.toLowerCase())) continue;
    const dateMs = Date.parse(date);
    if (Number.isNaN(dateMs)) continue;
    return { sha: sha.toLowerCase(), dateMs };
  }
  return undefined;
}

/** `supabase functions list -o json`: `updated_at` is epoch milliseconds. */
export function parseDeployed(json: string): DeployedFunction[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('deployed list is not a JSON array');
  return parsed.map((row: unknown, i) => {
    const r = row as { slug?: unknown; updated_at?: unknown };
    if (typeof r.slug !== 'string' || typeof r.updated_at !== 'number') {
      throw new Error(`deployed row ${i} lacks a string slug and a numeric updated_at`);
    }
    return { slug: r.slug, updatedAtMs: r.updated_at };
  });
}

function iso(ms: number | undefined): string {
  return ms === undefined ? '-' : `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

export function classify(
  sources: readonly SourceFunction[],
  deployed: readonly DeployedFunction[]
): DriftRow[] {
  const bySlug = new Map(deployed.map(d => [d.slug, d]));
  const byName = new Map<string, SourceFunction[]>();
  for (const s of sources) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);

  const rows: DriftRow[] = [];
  for (const [name, copies] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    const dirs = copies.map(c => c.dir);
    const deployedDateMs = bySlug.get(name)?.updatedAtMs;
    const base = { name, dirs, deployedDateMs };
    if (copies.length > 1) {
      rows.push({
        ...base,
        status: 'dual-location',
        note: 'source exists in both function dirs; only one is the deployed slug — decide which is canonical',
      });
      continue;
    }
    const src = copies[0]!;
    const sourceDateMs = src.commit?.dateMs;
    if (deployedDateMs === undefined) {
      rows.push({ ...base, sourceDateMs, status: 'never-deployed', note: 'no deployed slug' });
      continue;
    }
    if (sourceDateMs === undefined) {
      rows.push({
        ...base,
        status: 'unknown',
        note: 'no dating commit in history (every commit ignored or none reachable)',
      });
      continue;
    }
    const gap = sourceDateMs - deployedDateMs;
    if (gap <= 0) {
      rows.push({ ...base, sourceDateMs, status: 'current', note: '' });
    } else if (src.atShallowFloor) {
      // The real edit is at or BEFORE the floor date, and the deploy is older
      // than the floor: history cannot say which came first.
      rows.push({
        ...base,
        sourceDateMs,
        status: 'unknown',
        note: 'shallow history floor — real edit date is at or before this; download and diff to decide',
      });
    } else if (gap < DAY_MS) {
      rows.push({
        ...base,
        sourceDateMs,
        status: 'sub-day',
        note: 'squash-merge ordering noise unless a diff proves otherwise',
      });
    } else {
      rows.push({
        ...base,
        sourceDateMs,
        status: 'stale',
        note: `source newer by ${Math.round(gap / DAY_MS)}d`,
      });
    }
  }
  // Deployed slugs no source dir claims: live code nothing in the repo maintains.
  for (const d of [...deployed].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (byName.has(d.slug)) continue;
    rows.push({
      name: d.slug,
      dirs: [],
      deployedDateMs: d.updatedAtMs,
      status: 'orphan-deploy',
      note: 'deployed, but no source dir in either function dir — delete the deploy or restore its source',
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export const ACTIONABLE: ReadonlySet<DriftStatus> = new Set([
  'stale',
  'differs',
  'unknown',
  'never-deployed',
  'orphan-deploy',
  'dual-location',
]);

export function render(rows: readonly DriftRow[]): string {
  const lines = rows.map(r =>
    [
      r.status.padEnd(14),
      r.name.padEnd(34),
      iso(r.sourceDateMs).padEnd(21),
      iso(r.deployedDateMs).padEnd(21),
      r.dirs.join(', '),
      r.note,
    ]
      .join(' ')
      .trimEnd()
  );
  const counts = new Map<DriftStatus, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const summary = [...counts].map(([s, n]) => `${n} ${s}`).join(', ');
  return [
    `${'status'.padEnd(14)} ${'function'.padEnd(34)} ${'source'.padEnd(21)} ${'deployed'.padEnd(21)} dir`,
    ...lines,
    '',
    `edge-function-drift: ${rows.length} functions — ${summary || 'none'}`,
  ].join('\n');
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Graft-boundary SHAs, or an empty set for a complete clone. */
export function shallowBoundaries(root: string): Set<string> {
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() !== 'true') return new Set();
  const file = git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'shallow']).trim();
  return new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function collectSources(root: string): SourceFunction[] {
  const ignoreFile = join(root, IGNORE_REVS_FILE);
  const ignore = existsSync(ignoreFile)
    ? parseIgnoreRevs(readFileSync(ignoreFile, 'utf8'))
    : new Set<string>();
  const floor = shallowBoundaries(root);
  const out: SourceFunction[] = [];
  for (const dir of FUNCTION_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const d of readdirSync(abs, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) continue;
      const rel = `${dir}/${d.name}`;
      const commit = pickSourceCommit(git(root, ['log', '--format=%H%x09%cI', '--', rel]), ignore);
      out.push({
        name: d.name,
        dir,
        commit,
        atShallowFloor: commit !== undefined && floor.has(commit.sha),
      });
    }
  }
  return out;
}

/** Downloads one deployed function into `workdir`; returns false when the download failed. */
export type Downloader = (name: string, workdir: string) => boolean;

export const supabaseDownloader: Downloader = (name, workdir) => {
  try {
    execFileSync(
      'supabase',
      [
        'functions',
        'download',
        name,
        '--project-ref',
        PROJECT_REF,
        '--use-api',
        '--workdir',
        workdir,
      ],
      { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return true;
  } catch {
    return false;
  }
};

function filesUnder(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...filesUnder(join(dir, d.name), rel));
    else if (d.isFile()) out.push(rel);
  }
  return out;
}

/**
 * `current` is content-checked too: a date is taken from the function's own
 * dir, so an edit to a `_shared` file it imports never moves it. On 2026-09-24
 * dates alone called 23 functions current and content showed some of those
 * bundling `_shared` code that differs from main.
 */
const CONTENT_CHECKED: ReadonlySet<DriftStatus> = new Set([
  'current',
  'stale',
  'sub-day',
  'unknown',
]);

/** Maps a file's text to the form two copies are compared in. */
export type Normalizer = (text: string, filepath: string) => Promise<string>;

/**
 * Formats both copies with the repo's Prettier config before comparing. The
 * #2121 Prettier pass rewrote every `_shared` helper, so a byte comparison
 * calls a deploy from before it "different" when only commas and line breaks
 * moved; on 2026-09-24 that was 8 of 20 byte-level flags. A file Prettier
 * cannot parse is compared as-is.
 */
export const prettierNormalizer: Normalizer = async (text, filepath) => {
  const prettier = await import('prettier');
  try {
    const config = (await prettier.resolveConfig(filepath)) ?? {};
    return await prettier.format(text, { ...config, filepath });
  } catch {
    return text;
  }
};

/**
 * Whether the deploy matches source, which dates cannot say: download what is
 * deployed and compare it, file by file, with the source dir it deploys from.
 * A match is `current`; a mismatch is `differs`, never `stale`, because it
 * says nothing about which copy is newer.
 * Every downloaded file (the function's own and each `_shared` file it
 * bundles) must match the repo copy once both are formatted; source-only files
 * such as tests are never bundled, so they are not compared. Never-deployed
 * and dual-location rows pass through untouched.
 */
export async function resolveByContent(
  rows: readonly DriftRow[],
  root: string,
  download: Downloader,
  normalize: Normalizer = prettierNormalizer
): Promise<DriftRow[]> {
  const out: DriftRow[] = [];
  for (const row of rows) {
    if (!CONTENT_CHECKED.has(row.status)) {
      out.push(row);
      continue;
    }
    const scratch = mkdtempSync(join(tmpdir(), 'edge fn drift '));
    try {
      if (!download(row.name, scratch)) {
        out.push({ ...row, status: 'check-failed', note: 'content check failed: download error' });
        continue;
      }
      const got = join(scratch, 'supabase/functions');
      const files = filesUnder(got);
      if (!files.some(f => f.startsWith(`${row.name}/`))) {
        out.push({
          ...row,
          status: 'check-failed',
          note: `content check failed: no ${row.name}/ files downloaded`,
        });
        continue;
      }
      const differing: string[] = [];
      for (const f of files) {
        const src = join(root, row.dirs[0]!, f);
        if (!existsSync(src)) {
          differing.push(`${f} (not in source)`);
          continue;
        }
        const [a, b] = await Promise.all([
          normalize(readFileSync(src, 'utf8'), src),
          normalize(readFileSync(join(got, f), 'utf8'), src),
        ]);
        if (a !== b) differing.push(f);
      }
      out.push(
        differing.length === 0
          ? { ...row, status: 'current', note: `content matches deploy (${files.length} files)` }
          : {
              ...row,
              status: 'differs',
              note: `deploy and source differ, direction unknown: ${differing.join(', ')}`,
            }
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  return out;
}

export async function runCli(
  root: string,
  argv: readonly string[],
  download: Downloader = supabaseDownloader
): Promise<number> {
  const i = argv.indexOf('--deployed');
  let json: string;
  try {
    json =
      i >= 0 && argv[i + 1]
        ? readFileSync(argv[i + 1]!, 'utf8')
        : execFileSync(
            'supabase',
            ['functions', 'list', '--project-ref', PROJECT_REF, '-o', 'json'],
            {
              cwd: root,
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
            }
          );
  } catch (err) {
    console.error(
      `edge-function-drift: could not read the deployed list — ${(err as Error).message}`
    );
    return 2;
  }
  let rows: DriftRow[];
  try {
    rows = classify(collectSources(root), parseDeployed(json));
    if (argv.includes('--content')) rows = await resolveByContent(rows, root, download);
  } catch (err) {
    console.error(`edge-function-drift: ${(err as Error).message}`);
    return 2;
  }
  console.log(render(rows));
  if (rows.some(r => r.status === 'unknown')) {
    console.log(
      '\nunknown: dates cannot decide (shallow history floor older than the deploy). Re-run with\n' +
        '--content to download each deploy and compare it with source (read-only), or\n' +
        '`git fetch --unshallow` (a large fetch; ask first) and re-run.'
    );
  }
  if (rows.some(r => r.status === 'check-failed')) {
    console.error('edge-function-drift: a content check could not run; the result is incomplete');
    return 2;
  }
  return rows.some(r => ACTIONABLE.has(r.status)) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let root: string;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    console.error('edge-function-drift: not inside a git checkout');
    process.exit(2);
  }
  process.exitCode = await runCli(root, process.argv.slice(2));
}

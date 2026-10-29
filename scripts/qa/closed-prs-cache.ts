/**
 * The repo's closed pull requests, fetched incrementally (MYK9-1483).
 *
 * `qa:inflight` needs every merged PR to decide whether a local branch already
 * shipped, and paging all of them cost about 28 s of its ~36 s on every run
 * (3,400 PRs, 34 sequential pages). Closed PRs are history: once a run has
 * seen them, the next run only needs what changed since. So the list is read
 * newest-updated first and paging stops at the first page that reaches back
 * past what the cache already holds, minus OVERLAP_MS for clock and ordering
 * slack.
 *
 * Only this history is cached. Open PRs, worktrees and local branches stay
 * live on every run, so a push by another session is never hidden. A missing
 * or unreadable cache means a full fetch; a failed fetch throws before the
 * cache is written, so a run that could not decide never leaves state behind.
 * The cache lives in the git common dir, shared by every worktree.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GH_MAX_PAGES as MAX_PAGES, GH_PAGE_SIZE as PAGE_SIZE } from './gh-pages.ts';

export { MAX_PAGES, PAGE_SIZE };

export interface ClosedPr {
  number?: number;
  updated_at?: string;
  created_at: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { sha: string; ref: string };
}

/** A row updated this long before the cache's newest one still counts as "maybe changed". */
export const OVERLAP_MS = 10 * 60 * 1000;

const VERSION = 1;

/** One row per PR. A row with no number (never from GitHub) keys on its head and creation time. */
function keyOf(pr: ClosedPr): string {
  return typeof pr.number === 'number' ? `#${pr.number}` : `${pr.head.ref}@${pr.created_at}`;
}

function slim(pr: ClosedPr): ClosedPr {
  const { number, updated_at, created_at, merged_at, merge_commit_sha, head } = pr;
  return {
    number,
    updated_at,
    created_at,
    merged_at,
    merge_commit_sha,
    head: { sha: head.sha, ref: head.ref },
  };
}

function isRow(r: unknown): r is ClosedPr {
  const pr = r as Partial<ClosedPr> | null;
  return (
    typeof pr?.created_at === 'string' &&
    typeof pr.head?.ref === 'string' &&
    typeof pr.head.sha === 'string'
  );
}

/** The cached rows, or undefined (a cold fetch) when the file is missing, another version, or any row is malformed. */
export function loadCache(file: string): ClosedPr[] | undefined {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { version?: number; rows?: unknown };
    return data.version === VERSION && Array.isArray(data.rows) && data.rows.every(isRow)
      ? data.rows
      : undefined;
  } catch {
    return undefined;
  }
}

/** Best effort: the cache only saves time, so a write that fails costs the next run a full fetch. */
function saveCache(file: string, rows: ClosedPr[]): void {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(tmp, JSON.stringify({ version: VERSION, rows }));
    renameSync(tmp, file);
  } catch {
    rmSync(tmp, { force: true });
  }
}

/** Newest `updated_at` in the cache, or undefined when no row carries a readable one. */
export function watermark(rows: ClosedPr[]): number | undefined {
  let newest: number | undefined;
  for (const r of rows) {
    const t = Date.parse(r.updated_at ?? '');
    if (Number.isFinite(t) && (newest === undefined || t > newest)) newest = t;
  }
  return newest;
}

/**
 * Every closed PR. `readPage(n)` returns page n (1-based) of
 * `pulls?state=closed&sort=updated&direction=desc`; it throws when gh cannot answer.
 */
export function closedPrs(readPage: (page: number) => ClosedPr[], cacheFile: string): ClosedPr[] {
  const cached = loadCache(cacheFile);
  const since = cached ? watermark(cached) : undefined;
  const rows = new Map((cached ?? []).map(r => [keyOf(r), r]));
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = readPage(page);
    for (const pr of batch) rows.set(keyOf(pr), slim(pr));
    const oldest = Date.parse(batch.at(-1)?.updated_at ?? '');
    const caughtUp = since !== undefined && oldest < since - OVERLAP_MS;
    if (batch.length < PAGE_SIZE || caughtUp) {
      const all = [...rows.values()];
      saveCache(cacheFile, all);
      return all;
    }
  }
  throw new Error(`more than ${MAX_PAGES} pages`);
}

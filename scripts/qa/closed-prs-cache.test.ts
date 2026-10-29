import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type ClosedPr,
  closedPrs,
  loadCache,
  MAX_PAGES,
  OVERLAP_MS,
  PAGE_SIZE,
  watermark,
} from './closed-prs-cache.ts';

const T0 = Date.parse('2026-10-29T12:00:00Z');
const HOUR = 3600 * 1000;

function pr(number: number, updatedMs: number, merged = true): ClosedPr {
  return {
    number,
    updated_at: new Date(updatedMs).toISOString(),
    created_at: '2026-10-01T00:00:00Z',
    merged_at: merged ? '2026-10-01T00:00:00Z' : null,
    merge_commit_sha: merged ? 'm'.repeat(40) : null,
    head: { sha: String(number).padStart(40, '0'), ref: `branch-${number}` },
  };
}

/** `count` PRs, newest-updated first, one hour apart, the newest at `newest`. */
function history(count: number, newest = T0, firstNumber = 1): ClosedPr[] {
  return Array.from({ length: count }, (_, i) => pr(firstNumber + i, newest - i * HOUR));
}

/** A fake `gh api` page reader over `rows`, recording which pages were asked for. */
function server(rows: ClosedPr[]) {
  const asked: number[] = [];
  const readPage = (page: number) => {
    asked.push(page);
    return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  };
  return { readPage, asked };
}

const dirs: string[] = [];
function cacheFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'closed-prs-'));
  dirs.push(dir);
  return join(dir, 'sub', 'closed-prs.json');
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('closedPrs', () => {
  it('fetches every page on a cold cache and writes the cache', () => {
    const file = cacheFile();
    const gh = server(history(250));
    expect(closedPrs(gh.readPage, file)).toHaveLength(250);
    expect(gh.asked).toEqual([1, 2, 3]);
    expect(loadCache(file)).toHaveLength(250);
  });

  it('reads only page 1 on a warm cache when nothing changed', () => {
    const file = cacheFile();
    closedPrs(server(history(250)).readPage, file);
    const gh = server(history(250));
    expect(closedPrs(gh.readPage, file)).toHaveLength(250);
    expect(gh.asked).toEqual([1]);
  });

  it('sees a PR merged since the last run', () => {
    const file = cacheFile();
    closedPrs(server(history(250)).readPage, file);
    const gh = server([pr(999, T0 + HOUR), ...history(250)]);
    const rows = closedPrs(gh.readPage, file);
    expect(rows.find(r => r.number === 999)?.merged_at).not.toBeNull();
    expect(rows).toHaveLength(251);
    expect(gh.asked).toEqual([1]);
  });

  it('replaces a cached row by number when GitHub returns a newer copy', () => {
    const file = cacheFile();
    closedPrs(server([pr(7, T0, false)]).readPage, file);
    const rows = closedPrs(server([pr(7, T0 + HOUR, true)]).readPage, file);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.merged_at).not.toBeNull();
  });

  it('keeps paging while a page still reaches into the overlap window', () => {
    const file = cacheFile();
    // 250 rows a few seconds apart: page 1 ends well inside OVERLAP_MS of the newest.
    const dense = Array.from({ length: 250 }, (_, i) => pr(i + 1, T0 - i * 1000));
    closedPrs(server(dense).readPage, file);
    const gh = server(dense);
    closedPrs(gh.readPage, file);
    expect(gh.asked).toEqual([1, 2, 3]);
    expect(OVERLAP_MS).toBeGreaterThan(250 * 1000);
  });

  it.each([
    ['not JSON', 'garbage'],
    // A fresh row, so a cache wrongly accepted would stop paging after page 1.
    ['another version', JSON.stringify({ version: 99, rows: [pr(1, T0 + HOUR)] })],
    ['rows missing', JSON.stringify({ version: 1, data: [pr(1, T0 + HOUR)] })],
  ])('treats a cache that is %s as cold', (_label, content) => {
    const file = cacheFile();
    closedPrs(server([]).readPage, file); // creates the directory
    writeFileSync(file, content);
    const gh = server(history(250));
    expect(closedPrs(gh.readPage, file)).toHaveLength(250);
    expect(gh.asked).toEqual([1, 2, 3]);
  });

  it('treats a cache with a malformed row as cold instead of crashing', () => {
    const file = cacheFile();
    closedPrs(server([]).readPage, file); // creates the directory
    writeFileSync(file, JSON.stringify({ version: 1, rows: [pr(1, T0 + HOUR), { number: 2 }] }));
    const gh = server(history(250));
    expect(closedPrs(gh.readPage, file)).toHaveLength(250);
    expect(gh.asked).toEqual([1, 2, 3]);
  });

  it('writes no cache when a page read fails', () => {
    const file = cacheFile();
    const failing = (page: number) => {
      if (page === 2) throw new Error('gh: HTTP 502');
      return history(250).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    };
    expect(() => closedPrs(failing, file)).toThrow('HTTP 502');
    expect(existsSync(file)).toBe(false);
  });

  it('leaves an existing cache untouched when a later run fails', () => {
    const file = cacheFile();
    closedPrs(server(history(250)).readPage, file);
    const before = readFileSync(file, 'utf8');
    expect(() =>
      closedPrs(() => {
        throw new Error('gh: not logged in');
      }, file)
    ).toThrow('not logged in');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses a list that never ends rather than returning part of it', () => {
    const full = history(PAGE_SIZE);
    expect(() => closedPrs(() => full, cacheFile())).toThrow(`more than ${MAX_PAGES} pages`);
  });
});

describe('watermark', () => {
  it('is the newest readable updated_at, or undefined', () => {
    expect(watermark(history(3))).toBe(T0);
    expect(watermark([{ ...pr(1, T0), updated_at: 'never' }])).toBeUndefined();
    expect(watermark([])).toBeUndefined();
  });
});

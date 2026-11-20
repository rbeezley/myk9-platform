/**
 * MYK9-2252: the shared keyset pager reads every row, not the first `max_rows`.
 */
import { describe, it, expect } from 'vitest';
import { fetchKeysetPages } from '../keysetPager';
import { createFakePostgrestTable } from '@/test/utils/fakePostgrestTable';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');

const makeRows = (count: number, updatedAt: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => ({
    id: `id-${String(index).padStart(5, '0')}`,
    updated_at: updatedAt(index),
  }));

const readAll = (table: ReturnType<typeof createFakePostgrestTable>, since = 0) =>
  fetchKeysetPages({ base: () => table.from(), since });

describe('fetchKeysetPages', () => {
  it('returns all 2,500 rows when the server caps one response at 1,000', async () => {
    const rows = makeRows(2500, i => new Date(T0 + i * 1000).toISOString());
    const table = createFakePostgrestTable(rows);

    const result = await readAll(table);

    expect(result.map(row => row.id)).toEqual(rows.map(row => row.id));
    expect(table.requests).toHaveLength(3);
  });

  it('skips no row when more than one page shares one updated_at', async () => {
    // Classes cloned in one statement share a timestamp; a cursor on the
    // timestamp alone would drop rows at every page boundary.
    const sameInstant = '2026-03-03T12:00:00.000Z';
    const rows = makeRows(2300, () => sameInstant);
    const table = createFakePostgrestTable(rows);

    const result = await readAll(table);

    expect(new Set(result.map(row => row.id)).size).toBe(2300);
    expect(result).toHaveLength(2300);
  });

  it('pages on the (updated_at, id) cursor and never on an offset', async () => {
    const rows = makeRows(1200, () => '2026-03-03T12:00:00.000Z');
    const table = createFakePostgrestTable(rows);

    await readAll(table);

    expect(table.requests[0]).toContain('gt updated_at');
    expect(table.requests[1]).toContain('or keyset');
    expect(table.requests.every(request => request.includes('order(updated_at,id)'))).toBe(true);
  });

  it('stops after one request when the first page is short', async () => {
    const table = createFakePostgrestTable(makeRows(5, i => new Date(T0 + i).toISOString()));

    expect(await readAll(table)).toHaveLength(5);
    expect(table.requests).toHaveLength(1);
  });

  it('returns only rows newer than `since`', async () => {
    const rows = makeRows(10, i => new Date(T0 + i * 1000).toISOString());
    const table = createFakePostgrestTable(rows);

    const result = await readAll(table, T0 + 4500);

    expect(result.map(row => row.id)).toEqual(rows.slice(5).map(row => row.id));
  });

  it('applies the scope filter on every page', async () => {
    const rows = makeRows(2200, i => new Date(T0 + i * 1000).toISOString()).map((row, i) => ({
      ...row,
      show_id: i % 2 === 0 ? 'show-a' : 'show-b',
    }));
    const table = createFakePostgrestTable(rows);

    const result = await fetchKeysetPages({
      base: () => table.from(),
      since: 0,
      pageSize: 500,
      scope: query => query.eq('show_id', 'show-a'),
    });

    expect(result).toHaveLength(1100);
    expect(table.requests.every(request => request.includes('eq show_id'))).toBe(true);
  });

  it('throws with the server message and the prefix on an error', async () => {
    const failing = {
      gt: () => failing,
      or: () => failing,
      order: () => failing,
      range: async () => ({ data: null, error: { message: 'boom' } }),
    };

    await expect(
      fetchKeysetPages({ base: () => failing, since: 0, errorPrefix: 'Trials fetch failed' })
    ).rejects.toThrow('Trials fetch failed: boom');
  });
});

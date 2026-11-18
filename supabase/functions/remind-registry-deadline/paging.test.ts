// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, chunk, fetchAllPages } from './paging.ts';

describe('chunk', () => {
  it('splits into batches no longer than the size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe('fetchAllPages', () => {
  it('reads past the 1,000-row cap, one page at a time, in the order given', async () => {
    const all = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, index) => index);
    const ranges: [number, number][] = [];
    const rows = await fetchAllPages<number>('failed', async (from, to) => {
      ranges.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(rows).toEqual(all);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('stops after an exact multiple only when the next page is empty', async () => {
    const all = Array.from({ length: PAGE_SIZE }, (_, index) => index);
    let calls = 0;
    const rows = await fetchAllPages<number>('failed', async (from, to) => {
      calls += 1;
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(calls).toBe(2);
  });

  it('throws when a page fails, never returning a partial scan', async () => {
    await expect(
      fetchAllPages<number>('Failed to load shows.', async () => ({
        data: null,
        error: { message: 'boom' },
      }))
    ).rejects.toMatchObject({ status: 500, message: 'Failed to load shows.' });
  });
});

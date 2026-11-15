// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { READ_PAGE_SIZE, readAllPages } from './pagedRead';

const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ id: start + i }));

describe('readAllPages', () => {
  it('reads every page until a short one and returns all rows in order', async () => {
    const all = rows(READ_PAGE_SIZE * 2 + 5);
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: all.slice(from, to + 1),
      error: null,
    }));
    const result = await readAllPages(fetchPage, 'read');
    expect(result).toEqual(all);
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks for one more page when the last is exactly full, then stops on the empty one', async () => {
    const all = rows(READ_PAGE_SIZE);
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: all.slice(from, to + 1),
      error: null,
    }));
    expect(await readAllPages(fetchPage, 'read')).toHaveLength(READ_PAGE_SIZE);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('throws on a page error instead of returning the partial read', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: rows(READ_PAGE_SIZE), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(readAllPages(fetchPage, 'Could not read exhibitor entries')).rejects.toThrow(
      'Could not read exhibitor entries: boom'
    );
  });
});

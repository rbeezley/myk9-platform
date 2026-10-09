import { describe, expect, it, vi } from 'vitest';
import { fetchLiveIdSet, LIVE_ID_MAX_PAGES, LIVE_ID_PAGE_SIZE } from './liveIdSet';

const page = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `id-${String(start + i).padStart(6, '0')}` }));

describe('fetchLiveIdSet (MYK9-1071)', () => {
  it('reads keyset pages until a short page, advancing the cursor by the last id', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: page(0, LIVE_ID_PAGE_SIZE), error: null })
      .mockResolvedValueOnce({ data: page(LIVE_ID_PAGE_SIZE, 3), error: null });

    const ids = await fetchLiveIdSet(fetchPage);

    expect(ids?.size).toBe(LIVE_ID_PAGE_SIZE + 3);
    expect(fetchPage.mock.calls).toEqual([
      [undefined, LIVE_ID_PAGE_SIZE],
      [`id-${String(LIVE_ID_PAGE_SIZE - 1).padStart(6, '0')}`, LIVE_ID_PAGE_SIZE],
    ]);
  });

  it('returns null (prune nothing) when any page errors', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: page(0, LIVE_ID_PAGE_SIZE), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await fetchLiveIdSet(fetchPage)).toBeNull();
  });

  it('returns null when the page cap is reached without a short page', async () => {
    let start = 0;
    const fetchPage = vi.fn(async () => {
      const data = page(start, LIVE_ID_PAGE_SIZE);
      start += LIVE_ID_PAGE_SIZE;
      return { data, error: null };
    });
    expect(await fetchLiveIdSet(fetchPage)).toBeNull();
    expect(fetchPage).toHaveBeenCalledTimes(LIVE_ID_MAX_PAGES);
  });
});

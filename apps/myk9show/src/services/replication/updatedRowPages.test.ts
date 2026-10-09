import { describe, expect, it, vi } from 'vitest';
import {
  afterCursorFilter,
  fetchUpdatedRowsInPages,
  UPDATED_ROW_MAX_PAGES,
  UPDATED_ROW_PAGE_SIZE,
} from './updatedRowPages';

type Row = { id: string; updated_at: string | null };
const sameStamp = (start: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `id-${String(start + i).padStart(6, '0')}`,
    // Every row shares one timestamp: a bulk update.
    updated_at: '2026-10-09T12:00:00.123456+00:00',
  }));

describe('fetchUpdatedRowsInPages (MYK9-1071)', () => {
  it('pages past max_rows on (updated_at, id), so equal timestamps still progress', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: sameStamp(0, UPDATED_ROW_PAGE_SIZE), error: null })
      .mockResolvedValueOnce({ data: sameStamp(UPDATED_ROW_PAGE_SIZE, 2), error: null });

    const rows = await fetchUpdatedRowsInPages<Row>(fetchPage);

    expect(rows).toHaveLength(UPDATED_ROW_PAGE_SIZE + 2);
    expect(fetchPage.mock.calls[1]?.[0]).toEqual({
      updatedAt: '2026-10-09T12:00:00.123456+00:00',
      id: `id-${String(UPDATED_ROW_PAGE_SIZE - 1).padStart(6, '0')}`,
    });
  });

  it('builds a strictly-after cursor filter', () => {
    expect(afterCursorFilter({ updatedAt: 'T', id: 'x' })).toBe(
      'updated_at.gt."T",and(updated_at.eq."T",id.gt.x)'
    );
  });

  it('throws on a page error, so the sync is not recorded as complete', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(fetchUpdatedRowsInPages<Row>(fetchPage)).rejects.toThrow('boom');
  });

  it('throws past the page cap rather than returning a partial download', async () => {
    let start = 0;
    const fetchPage = vi.fn(async () => {
      const data = sameStamp(start, UPDATED_ROW_PAGE_SIZE);
      start += UPDATED_ROW_PAGE_SIZE;
      return { data, error: null };
    });
    await expect(fetchUpdatedRowsInPages<Row>(fetchPage)).rejects.toThrow(/pages/);
    expect(fetchPage).toHaveBeenCalledTimes(UPDATED_ROW_MAX_PAGES);
  });
});

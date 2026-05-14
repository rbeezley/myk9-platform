import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageData, useInfiniteScroll } from './useInfiniteScroll';

interface DogRow {
  id: string;
  callName: string;
}

const makeDogPage = (page: number, pageSize: number, totalPages = 5): PageData<DogRow> => ({
  items: Array.from({ length: pageSize }, (_, index) => ({
    id: `dog-${page}-${index}`,
    callName: `Dog ${page}-${index}`,
  })),
  page,
  totalPages,
  totalCount: pageSize * totalPages,
  hasNextPage: page < totalPages,
  hasPreviousPage: page > 1,
});

describe('useInfiniteScroll performance and caching', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('loads large registration result pages with stable pagination metadata', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) =>
      makeDogPage(page, pageSize, 12)
    );

    const { result } = renderHook(() =>
      useInfiniteScroll(loadPage, {
        pageSize: 250,
        prefetch: false,
        enableCache: true,
      })
    );

    await waitFor(() => expect(result.current.currentPage).toBe(1));

    expect(loadPage).toHaveBeenCalledWith(1, 250);
    expect(result.current.items).toHaveLength(250);
    expect(result.current.totalCount).toBe(3000);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.getCacheStats()).toEqual({
      cachedPages: 1,
      totalCachedItems: 250,
    });
  });

  it('reuses cached pages without calling the loader again', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) =>
      makeDogPage(page, pageSize)
    );

    const { result } = renderHook(() =>
      useInfiniteScroll(loadPage, {
        pageSize: 20,
        prefetch: false,
        enableCache: true,
      })
    );

    await waitFor(() => expect(result.current.currentPage).toBe(1));

    await act(async () => {
      await result.current.goToPage(1);
    });

    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(result.current.items[0]?.id).toBe('dog-1-0');
    expect(result.current.getCacheStats()).toEqual({
      cachedPages: 1,
      totalCachedItems: 20,
    });
  });

  it('prefetches the next page into cache without leaving visible loading stuck', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) =>
      makeDogPage(page, pageSize)
    );

    const { result } = renderHook(() =>
      useInfiniteScroll(loadPage, {
        pageSize: 10,
        prefetch: true,
        enableCache: true,
      })
    );

    await waitFor(() => expect(result.current.currentPage).toBe(1));
    expect(result.current.loading).toBe(false);

    await waitFor(() => expect(result.current.getCacheStats().cachedPages).toBe(2), {
      timeout: 1000,
    });

    expect(loadPage).toHaveBeenCalledWith(2, 10);
    expect(result.current.currentPage).toBe(1);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(result.current.currentPage).toBe(2);
    expect(result.current.items).toHaveLength(20);
  });

  it('bounds cached registration pages by evicting the oldest page first', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) =>
      makeDogPage(page, pageSize)
    );

    const { result } = renderHook(() =>
      useInfiniteScroll(loadPage, {
        pageSize: 5,
        prefetch: false,
        enableCache: true,
        maxCachedPages: 2,
      })
    );

    await waitFor(() => expect(result.current.currentPage).toBe(1));

    await act(async () => {
      await result.current.goToPage(2);
    });
    await act(async () => {
      await result.current.goToPage(3);
    });

    expect(result.current.getCacheStats()).toEqual({
      cachedPages: 2,
      totalCachedItems: 10,
    });

    await act(async () => {
      await result.current.goToPage(1);
    });

    expect(loadPage).toHaveBeenCalledTimes(4);
    expect(loadPage).toHaveBeenLastCalledWith(1, 5);
  });

  it('resets cached pages and recovers on the next deterministic load', async () => {
    const loadPage = vi.fn(async (page: number, pageSize: number) =>
      makeDogPage(page, pageSize)
    );

    const { result } = renderHook(() =>
      useInfiniteScroll(loadPage, {
        pageSize: 8,
        prefetch: false,
        enableCache: true,
      })
    );

    await waitFor(() => expect(result.current.currentPage).toBe(1));

    act(() => {
      result.current.reset();
    });

    expect(result.current.currentPage).toBe(0);
    expect(result.current.items).toHaveLength(0);
    expect(result.current.getCacheStats()).toEqual({
      cachedPages: 0,
      totalCachedItems: 0,
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(result.current.currentPage).toBe(1);
    expect(result.current.items).toHaveLength(8);
  });
});

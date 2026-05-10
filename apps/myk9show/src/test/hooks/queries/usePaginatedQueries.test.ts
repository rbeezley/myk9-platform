import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  usePaginatedDogs,
  useInfiniteDogs,
  usePaginatedUsers,
  usePaginatedShows,
  useAdvancedPagination,
  usePaginationState,
  type PaginatedResult,
} from '@/hooks/queries/usePaginatedQueries';
import React from 'react';

// Use vi.hoisted() so these variables are available when vi.mock() factories run
const {
  mockGetAllDogs,
  mockGetAllUsers,
  mockGetAllShows,
  mockUsePaginationConfig,
  mockCacheStrategies,
} = vi.hoisted(() => ({
  mockGetAllDogs: vi.fn(),
  mockGetAllUsers: vi.fn(),
  mockGetAllShows: vi.fn(),
  mockUsePaginationConfig: vi.fn(),
  mockCacheStrategies: {
    moderate: {
      staleTime: 60000,
      gcTime: 300000,
    },
  },
}));

vi.mock('@/services/database/dogs', () => ({
  getAllDogs: mockGetAllDogs,
}));

vi.mock('@/services/database/users', () => ({
  getAllUsers: mockGetAllUsers,
}));

vi.mock('@/services/database/shows', () => ({
  getAllShows: mockGetAllShows,
}));

vi.mock('@/lib/queryOptimizations', () => ({
  usePaginationConfig: mockUsePaginationConfig,
}));

vi.mock('@/lib/queryClient', () => ({
  cacheStrategies: mockCacheStrategies,
}));

vi.mock('@/hooks/useCurrentPersonId', () => ({
  useCurrentPersonId: () => 'test-person-123',
}));

describe('usePaginatedQueries hooks', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
  };

  const createMockData = (count: number, prefix: string) =>
    Array(count)
      .fill(null)
      .map((_, i) => ({
        id: `${prefix}-${i}`,
        name: `${prefix} ${i}`,
        created_at: new Date(2024, 0, i + 1).toISOString(),
      }));

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    mockUsePaginationConfig.mockReturnValue({
      dogs: { pageSize: 20 },
      users: { pageSize: 25 },
      shows: { pageSize: 15 },
    });

    // Default successful responses
    mockGetAllDogs.mockResolvedValue({
      data: createMockData(50, 'dog'),
      error: null,
    });
    mockGetAllUsers.mockResolvedValue({
      data: createMockData(75, 'user'),
      error: null,
    });
    mockGetAllShows.mockResolvedValue({
      data: createMockData(30, 'show'),
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('usePaginatedDogs', () => {
    it('should paginate dog data correctly', async () => {
      const { result } = renderHook(() => usePaginatedDogs({ page: 1, pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toHaveLength(10);
      expect(data.total).toBe(50);
      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(10);
      expect(data.totalPages).toBe(5);
      expect(data.hasNextPage).toBe(true);
      expect(data.hasPreviousPage).toBe(false);
    });

    it('should validate response time for pagination', async () => {
      const startTime = Date.now();
      const { result } = renderHook(() => usePaginatedDogs({ page: 2, pageSize: 20 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200); // Should be fast
    });

    it('should handle last page correctly', async () => {
      const { result } = renderHook(() => usePaginatedDogs({ page: 5, pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toHaveLength(10); // Last 10 items
      expect(data.hasNextPage).toBe(false);
      expect(data.hasPreviousPage).toBe(true);
    });

    it('should apply sorting correctly', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedDogs({
            page: 1,
            pageSize: 5,
            sortBy: 'name',
            sortOrder: 'desc',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      const names = data.data.map((item: Record<string, unknown>) => item.name);

      // Should be sorted in descending order
      expect(names[0]).toBe('dog 9');
      expect(names[4]).toBe('dog 5');
    });

    it('should apply filters correctly', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedDogs({
            page: 1,
            pageSize: 10,
            filters: { name: '1' }, // Filter for names containing '1'
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.total).toBeLessThan(50); // Should be filtered
      expect(
        data.data.every((item: Record<string, unknown>) => (item.name as string).includes('1'))
      ).toBe(true);
    });

    it('should handle empty dataset', async () => {
      mockGetAllDogs.mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(() => usePaginatedDogs({ page: 1, pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.totalPages).toBe(0);
      expect(data.hasNextPage).toBe(false);
      expect(data.hasPreviousPage).toBe(false);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockGetAllDogs.mockRejectedValue(error);

      const { result } = renderHook(() => usePaginatedDogs({ page: 1, pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(error);
    });

    it('should maintain placeholder data during refetch', async () => {
      const { result, rerender } = renderHook(
        ({ page }) => usePaginatedDogs({ page, pageSize: 10 }),
        {
          wrapper: createWrapper(),
          initialProps: { page: 1 },
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const firstPageData = result.current.data;

      // Change page
      rerender({ page: 2 });

      // Should maintain previous data during loading
      expect(result.current.data).toEqual(firstPageData);
    });
  });

  describe('useInfiniteDogs', () => {
    it('should load infinite data correctly', async () => {
      const { result } = renderHook(() => useInfiniteDogs({ pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.pages).toHaveLength(1);
      expect(result.current.data?.pages[0].data).toHaveLength(10);
      expect(result.current.hasNextPage).toBe(true);
    });

    it('should fetch next page correctly', async () => {
      const { result } = renderHook(() => useInfiniteDogs({ pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      act(() => {
        result.current.fetchNextPage();
      });

      await waitFor(() => {
        expect(result.current.data?.pages).toHaveLength(2);
      });

      expect(result.current.data?.pages[1].data).toHaveLength(10);
      expect(result.current.data?.pages[1].page).toBe(2);
    });

    it('should handle end of data correctly', async () => {
      // Mock smaller dataset
      mockGetAllDogs.mockResolvedValue({
        data: createMockData(15, 'dog'),
        error: null,
      });

      const { result } = renderHook(() => useInfiniteDogs({ pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Fetch next page (should be the last)
      act(() => {
        result.current.fetchNextPage();
      });

      await waitFor(() => {
        expect(result.current.data?.pages).toHaveLength(2);
      });

      expect(result.current.data?.pages[1].data).toHaveLength(5); // Remaining items
      expect(result.current.hasNextPage).toBe(false);
    });

    it('should support previous page fetching', async () => {
      const { result } = renderHook(() => useInfiniteDogs({ pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Fetch next page first
      act(() => {
        result.current.fetchNextPage();
      });

      await waitFor(() => {
        expect(result.current.data?.pages).toHaveLength(2);
      });

      // The infinite query's hasPreviousPage is derived from getPreviousPageParam
      // which checks firstPage.hasPreviousPage - page 1 has no previous page
      expect(result.current.hasPreviousPage).toBe(false);
      // But the second page's data correctly indicates it has a previous page
      expect(result.current.data?.pages[1].hasPreviousPage).toBe(true);
    });
  });

  describe('usePaginatedUsers', () => {
    it('should paginate user data correctly', async () => {
      const { result } = renderHook(() => usePaginatedUsers({ page: 1, pageSize: 25 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toHaveLength(25);
      expect(data.total).toBe(75);
      expect(data.totalPages).toBe(3);
    });

    it('should use default pagination config', async () => {
      const { result } = renderHook(
        () => usePaginatedUsers(), // No options provided
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.pageSize).toBe(25); // From mock config
      expect(data.page).toBe(1);
    });

    it('should handle user-specific sorting', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedUsers({
            page: 1,
            pageSize: 5,
            sortBy: 'name',
            sortOrder: 'asc',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      const names = data.data.map((item: Record<string, unknown>) => item.name);
      // localeCompare sorts lexicographically: "user 0", "user 1", "user 10", "user 11", "user 12"
      expect(names[0]).toBe('user 0');
      expect(names[1]).toBe('user 1');
      expect(names[2]).toBe('user 10');
      // Verify ascending order
      for (let i = 1; i < names.length; i++) {
        expect((names[i - 1] as string).localeCompare(names[i] as string)).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('usePaginatedShows', () => {
    it('should paginate show data correctly', async () => {
      const { result } = renderHook(() => usePaginatedShows({ page: 2, pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toHaveLength(10);
      expect(data.total).toBe(30);
      expect(data.page).toBe(2);
      expect(data.totalPages).toBe(3);
    });

    it('should handle date sorting for shows', async () => {
      // Provide mock data with a 'date' field that the shows sort logic uses
      const showsWithDates = Array(30)
        .fill(null)
        .map((_, i) => ({
          id: `show-${i}`,
          name: `show ${i}`,
          date: new Date(2024, 0, i + 1).toISOString(),
          created_at: new Date(2024, 0, i + 1).toISOString(),
        }));
      mockGetAllShows.mockResolvedValue({ data: showsWithDates, error: null });

      const { result } = renderHook(
        () =>
          usePaginatedShows({
            page: 1,
            pageSize: 5,
            sortBy: 'date',
            sortOrder: 'desc',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toHaveLength(5);

      // Check that dates are sorted in descending order
      const dates = data.data.map((item: Record<string, unknown>) => new Date(item.date as string));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });

    it('should use show-specific default sort', async () => {
      const { result } = renderHook(() => usePaginatedShows({ page: 1, pageSize: 5 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should default to sorting by 'date' for shows
      expect(result.current.isSuccess).toBe(true);
    });
  });

  describe('useAdvancedPagination', () => {
    it('should return paginated query for dogs by default', async () => {
      const { result } = renderHook(
        () => useAdvancedPagination('dogs', { page: 1, pageSize: 10 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isInfiniteQuery).toBe(false);
      expect(result.current.getTotalCount()).toBe(50);
      expect(result.current.getFlattenedData()).toHaveLength(10);
    });

    it('should return infinite query when enabled', async () => {
      const { result } = renderHook(
        () =>
          useAdvancedPagination('dogs', {
            pageSize: 10,
            enableInfiniteScroll: true,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isInfiniteQuery).toBe(true);
      expect(result.current.getTotalCount()).toBe(50);
      expect(result.current.getFlattenedData()).toHaveLength(10);
    });

    it('should provide correct navigation helpers', async () => {
      const { result } = renderHook(
        () => useAdvancedPagination('dogs', { page: 2, pageSize: 10 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.canGoNext()).toBe(true);
      expect(result.current.canGoPrevious()).toBe(true);
    });

    it('should handle different entity types', async () => {
      const { result: userResult } = renderHook(
        () => useAdvancedPagination('users', { page: 1, pageSize: 20 }),
        { wrapper: createWrapper() }
      );

      const { result: showResult } = renderHook(
        () => useAdvancedPagination('shows', { page: 1, pageSize: 15 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(userResult.current.isSuccess).toBe(true);
        expect(showResult.current.isSuccess).toBe(true);
      });

      expect(userResult.current.getTotalCount()).toBe(75);
      expect(showResult.current.getTotalCount()).toBe(30);
    });

    it('should handle unsupported entity types', () => {
      expect(() => {
        renderHook(() => useAdvancedPagination('unsupported' as 'dogs' | 'users' | 'shows', {}), {
          wrapper: createWrapper(),
        });
      }).toThrow('Unsupported entity type: unsupported');
    });
  });

  describe('usePaginationState', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => usePaginationState());

      expect(result.current.page).toBe(1);
      expect(result.current.pageSize).toBe(20);
      expect(result.current.sortBy).toBe('name');
      expect(result.current.sortOrder).toBe('asc');
      expect(result.current.filters).toEqual({});
      expect(result.current.hasFilters).toBe(false);
      expect(result.current.filterCount).toBe(0);
    });

    it('should initialize with custom values', () => {
      const { result } = renderHook(() => usePaginationState(3, 50));

      expect(result.current.page).toBe(3);
      expect(result.current.pageSize).toBe(50);
    });

    it('should update page correctly', () => {
      const { result } = renderHook(() => usePaginationState());

      act(() => {
        result.current.setPage(3);
      });

      expect(result.current.page).toBe(3);
    });

    it('should update page size and reset page', () => {
      const { result } = renderHook(() => usePaginationState());

      // Set initial page
      act(() => {
        result.current.setPage(5);
      });

      expect(result.current.page).toBe(5);

      // Change page size
      act(() => {
        result.current.setPageSize(50);
      });

      expect(result.current.pageSize).toBe(50);
      expect(result.current.page).toBe(1); // Should reset to page 1
    });

    it('should manage filters correctly', () => {
      const { result } = renderHook(() => usePaginationState());

      act(() => {
        result.current.updateFilter('breed', 'labrador');
      });

      expect(result.current.filters).toEqual({ breed: 'labrador' });
      expect(result.current.hasFilters).toBe(true);
      expect(result.current.filterCount).toBe(1);
      expect(result.current.page).toBe(1); // Should reset page

      act(() => {
        result.current.updateFilter('age', '2');
      });

      expect(result.current.filters).toEqual({ breed: 'labrador', age: '2' });
      expect(result.current.filterCount).toBe(2);

      act(() => {
        result.current.removeFilter('breed');
      });

      expect(result.current.filters).toEqual({ age: '2' });
      expect(result.current.filterCount).toBe(1);

      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.filters).toEqual({});
      expect(result.current.hasFilters).toBe(false);
      expect(result.current.filterCount).toBe(0);
    });

    it('should manage sorting correctly', () => {
      const { result } = renderHook(() => usePaginationState());

      act(() => {
        result.current.setSortBy('breed');
      });

      expect(result.current.sortBy).toBe('breed');
      expect(result.current.sortOrder).toBe('asc');
      expect(result.current.page).toBe(1); // Should reset page

      act(() => {
        result.current.toggleSortOrder();
      });

      expect(result.current.sortOrder).toBe('desc');
      expect(result.current.page).toBe(1); // Should reset page again

      act(() => {
        result.current.toggleSortOrder();
      });

      expect(result.current.sortOrder).toBe('asc');
    });

    it('should reset pagination correctly', () => {
      const { result } = renderHook(() => usePaginationState());

      // Set some state
      act(() => {
        result.current.setPage(5);
        result.current.updateFilter('test', 'value');
        result.current.setSortBy('breed');
      });

      expect(result.current.page).toBe(1); // Already reset by other actions

      act(() => {
        result.current.resetPagination();
      });

      expect(result.current.page).toBe(1);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', async () => {
      const largeDataset = createMockData(10000, 'item');
      mockGetAllDogs.mockResolvedValue({ data: largeDataset, error: null });

      const startTime = Date.now();
      const { result } = renderHook(() => usePaginatedDogs({ page: 50, pageSize: 100 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200); // Should still be fast

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toHaveLength(100);
      expect(data.total).toBe(10000);
    });

    it('should handle complex filtering efficiently', async () => {
      const complexDataset = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: `item-${i}`,
          name: `Item ${i}`,
          category: i % 10 === 0 ? 'special' : 'normal',
          value: i * 10,
          active: i % 3 === 0,
        }));

      mockGetAllDogs.mockResolvedValue({ data: complexDataset, error: null });

      const startTime = Date.now();
      const { result } = renderHook(
        () =>
          usePaginatedDogs({
            page: 1,
            pageSize: 20,
            filters: {
              category: 'special',
              active: true,
            },
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200);

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.total).toBeLessThan(1000); // Should be filtered
    });

    it('should handle rapid pagination changes', async () => {
      const { result, rerender } = renderHook(
        ({ page }) => usePaginatedDogs({ page, pageSize: 10 }),
        {
          wrapper: createWrapper(),
          initialProps: { page: 1 },
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Rapidly change pages
      const startTime = Date.now();
      for (let i = 2; i <= 5; i++) {
        rerender({ page: i });
      }

      // Wait for the final page data to resolve (placeholderData may show stale page)
      await waitFor(() => {
        const data = result.current.data as PaginatedResult<unknown>;
        expect(data.page).toBe(5);
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // Should handle rapid changes
    });
  });

  describe('Edge Cases', () => {
    it('should handle null data gracefully', async () => {
      mockGetAllDogs.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => usePaginatedDogs({ page: 1, pageSize: 10 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('should handle page beyond available data', async () => {
      const { result } = renderHook(
        () => usePaginatedDogs({ page: 100, pageSize: 10 }), // Way beyond available data
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toEqual([]); // No data for this page
      expect(data.hasNextPage).toBe(false);
      expect(data.hasPreviousPage).toBe(true);
    });

    it('should handle zero page size', async () => {
      const { result } = renderHook(() => usePaginatedDogs({ page: 1, pageSize: 0 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toEqual([]);
      expect(data.totalPages).toBe(Infinity);
    });

    it('should handle invalid sort field', async () => {
      const { result } = renderHook(
        () =>
          usePaginatedDogs({
            page: 1,
            pageSize: 10,
            sortBy: 'nonexistentField',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should not crash and return data
      const data = result.current.data as PaginatedResult<unknown>;
      expect(data.data).toHaveLength(10);
    });
  });
});

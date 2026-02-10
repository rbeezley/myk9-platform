import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useOptimizedDogSearch,
  useOptimizedUserSearch,
  useOptimizedShowSearch,
  useGlobalSearch,
  useSearchSuggestions,
  SEARCH_CONFIG
} from '@/hooks/queries/useOptimizedSearch';
import React from 'react';

// Declare mock functions via vi.hoisted so they are available in vi.mock factories
const {
  mockSearchDogs,
  mockSearchUsers,
  mockSearchShows,
  mockSearchClubs,
  mockUseDebounce,
  mockUseSearchDeduplication,
  mockUsePaginationConfig,
} = vi.hoisted(() => ({
  mockSearchDogs: vi.fn(),
  mockSearchUsers: vi.fn(),
  mockSearchShows: vi.fn(),
  mockSearchClubs: vi.fn(),
  mockUseDebounce: vi.fn(),
  mockUseSearchDeduplication: vi.fn(),
  mockUsePaginationConfig: vi.fn(),
}));

// Mock the search functions
vi.mock('@/services/database/queries', () => ({
  searchDogs: mockSearchDogs,
  searchUsers: mockSearchUsers,
  searchShows: mockSearchShows,
  searchClubs: mockSearchClubs,
}));

// Mock the optimization utilities
vi.mock('@/lib/queryOptimizations', () => ({
  useDebounce: mockUseDebounce,
  useSearchDeduplication: mockUseSearchDeduplication,
  usePaginationConfig: mockUsePaginationConfig,
}));

// Mock query client and cache strategies
vi.mock('@/lib/queryClient', () => ({
  queryKeys: {
    dogs: ['dogs'],
    users: { all: ['users'] },
    shows: ['shows']
  },
  cacheStrategies: {
    dynamic: {
      staleTime: 30000,
      gcTime: 300000
    }
  }
}));

describe('useOptimizedSearch hooks', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns - useDebounce passes through immediately (no delay)
    mockUseDebounce.mockImplementation((fn: (...args: unknown[]) => void) => fn);
    mockUseSearchDeduplication.mockReturnValue(() => true);
    mockUsePaginationConfig.mockReturnValue({
      search: { pageSize: 20 },
      dogs: { pageSize: 25 },
      users: { pageSize: 30 },
      shows: { pageSize: 15 }
    });

    // Default successful responses
    mockSearchDogs.mockResolvedValue({
      data: [{ id: '1', name: 'Test Dog', breed: 'Labrador' }],
      error: null
    });
    mockSearchUsers.mockResolvedValue({
      data: [{ id: '1', first_name: 'John', last_name: 'Doe' }],
      error: null
    });
    mockSearchShows.mockResolvedValue({
      data: [{ id: '1', name: 'Test Show', location: 'Test Location' }],
      error: null
    });
    mockSearchClubs.mockResolvedValue({
      data: [{ id: '1', name: 'Test Club' }],
      error: null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useOptimizedDogSearch', () => {
    it('should search dogs with debouncing', async () => {
      const { result } = renderHook(
        () => useOptimizedDogSearch('labrador'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockSearchDogs).toHaveBeenCalledWith('labrador');
      expect(result.current.data).toEqual({
        data: [{ id: '1', name: 'Test Dog', breed: 'Labrador' }],
        total: 1,
        hasMore: false,
        page: 1,
        pageSize: 25
      });
    });

    it('should not search when term is too short', () => {
      const { result } = renderHook(
        () => useOptimizedDogSearch('a'), // Only 1 character
        { wrapper: createWrapper() }
      );

      // React Query v5: disabled queries have fetchStatus 'idle' and status 'pending'
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockSearchDogs).not.toHaveBeenCalled();
    });

    it('should handle search errors gracefully', async () => {
      const searchError = new Error('Search failed');
      mockSearchDogs.mockRejectedValue(searchError);

      const { result } = renderHook(
        () => useOptimizedDogSearch('test'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(searchError);
    });

    it('should validate response time performance', async () => {
      let resolveTime = 0;
      mockSearchDogs.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolveTime = Date.now();
            resolve({
              data: [{ id: '1', name: 'Fast Dog' }],
              error: null
            });
          }, 50);
        })
      );

      const startTime = Date.now();
      const { result } = renderHook(
        () => useOptimizedDogSearch('fast'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const duration = resolveTime - startTime;
      expect(duration).toBeLessThan(200); // Should complete quickly
    });

    it('should support pagination options', async () => {
      const { result } = renderHook(
        () => useOptimizedDogSearch('test', { page: 2, pageSize: 10 }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.page).toBe(2);
      expect(result.current.data?.pageSize).toBe(10);
    });

    it('should handle empty search results', async () => {
      mockSearchDogs.mockResolvedValue({ data: [], error: null });

      const { result } = renderHook(
        () => useOptimizedDogSearch('nonexistent'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data).toEqual([]);
      expect(result.current.data?.total).toBe(0);
    });

    it('should respect enabled option', () => {
      const { result } = renderHook(
        () => useOptimizedDogSearch('test', { enabled: false }),
        { wrapper: createWrapper() }
      );

      // React Query v5: disabled queries have fetchStatus 'idle'
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockSearchDogs).not.toHaveBeenCalled();
    });
  });

  describe('useOptimizedUserSearch', () => {
    it('should search users with debouncing', async () => {
      const { result } = renderHook(
        () => useOptimizedUserSearch('john'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockSearchUsers).toHaveBeenCalledWith('john');
      expect(result.current.data?.data).toHaveLength(1);
    });

    it('should include role filtering option', async () => {
      const { result } = renderHook(
        () => useOptimizedUserSearch('admin', { role: 'administrator' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Role should be included in query key for caching
      expect(result.current.data).toBeDefined();
    });

    it('should handle user search errors', async () => {
      mockSearchUsers.mockRejectedValue(new Error('User search failed'));

      const { result } = renderHook(
        () => useOptimizedUserSearch('test'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useOptimizedShowSearch', () => {
    it('should search shows with debouncing', async () => {
      const { result } = renderHook(
        () => useOptimizedShowSearch('championship'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockSearchShows).toHaveBeenCalledWith('championship');
      expect(result.current.data?.data).toHaveLength(1);
    });

    it('should support date range filtering', async () => {
      const dateRange = { start: '2024-01-01', end: '2024-12-31' };

      const { result } = renderHook(
        () => useOptimizedShowSearch('show', { dateRange }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Date range should be included in query key
      expect(result.current.data).toBeDefined();
    });

    it('should support status filtering', async () => {
      const { result } = renderHook(
        () => useOptimizedShowSearch('open', { status: 'accepting_entries' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeDefined();
    });
  });

  describe('useGlobalSearch', () => {
    it('should search across all entities', async () => {
      const { result } = renderHook(
        () => useGlobalSearch('test'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockSearchDogs).toHaveBeenCalledWith('test');
      expect(mockSearchUsers).toHaveBeenCalledWith('test');
      expect(mockSearchShows).toHaveBeenCalledWith('test');
      expect(mockSearchClubs).toHaveBeenCalledWith('test');

      expect(result.current.data).toEqual({
        dogs: [{ id: '1', name: 'Test Dog', breed: 'Labrador' }],
        users: [{ id: '1', first_name: 'John', last_name: 'Doe' }],
        shows: [{ id: '1', name: 'Test Show', location: 'Test Location' }],
        clubs: [{ id: '1', name: 'Test Club' }],
        total: 4,
        searchTerm: 'test'
      });
    });

    it('should handle partial entity failures gracefully', async () => {
      mockSearchDogs.mockRejectedValue(new Error('Dogs search failed'));
      // Other searches remain successful

      const { result } = renderHook(
        () => useGlobalSearch('test'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.dogs).toEqual([]);
      expect(result.current.data?.users).toHaveLength(1);
      expect(result.current.data?.shows).toHaveLength(1);
      expect(result.current.data?.clubs).toHaveLength(1);
      expect(result.current.data?.total).toBe(3); // Excluding failed dogs search
    });

    it('should support selective entity searching', async () => {
      const { result } = renderHook(
        () => useGlobalSearch('test', { entities: ['dogs', 'users'] }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockSearchDogs).toHaveBeenCalled();
      expect(mockSearchUsers).toHaveBeenCalled();
      expect(mockSearchShows).not.toHaveBeenCalled();
      expect(mockSearchClubs).not.toHaveBeenCalled();

      expect(result.current.data?.total).toBe(2);
    });

    it('should validate parallel search performance', async () => {
      // Mock searches with different delays
      mockSearchDogs.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ data: [], error: null }), 100))
      );
      mockSearchUsers.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ data: [], error: null }), 50))
      );
      mockSearchShows.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ data: [], error: null }), 75))
      );
      mockSearchClubs.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ data: [], error: null }), 25))
      );

      const startTime = Date.now();
      const { result } = renderHook(
        () => useGlobalSearch('performance'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const duration = Date.now() - startTime;
      // Should complete in parallel, not sequentially (total would be ~250ms if sequential)
      expect(duration).toBeLessThan(200);
    });

    it('should return empty results for short search terms', () => {
      const { result } = renderHook(
        () => useGlobalSearch('a'), // Too short
        { wrapper: createWrapper() }
      );

      // Query is disabled for short terms, so fetchStatus is 'idle'
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockSearchDogs).not.toHaveBeenCalled();
      expect(mockSearchUsers).not.toHaveBeenCalled();
      expect(mockSearchShows).not.toHaveBeenCalled();
      expect(mockSearchClubs).not.toHaveBeenCalled();
    });
  });

  describe('useSearchSuggestions', () => {
    it('should provide search suggestions from cached data', async () => {
      // Mock cached data
      const mockCachedData = [
        { id: '1', name: 'Golden Retriever Dog' },
        { id: '2', name: 'Golden Lab Mix' },
        { id: '3', name: 'Silver Retriever' }
      ];

      // Mock global queryClient
      (globalThis as Record<string, unknown>).queryClient = {
        getQueryData: vi.fn().mockReturnValue(mockCachedData)
      };

      const { result } = renderHook(
        () => useSearchSuggestions('golden', 'dogs'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([
        { id: '1', name: 'Golden Retriever Dog', type: 'dogs' },
        { id: '2', name: 'Golden Lab Mix', type: 'dogs' }
      ]);
    });

    it('should limit suggestions to 5 items', async () => {
      const mockCachedData = Array(10).fill(null).map((_, i) => ({
        id: `${i}`,
        name: `Test Item ${i}`
      }));

      (globalThis as Record<string, unknown>).queryClient = {
        getQueryData: vi.fn().mockReturnValue(mockCachedData)
      };

      const { result } = renderHook(
        () => useSearchSuggestions('test', 'dogs'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(5);
    });

    it('should return empty suggestions when no cached data', async () => {
      (globalThis as Record<string, unknown>).queryClient = {
        getQueryData: vi.fn().mockReturnValue(undefined)
      };

      const { result } = renderHook(
        () => useSearchSuggestions('test', 'users'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });

    it('should have faster debounce for suggestions', () => {
      renderHook(
        () => useSearchSuggestions('fast', 'shows'),
        { wrapper: createWrapper() }
      );

      // Check that debounce was called with 150ms (faster than regular search)
      expect(mockUseDebounce).toHaveBeenCalledWith(expect.any(Function), 150);
    });

    it('should work with single character search terms', async () => {
      const mockCachedData = [
        { id: '1', name: 'Apple' },
        { id: '2', name: 'Apricot' }
      ];

      (globalThis as Record<string, unknown>).queryClient = {
        getQueryData: vi.fn().mockReturnValue(mockCachedData)
      };

      const { result } = renderHook(
        () => useSearchSuggestions('a', 'dogs'), // Single character
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
    });
  });

  describe('SEARCH_CONFIG', () => {
    it('should export correct configuration values', () => {
      expect(SEARCH_CONFIG.minSearchLength).toBe(2);
      expect(SEARCH_CONFIG.debounceDelay).toBe(300);
      expect(SEARCH_CONFIG.maxResults).toBe(50);
      expect(SEARCH_CONFIG.deduplicationWindow).toBe(500);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle rapid search term changes', async () => {
      const { result, rerender } = renderHook(
        ({ searchTerm }) => useOptimizedDogSearch(searchTerm),
        {
          wrapper: createWrapper(),
          initialProps: { searchTerm: 'lab' }
        }
      );

      // Rapidly change search terms
      rerender({ searchTerm: 'labr' });
      rerender({ searchTerm: 'labra' });
      rerender({ searchTerm: 'labrad' });
      rerender({ searchTerm: 'labrador' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // The final search term should have been searched
      expect(mockSearchDogs).toHaveBeenCalledWith('labrador');
    });

    it('should handle search deduplication', () => {
      // Configure deduplication to reject all updates after initialization
      mockUseSearchDeduplication.mockReturnValue(() => false);

      const { rerender } = renderHook(
        ({ searchTerm }) => useOptimizedDogSearch(searchTerm),
        {
          wrapper: createWrapper(),
          initialProps: { searchTerm: 'initial' }
        }
      );

      // Change the search term - deduplication blocks the update
      rerender({ searchTerm: 'updated' });

      // The debounced search term stays at 'initial' (from initialization),
      // not 'updated' (which was blocked by deduplication), so the query
      // runs with the initial term
      expect(mockSearchDogs).toHaveBeenCalledWith('initial');
    });

    it('should maintain placeholder data during loading', async () => {
      const { result, rerender } = renderHook(
        ({ searchTerm }) => useOptimizedDogSearch(searchTerm),
        {
          wrapper: createWrapper(),
          initialProps: { searchTerm: 'previous' }
        }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const previousData = result.current.data;

      // Set up a slow response for the next search
      mockSearchDogs.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          data: [{ id: '2', name: 'New Dog' }],
          error: null
        }), 500))
      );

      // Change search term
      rerender({ searchTerm: 'newterm' });

      // Should show placeholder data (previous results) while loading new results
      expect(result.current.data).toEqual(previousData);
    });

    it('should handle disabled state correctly', () => {
      const { result } = renderHook(
        () => useOptimizedDogSearch('test', { enabled: false }),
        { wrapper: createWrapper() }
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockSearchDogs).not.toHaveBeenCalled();
    });

    it('should handle errors in global search gracefully', async () => {
      mockSearchDogs.mockRejectedValue(new Error('Network error'));
      mockSearchUsers.mockRejectedValue(new Error('Permission error'));
      // Shows and clubs remain successful

      const { result } = renderHook(
        () => useGlobalSearch('errortest'),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should still return results for successful searches
      expect(result.current.data?.dogs).toEqual([]);
      expect(result.current.data?.users).toEqual([]);
      expect(result.current.data?.shows).toHaveLength(1);
      expect(result.current.data?.clubs).toHaveLength(1);
      expect(result.current.data?.total).toBe(2);
    });
  });
});

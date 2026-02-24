import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import React from 'react';

// Simple test for basic React Query functionality
describe('React Query Integration Tests', () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Query Functionality', () => {
    it('should execute a simple query successfully', async () => {
      const mockData = { id: '1', name: 'Test Data' };
      const mockQueryFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useQuery({
          queryKey: ['test'],
          queryFn: mockQueryFn
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
      expect(mockQueryFn).toHaveBeenCalledTimes(1);
    });

    it('should handle query errors gracefully', async () => {
      const mockError = new Error('Query failed');
      const mockQueryFn = vi.fn().mockRejectedValue(mockError);

      const { result } = renderHook(
        () => useQuery({
          queryKey: ['test-error'],
          queryFn: mockQueryFn
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toBeUndefined();
    });

    it('should validate query performance', async () => {
      const mockData = { id: '1', name: 'Performance Test' };
      const mockQueryFn = vi.fn().mockImplementation(() => 
        new Promise((resolve) => {
          setTimeout(() => resolve(mockData), 50);
        })
      );

      const startTime = Date.now();
      const { result } = renderHook(
        () => useQuery({
          queryKey: ['performance'],
          queryFn: mockQueryFn
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200); // Should complete quickly
      expect(result.current.data).toEqual(mockData);
    });

    it('should handle disabled queries correctly', () => {
      const mockQueryFn = vi.fn();

      const { result } = renderHook(
        () => useQuery({
          queryKey: ['disabled'],
          queryFn: mockQueryFn,
          enabled: false
        }),
        { wrapper: createWrapper() }
      );

      // In React Query v5, isIdle was removed. Disabled queries have fetchStatus 'idle'
      expect(result.current.fetchStatus).toBe('idle');
      expect(result.current.isPending).toBe(true);
      expect(mockQueryFn).not.toHaveBeenCalled();
    });

    it('should cache query results correctly', async () => {
      const mockData = { id: '1', name: 'Cached Data' };
      const mockQueryFn = vi.fn().mockResolvedValue(mockData);

      // Share the same wrapper (and thus QueryClient) between both hooks.
      // Use staleTime to prevent background refetch when second subscriber mounts.
      const wrapper = createWrapper();

      // First query
      const { result: result1 } = renderHook(
        () => useQuery({
          queryKey: ['cache-test'],
          queryFn: mockQueryFn,
          staleTime: 60000 // Keep fresh for 60s to test caching
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true);
      });

      // Second query with same key should use cache from the shared QueryClient
      const { result: result2 } = renderHook(
        () => useQuery({
          queryKey: ['cache-test'],
          queryFn: mockQueryFn,
          staleTime: 60000
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true);
      });

      expect(result2.current.data).toEqual(mockData);
      expect(mockQueryFn).toHaveBeenCalledTimes(1); // Should only be called once due to caching
    });
  });

  describe('Advanced Query Features', () => {
    it('should handle query invalidation', async () => {
      const mockData1 = { id: '1', name: 'Original Data' };
      const mockData2 = { id: '1', name: 'Updated Data' };
      let callCount = 0;
      
      const mockQueryFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? mockData1 : mockData2);
      });

      const { result } = renderHook(
        () => useQuery({
          queryKey: ['invalidation-test'],
          queryFn: mockQueryFn
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData1);

      // Invalidate and refetch
      await queryClient.invalidateQueries({ queryKey: ['invalidation-test'] });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData2);
      });

      expect(mockQueryFn).toHaveBeenCalledTimes(2);
    });

    it('should handle stale time correctly', async () => {
      const mockData = { id: '1', name: 'Stale Data' };
      const mockQueryFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useQuery({
          queryKey: ['stale-test'],
          queryFn: mockQueryFn,
          staleTime: 1000 // 1 second
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.isStale).toBe(false);
      expect(mockQueryFn).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent queries efficiently', async () => {
      const mockData = { id: '1', name: 'Concurrent Data' };
      const mockQueryFn = vi.fn().mockResolvedValue(mockData);

      const createQuery = (key: string) => 
        renderHook(
          () => useQuery({
            queryKey: [key],
            queryFn: mockQueryFn
          }),
          { wrapper: createWrapper() }
        );

      const startTime = Date.now();
      const queries = [
        createQuery('concurrent-1'),
        createQuery('concurrent-2'),
        createQuery('concurrent-3')
      ];

      // Wait for all queries to complete
      await Promise.all(
        queries.map(({ result }) => 
          waitFor(() => expect(result.current.isSuccess).toBe(true))
        )
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(300); // Should complete in parallel

      queries.forEach(({ result }) => {
        expect(result.current.data).toEqual(mockData);
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      const mockQueryFn = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), 100);
        })
      );

      const { result } = renderHook(
        () => useQuery({
          queryKey: ['timeout'],
          queryFn: mockQueryFn
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network timeout');
    });

    it('should handle malformed data gracefully', async () => {
      const mockQueryFn = vi.fn().mockResolvedValue(null);

      const { result } = renderHook(
        () => useQuery({
          queryKey: ['malformed'],
          queryFn: mockQueryFn
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should handle query function exceptions', async () => {
      const mockQueryFn = vi.fn().mockImplementation(() => {
        throw new Error('Query function exception');
      });

      const { result } = renderHook(
        () => useQuery({
          queryKey: ['exception'],
          queryFn: mockQueryFn
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Query function exception');
    });
  });

  describe('Performance Validation', () => {
    it('should handle large datasets efficiently', async () => {
      const largeDataset = Array(1000).fill(null).map((_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`
      }));

      const mockQueryFn = vi.fn().mockImplementation(() => 
        new Promise((resolve) => {
          setTimeout(() => resolve(largeDataset), 100);
        })
      );

      const startTime = Date.now();
      const { result } = renderHook(
        () => useQuery({
          queryKey: ['large-dataset'],
          queryFn: mockQueryFn
        }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const duration = Date.now() - startTime;
      // Use 500ms threshold to account for CI/full-suite overhead
      expect(duration).toBeLessThan(500);
      expect(result.current.data).toHaveLength(1000);
    });

    it('should maintain consistent response times under load', async () => {
      const mockData = { id: '1', name: 'Load Test' };
      const mockQueryFn = vi.fn().mockResolvedValue(mockData);

      // Share a single wrapper/QueryClient for all queries
      const wrapper = createWrapper();

      const createLoadQuery = (index: number) =>
        renderHook(
          () => useQuery({
            queryKey: [`load-${index}`],
            queryFn: mockQueryFn
          }),
          { wrapper }
        );

      const startTime = Date.now();

      // Create multiple queries simultaneously
      const queries = Array(10).fill(null).map((_, i) => createLoadQuery(i));

      // Wait for all to complete
      await Promise.all(
        queries.map(({ result }) =>
          waitFor(() => expect(result.current.isSuccess).toBe(true))
        )
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // Should handle load efficiently

      queries.forEach(({ result }) => {
        expect(result.current.data).toEqual(mockData);
      });
    });
  });
});
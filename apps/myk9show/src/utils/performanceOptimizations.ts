/**
 * Performance Optimizations Utilities
 * 
 * Collection of performance optimizations to eliminate navigation delays
 */

import type { QueryClient } from '@tanstack/react-query';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';

/**
 * Optimize React Query cache for better navigation performance
 */
export function optimizeQueryCache(queryClient: QueryClient) {
  // Set default cache times for better performance
  queryClient.setDefaultOptions({
    queries: {
      // Keep data fresh for 5 minutes to avoid refetching on navigation
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Keep data in cache for 30 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (renamed from cacheTime)
      // Retry failed queries less aggressively
      retry: 1,
      // Disable background refetching for better perceived performance
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  });
}

/**
 * Prefetch critical show data on app initialization
 */
export async function prefetchCriticalData(queryClient: QueryClient): Promise<void> {
  try {
    // Prefetch shows list with high priority
    await queryClient.prefetchQuery({
      queryKey: showQueryKeys.lists(),
      queryFn: async () => {
        const { getAllShows } = await import('@/services/database/shows');
        const { mapDatabaseShowsArray } = await import('@/services/mappers/showMappers');
        const { data, error } = await getAllShows();
        if (error) throw error;
        return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
      },
      staleTime: 1000 * 60 * 10, // 10 minutes for critical data
    });
  } catch {
    // Prefetch failed silently - non-critical
  }
}

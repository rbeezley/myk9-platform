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
        const { getAllShows } = await import('@/services/database/queries/showQueries');
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

/**
 * Setup performance monitoring for React Query
 */
export function setupQueryPerformanceMonitoring(_queryClient: QueryClient): void {
  // Performance monitoring disabled - enable via dev tools if needed
}

/**
 * Smart cache invalidation to prevent unnecessary refetches
 */
export function smartCacheInvalidation(queryClient: QueryClient) {
  // Instead of invalidating all queries, be more selective
  const invalidateShowsData = () => {
    // Only invalidate if data is older than 10 minutes
    // const _showsData = queryClient.getQueryData(showQueryKeys.lists());
    const queryState = queryClient.getQueryState(showQueryKeys.lists());
    
    if (queryState && Date.now() - queryState.dataUpdatedAt > 1000 * 60 * 10) {
      queryClient.invalidateQueries({ queryKey: showQueryKeys.lists() });
    }
  };
  
  return { invalidateShowsData };
}

/**
 * Preload data for likely navigation targets
 */
export function preloadNavigationTargets(queryClient: QueryClient, currentRoute: string) {
  if (currentRoute === '/browse-shows') {
    // User is likely to navigate to show details, prefetch popular shows
    const showsList = queryClient.getQueryData(showQueryKeys.lists()) as unknown[];
    
    if (showsList && showsList.length > 0) {
      // Prefetch first 3 shows for instant navigation
      (showsList as Array<{id: string}>).slice(0, 3).forEach((show: { id: string }) => {
        queryClient.prefetchQuery({
          queryKey: showQueryKeys.detail(show.id),
          queryFn: async () => show, // Use existing data
          staleTime: 1000 * 60 * 5,
        });
      });
    }
  }
}
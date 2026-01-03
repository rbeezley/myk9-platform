/**
 * useOfflineRoute Hook
 *
 * Provides offline routing capabilities to components:
 * - Automatically cache route data when it loads
 * - Restore cached data when offline
 * - Prefetch likely next routes
 *
 * Usage:
 * const { markVisited, getCached, prefetchNext } = useOfflineRoute();
 *
 * // When data loads successfully:
 * useEffect(() => {
 *   if (data) {
 *     markVisited(data);
 *   }
 * }, [data]);
 *
 * // On mount, try to restore cached data:
 * useEffect(() => {
 *   if (!navigator.onLine) {
 *     getCached().then(cached => {
 *       if (cached) setData(cached);
 *     });
 *   }
 * }, []);
 */

import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  markRouteVisited,
  getCachedRoute,
  prefetchLikelyRoutes,
  isRouteVisited,
  type CachedRoute,
} from '@/utils/offlineRouter';

export interface UseOfflineRouteOptions {
  /**
   * Auto-prefetch likely next routes
   * Default: true
   */
  autoPrefetch?: boolean;

  /**
   * Data fetchers for predicted routes
   * Map of route path -> data fetcher function
   */
  dataFetchers?: { [path: string]: () => Promise<unknown> };
}

export function useOfflineRoute(options: UseOfflineRouteOptions = {}) {
  const { autoPrefetch = true, dataFetchers = {} } = options;
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * Mark current route as visited with data
   */
  const markVisited = useCallback(
    async (data?: unknown) => {
      await markRouteVisited(location.pathname, data);
    },
    [location.pathname]
  );

  /**
   * Get cached data for current route
   */
  const getCached = useCallback(async (): Promise<CachedRoute | null> => {
    return await getCachedRoute(location.pathname);
  }, [location.pathname]);

  /**
   * Check if current route is visited
   */
  const isVisited = useCallback((): boolean => {
    return isRouteVisited(location.pathname);
  }, [location.pathname]);

  /**
   * Prefetch next likely routes
   */
  const prefetchNext = useCallback(async () => {
    await prefetchLikelyRoutes(location.pathname, dataFetchers);
  }, [location.pathname, dataFetchers]);

  /**
   * Navigate with offline fallback
   */
  const navigateOffline = useCallback(
    (to: string) => {
      // If offline and route not visited, warn user
      if (!navigator.onLine && !isRouteVisited(to)) {
        const confirmed = confirm(
          'You are offline and this page has not been visited before. It may not work properly. Continue?'
        );
        if (!confirmed) return;
      }

      navigate(to);
    },
    [navigate]
  );

  // Auto-prefetch on mount if enabled
  useEffect(() => {
    if (autoPrefetch && navigator.onLine) {
      prefetchNext();
    }
  }, [autoPrefetch, prefetchNext]);

  return {
    markVisited,
    getCached,
    isVisited,
    prefetchNext,
    navigateOffline,
    currentPath: location.pathname,
  };
}

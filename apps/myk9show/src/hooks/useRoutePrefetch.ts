import React, { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface PrefetchOptions {
  staleTime?: number;
  cacheTime?: number;
  priority?: 'high' | 'low';
  delay?: number;
}

interface RoutePrefetchConfig {
  queryKey: string[];
  queryFn: () => Promise<unknown>;
  options?: PrefetchOptions;
}

/**
 * Hook for prefetching route data on hover or focus
 */
export const useRoutePrefetch = () => {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout>();
  const prefetchedRoutes = useRef(new Set<string>());

  const prefetchRoute = useCallback(async (
    routePath: string,
    configs: RoutePrefetchConfig[]
  ) => {
    // Avoid duplicate prefetches
    if (prefetchedRoutes.current.has(routePath)) {
      return;
    }

    prefetchedRoutes.current.add(routePath);

    try {
      // Prefetch all queries for this route
      await Promise.all(
        configs.map(({ queryKey, queryFn, options = {} }) =>
          queryClient.prefetchQuery({
            queryKey,
            queryFn,
            staleTime: options.staleTime ?? 5 * 60 * 1000, // 5 minutes default
            gcTime: options.cacheTime ?? 10 * 60 * 1000, // 10 minutes default
          })
        )
      );
    } catch (error) {
      console.warn(`Failed to prefetch route ${routePath}:`, error);
      // Remove from prefetched set so it can be retried
      prefetchedRoutes.current.delete(routePath);
    }
  }, [queryClient]);

  const prefetchWithDelay = useCallback((
    routePath: string,
    configs: RoutePrefetchConfig[],
    delay: number = 100
  ) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      prefetchRoute(routePath, configs);
    }, delay);
  }, [prefetchRoute]);

  const cancelPrefetch = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    prefetchRoute,
    prefetchWithDelay,
    cancelPrefetch,
    isPrefetched: useCallback((routePath: string) => 
      prefetchedRoutes.current.has(routePath), [])
  };
};

/**
 * Hook for creating prefetch event handlers
 */
export const usePrefetchHandlers = (
  routePath: string,
  configs: RoutePrefetchConfig[],
  options: PrefetchOptions = {}
) => {
  const { prefetchWithDelay, cancelPrefetch } = useRoutePrefetch();
  const { delay = 100 } = options;

  const onMouseEnter = useCallback(() => {
    prefetchWithDelay(routePath, configs, delay);
  }, [routePath, configs, delay, prefetchWithDelay]);

  const onMouseLeave = useCallback(() => {
    cancelPrefetch();
  }, [cancelPrefetch]);

  const onFocus = useCallback(() => {
    prefetchWithDelay(routePath, configs, delay);
  }, [routePath, configs, delay, prefetchWithDelay]);

  return {
    onMouseEnter,
    onMouseLeave,
    onFocus,
  };
};

/**
 * Route configurations for common application routes
 */
export const ROUTE_PREFETCH_CONFIGS = {
  dogDetails: (dogId: string): RoutePrefetchConfig[] => [
    {
      queryKey: ['dog', dogId],
      queryFn: () => fetch(`/api/dogs/${dogId}`).then(res => res.json()),
    },
    {
      queryKey: ['dog', dogId, 'health-records'],
      queryFn: () => fetch(`/api/dogs/${dogId}/health-records`).then(res => res.json()),
    },
    {
      queryKey: ['dog', dogId, 'registrations'],
      queryFn: () => fetch(`/api/dogs/${dogId}/registrations`).then(res => res.json()),
    },
  ],

  personDetails: (personId: string): RoutePrefetchConfig[] => [
    {
      queryKey: ['person', personId],
      queryFn: () => fetch(`/api/people/${personId}`).then(res => res.json()),
    },
    {
      queryKey: ['person', personId, 'dogs'],
      queryFn: () => fetch(`/api/people/${personId}/dogs`).then(res => res.json()),
    },
  ],

  showDetails: (showId: string): RoutePrefetchConfig[] => [
    {
      queryKey: ['show', showId],
      queryFn: () => fetch(`/api/shows/${showId}`).then(res => res.json()),
    },
    {
      queryKey: ['show', showId, 'classes'],
      queryFn: () => fetch(`/api/shows/${showId}/classes`).then(res => res.json()),
    },
    {
      queryKey: ['show', showId, 'entries'],
      queryFn: () => fetch(`/api/shows/${showId}/entries`).then(res => res.json()),
    },
  ],

  showList: (): RoutePrefetchConfig[] => [
    {
      queryKey: ['shows'],
      queryFn: () => fetch('/api/shows').then(res => res.json()),
    },
  ],

  dogList: (): RoutePrefetchConfig[] => [
    {
      queryKey: ['dogs'],
      queryFn: () => fetch('/api/dogs').then(res => res.json()),
    },
  ],

  peopleList: (): RoutePrefetchConfig[] => [
    {
      queryKey: ['people'],
      queryFn: () => fetch('/api/people').then(res => res.json()),
    },
  ],

  adminDashboard: (): RoutePrefetchConfig[] => [
    {
      queryKey: ['admin', 'stats'],
      queryFn: () => fetch('/api/admin/stats').then(res => res.json()),
    },
    {
      queryKey: ['admin', 'recent-activity'],
      queryFn: () => fetch('/api/admin/recent-activity').then(res => res.json()),
    },
  ],

  judgeDashboard: (): RoutePrefetchConfig[] => [
    {
      queryKey: ['judge', 'assignments'],
      queryFn: () => fetch('/api/judge/assignments').then(res => res.json()),
    },
    {
      queryKey: ['judge', 'schedule'],
      queryFn: () => fetch('/api/judge/schedule').then(res => res.json()),
    },
  ],

  secretaryDashboard: (): RoutePrefetchConfig[] => [
    {
      queryKey: ['secretary', 'shows'],
      queryFn: () => fetch('/api/secretary/shows').then(res => res.json()),
    },
    {
      queryKey: ['secretary', 'pending-entries'],
      queryFn: () => fetch('/api/secretary/pending-entries').then(res => res.json()),
    },
  ],
};

/**
 * Component wrapper that adds prefetch capabilities
 * Note: This function should be used in .tsx files, not .ts files
 */
export const withPrefetch = <T extends Record<string, unknown>>(
  Component: React.ComponentType<T>,
  routePath: string,
  getConfigs: (props: T) => RoutePrefetchConfig[]
) => {
  const PrefetchWrapper = (props: T) => {
    const configs = getConfigs(props);
    const prefetchHandlers = usePrefetchHandlers(routePath, configs);

    return React.createElement(Component, { ...props, ...prefetchHandlers });
  };

  PrefetchWrapper.displayName = `withPrefetch(${Component.displayName || Component.name})`;
  return PrefetchWrapper;
};

export default useRoutePrefetch;
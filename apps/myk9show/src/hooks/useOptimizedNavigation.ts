/**
 * Optimized Navigation Hook
 * 
 * Provides performance-optimized navigation with data prefetching and caching
 * to eliminate the 10-second delay in show details navigation
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { getShowById } from '@/services/database/queries/showQueries';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import type { Show } from '@/types/show-types';

interface NavigationOptions {
  prefetch?: boolean;
  replace?: boolean;
  preserveData?: boolean;
}

export function useOptimizedNavigation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Set global navigate function for compatibility with show-actions
  if (typeof window !== 'undefined') {
    window.__NAVIGATE_FUNCTION__ = navigate;
  }

  const navigateToShow = useCallback(async (
    showId: string, 
    options: NavigationOptions = {}
  ) => {
    const { prefetch = true, replace = false, preserveData: _preserveData = true } = options; // eslint-disable-line @typescript-eslint/no-unused-vars
    
    const startTime = performance.now();
    
    try {
      // 1. Prefetch show data if not already cached
      if (prefetch) {
        const existingData = queryClient.getQueryData<Show>(showQueryKeys.detail(showId));
        
        if (!existingData) {
          // Prefetch in parallel with navigation
          queryClient.prefetchQuery({
            queryKey: showQueryKeys.detail(showId),
            queryFn: async () => {
              const { data, error } = await getShowById(showId);
              if (error) throw error;
              return mapDatabaseToShow(data as Parameters<typeof mapDatabaseToShow>[0]);
            },
            staleTime: 1000 * 60 * 5, // 5 minutes
          });
        }
      }

      // 2. Navigate using React Router (no page reload)
      navigate(`/shows/${showId}`, { replace });

      void startTime; // Used for performance tracking if needed
    } catch {
      // Fallback to regular navigation
      if (replace) {
        window.location.replace(`/shows/${showId}`);
      } else {
        window.location.href = `/shows/${showId}`;
      }
    }
  }, [navigate, queryClient]);

  const prefetchShow = useCallback(async (showId: string) => {
    const existingData = queryClient.getQueryData<Show>(showQueryKeys.detail(showId));
    
    if (!existingData) {
      return queryClient.prefetchQuery({
        queryKey: showQueryKeys.detail(showId),
        queryFn: async () => {
          const { data, error } = await getShowById(showId);
          if (error) throw error;
          return mapDatabaseToShow(data as Parameters<typeof mapDatabaseToShow>[0]);
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
      });
    }
  }, [queryClient]);

  const navigateWithPrefetch = useCallback((showId: string) => {
    // Immediate prefetch on hover/focus
    prefetchShow(showId);
    
    // Return navigation function for onClick
    return () => navigateToShow(showId);
  }, [navigateToShow, prefetchShow]);

  return {
    navigateToShow,
    prefetchShow,
    navigateWithPrefetch,
  };
}

// TypeScript declaration for global navigate function
declare global {
  interface Window {
    __NAVIGATE_FUNCTION__?: (path: string, options?: { replace?: boolean }) => void;
  }
}
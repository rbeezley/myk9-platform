/**
 * Fast Show Details Hook
 *
 * Performance-optimized hook for show details page that eliminates
 * the 10-second loading delay by using cached data and smart loading strategies
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useShowQuery, showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import { logger } from '@/services/LoggingService';

interface FastShowDetailsResult {
  showId: string | null;
  show: Show | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  isFromCache: boolean;
  loadTime: number;
  hasData: boolean;
}

export function useFastShowDetails(explicitShowId?: string): FastShowDetailsResult {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  // Use lazy state initialization for start time (runs only once on mount)
  const [loadStartTime] = useState(() => performance.now());
  const [loadTime, setLoadTime] = useState(0);
  const hasRecordedLoadTime = useRef(false);

  const storeShows = useShowStore(s => s.shows);

  const showId = explicitShowId || id || null;

  // Try to get cached data first (from browse shows page)
  const { cachedShow, foundInCache } = useMemo(() => {
    if (!showId) return { cachedShow: null, foundInCache: false };

    // Check individual show cache first
    const individualCache = queryClient.getQueryData<Show>(showQueryKeys.detail(showId));
    if (individualCache) {
      return { cachedShow: individualCache, foundInCache: true };
    }

    // Check shows list cache
    const showsList = queryClient.getQueryData<Show[]>(showQueryKeys.lists());
    if (showsList) {
      const foundShow = showsList.find(show => show.id === showId);
      if (foundShow) {
        // Also cache it for individual queries
        queryClient.setQueryData(showQueryKeys.detail(showId), foundShow);
        return { cachedShow: foundShow, foundInCache: true };
      }
    }

    return { cachedShow: null, foundInCache: false };
  }, [showId, queryClient]);

  // Try store data (replication layer) as second source
  const storeShow = useMemo(() => {
    if (foundInCache || !showId) return null;
    return storeShows.find(s => s.id === showId) || null;
  }, [showId, foundInCache, storeShows]);

  // Derive isFromCache directly from foundInCache (no state sync needed)
  const isFromCache = foundInCache;

  // Only use network query if no cached data is available
  const {
    data: networkShow,
    isLoading: isNetworkLoading,
    isError: isNetworkError,
    refetch,
  } = useShowQuery(showId || '');

  // Use cached data if available, otherwise use network data
  const show = cachedShow || storeShow || networkShow || null;
  const isLoading = !cachedShow && !storeShow && isNetworkLoading;

  // Record load time once when data first arrives
  useEffect(() => {
    if (show && !hasRecordedLoadTime.current) {
      hasRecordedLoadTime.current = true;
      const duration = performance.now() - loadStartTime;

      // Use queueMicrotask to defer state update
      queueMicrotask(() => {
        setLoadTime(duration);
      });

      if (import.meta.env.DEV) {
        logger.debug(
          `Show details loaded in ${duration.toFixed(2)}ms${isFromCache ? ' (from cache)' : ' (from network)'}`,
          'hooks',
          {}
        );
      }
    }
  }, [show, loadStartTime, isFromCache]);

  const isError = !cachedShow && !storeShow && isNetworkError;

  return {
    showId,
    show,
    isLoading,
    isError,
    refetch,
    isFromCache,
    loadTime,
    hasData: !!show,
  };
}

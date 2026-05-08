/**
 * Fast Show Details Hook
 *
 * Performance-optimized hook for show details page that eliminates
 * the 10-second loading delay by using cached data and smart loading strategies.
 *
 * Uses useQuery with placeholderData so the component renders immediately
 * from any pre-existing list/store cache AND reacts to cache updates after
 * mutations (unlike the previous getQueryData-in-useMemo approach, which
 * only read the cache once and never re-ran).
 */

import { useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { useShowStore } from '@/store/showStore';
import { getShowById } from '@/services/database/shows';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
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
  const [loadStartTime] = useState(() => performance.now());
  const [loadTime, setLoadTime] = useState(0);
  const hasRecordedLoadTime = useRef(false);

  const storeShows = useShowStore(s => s.shows);

  const showId = explicitShowId || id || null;

  const {
    data: show,
    isLoading: isNetworkLoading,
    isError: isNetworkError,
    refetch,
    isPlaceholderData,
  } = useQuery({
    queryKey: showQueryKeys.detail(showId || ''),
    queryFn: async () => {
      const { data, error } = await getShowById(showId!);
      if (error) throw error;
      return mapDatabaseToShow(data as Parameters<typeof mapDatabaseToShow>[0]);
    },
    enabled: !!showId,
    // placeholderData provides instant display from pre-existing caches while
    // the real query runs in the background — preserves fast navigation feel.
    placeholderData: (): Show | undefined => {
      if (!showId) return undefined;
      const listCache = queryClient.getQueryData<Show[]>(showQueryKeys.lists());
      const fromList = listCache?.find(s => s.id === showId);
      if (fromList) return fromList;
      return storeShows.find(s => s.id === showId) ?? undefined;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes
  });

  // isPlaceholderData = true while the real query is pending and we're showing cached data
  const isFromCache = isPlaceholderData;

  // Record load time once when data first arrives
  useEffect(() => {
    if (show && !hasRecordedLoadTime.current) {
      hasRecordedLoadTime.current = true;
      const duration = performance.now() - loadStartTime;
      queueMicrotask(() => setLoadTime(duration));
      if (import.meta.env.DEV) {
        logger.debug(
          `Show details loaded in ${duration.toFixed(2)}ms${isFromCache ? ' (from cache)' : ' (from network)'}`,
          'hooks',
          {}
        );
      }
    }
  }, [show, loadStartTime, isFromCache]);

  return {
    showId,
    show: show ?? null,
    isLoading: isNetworkLoading && !show,
    isError: isNetworkError && !show,
    refetch,
    isFromCache,
    loadTime,
    hasData: !!show,
  };
}

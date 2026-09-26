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
 *
 * A signed-out guest takes none of that: see the INTENT below (MYK9-779).
 */

import { useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  GUEST_READ_QUERY_OPTIONS,
  resolveGuestRead,
  useQueryOnlineStatus,
} from '@/hooks/guestServerRead';
import { useShowStore } from '@/store/showStore';
import { getShowById } from '@/services/database/shows';
import { getPublicShowById } from '@/services/database/shows/publicShowDetail';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import type { Show } from '@/types/show-types';
import { logger } from '@/services/LoggingService';
import { isValidUUID } from '@/utils/validation';

interface FastShowDetailsResult {
  showId: string | null;
  show: Show | null;
  isLoading: boolean;
  isError: boolean;
  /**
   * A signed-out guest's online-only read cannot run because the device is
   * offline. Never true for a signed-in or passcode session, whose offline
   * answer is the replica.
   */
  isOffline: boolean;
  /**
   * The network read failed but a cached placeholder is standing in, so
   * `isError` is suppressed. Callers must say so rather than presenting the
   * stale row as current.
   */
  refreshFailed: boolean;
  refetch: () => void;
  isFromCache: boolean;
  loadTime: number;
  hasData: boolean;
}

export const PUBLIC_SHOW_DETAIL_QUERY_KEY = ['shows', 'public-detail'] as const;

const NO_STORE_SHOWS: Show[] = [];

type MappableShowRow = Parameters<typeof mapDatabaseToShow>[0];

export function useFastShowDetails(explicitShowId?: string): FastShowDetailsResult {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [loadStartTime] = useState(() => performance.now());
  const [loadTime, setLoadTime] = useState(0);
  const hasRecordedLoadTime = useRef(false);

  // Signed out means no session at all. A ringside passcode session is an
  // anonymous auth user scoped to one show; it keeps the replica path.
  const { user, loading: authLoading } = useAuthContext();
  const isGuest = !authLoading && !user;
  const readsReplica = !authLoading && !!user;

  // Only a session that reads the replica reads the store (INTENT below).
  const storeShows = useShowStore(s => (readsReplica ? s.shows : NO_STORE_SHOWS));

  const showId = explicitShowId || id || null;
  // Route params are user-controlled. Do not turn a path such as /shows/new
  // into a database request for a show whose id can never be valid.
  const isReadableId = !!showId && isValidUUID(showId);

  const {
    data: memberShow,
    isLoading: isNetworkLoading,
    isError: isNetworkError,
    refetch,
    isPlaceholderData,
    fetchStatus,
  } = useQuery({
    queryKey: showQueryKeys.detail(showId || ''),
    queryFn: async () => {
      const { data, error } = await getShowById(showId!);
      if (error) throw error;
      return mapDatabaseToShow(data as MappableShowRow);
    },
    enabled: isReadableId && readsReplica,
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

  // INTENT: MYK9-779, same owner decision as MYK9-747/768/780: public,
  // signed-out surfaces read online and never read the shared replica. The
  // replica-first getShowById, the list cache and the store all hold whatever
  // an earlier signed-in session on this device could see (a secretary's
  // drafts, shows soft-deleted on the server since), so a guest's show is
  // shows_select's answer for anon, never a cached row, not even as a
  // placeholder, not even offline (guestServerRead.ts).
  const guestQuery = useQuery({
    queryKey: [...PUBLIC_SHOW_DETAIL_QUERY_KEY, showId],
    queryFn: async () => {
      const row = await getPublicShowById(showId!);
      return row ? mapDatabaseToShow(row as MappableShowRow) : null;
    },
    enabled: isReadableId && isGuest,
    ...GUEST_READ_QUERY_OPTIONS,
  });
  const isOnline = useQueryOnlineStatus();
  const guestRead = isReadableId && isGuest ? resolveGuestRead(guestQuery, isOnline) : null;

  let show: Show | null = null;
  if (guestRead?.kind === 'ready') show = guestRead.data;
  else if (readsReplica) show = memberShow ?? null;
  // isPlaceholderData = true while the real query is pending and we're showing cached data
  const isFromCache = readsReplica && isPlaceholderData;

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

  if (isGuest) {
    return {
      showId,
      show,
      isLoading: guestRead?.kind === 'loading',
      isError: guestRead?.kind === 'error',
      isOffline: guestRead?.kind === 'offline',
      refreshFailed: false,
      refetch: () => void guestQuery.refetch(),
      isFromCache: false,
      loadTime,
      hasData: !!show,
    };
  }

  return {
    showId,
    show,
    // Auth still resolving: neither source is safe to render yet.
    isLoading: (authLoading && isReadableId) || (isNetworkLoading && !show),
    isError: isNetworkError && !show,
    isOffline: false,
    /**
     * The network read did not land but a placeholder (list cache or Zustand
     * store) is standing in, so `isError` above is suppressed and the page
     * renders a full, confident show page from a possibly-stale row -- dates and
     * fee included -- with nothing telling the viewer it could not be refreshed.
     *
     * `fetchStatus === 'paused'` is not optional here. This query inherits the
     * default online network mode and pauses rather than errors when the device
     * is offline, so the most common way to miss a refresh never sets `isError`.
     */
    refreshFailed:
      (isNetworkError || fetchStatus === 'paused' || !onlineManager.isOnline()) && !!show,
    refetch,
    isFromCache,
    loadTime,
    hasData: !!show,
  };
}

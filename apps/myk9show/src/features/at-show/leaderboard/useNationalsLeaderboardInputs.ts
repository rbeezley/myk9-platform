import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';
import {
  fetchNationalsLeaderboardInputs,
  toLeaderboardInputs,
  type NationalsLeaderboardInputRow,
} from './nationalsLeaderboardInputs';

/** A burst of change signals is one refresh; the timer is never reset, so steady traffic still refreshes. */
const REFRESH_THROTTLE_MS = 1500;
/**
 * The backstop. The change feed signals only entries, classes and paperwork, and any signal can be
 * lost (a dropped channel, a read that overlapped it), so the board is re-read on a timer too. It
 * bounds how stale anything the feed misses can get (a renamed dog, a moved trial date).
 */
const RECONCILE_MS = 30_000;
/** Passes one read may take when changes keep landing under it; the last pass is published. */
const MAX_PASSES = 3;

/**
 * Change counter per show. Module-level on purpose: React Query keeps a read in flight across an
 * unmount, so the counter that read compares against must survive the remount too.
 */
const changeCount = new Map<string, number>();
const countOf = (showId: string) => changeCount.get(showId) ?? 0;
const noteChange = (showId: string) => changeCount.set(showId, countOf(showId) + 1);

/**
 * The leaderboard's server read (online only), kept current by the show's change signal.
 *  - A signal (a change, or the channel joining or re-joining) notes a change and schedules one
 *    throttled refresh.
 *  - A read that sees a change land while it ran reads again before publishing (a refresh cannot
 *    restart the first read of a cold query, because React Query hands it the running one).
 *  - A timer re-reads regardless, so what the feed never signals cannot stay wrong for long.
 */
export function useNationalsLeaderboardInputs(showId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['at-show', 'nationals-leaderboard', showId] as const, [showId]);
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<NationalsLeaderboardInputRow[]> => {
      for (let pass = 1; ; pass++) {
        const seen = countOf(showId);
        const rows = await fetchNationalsLeaderboardInputs(showId);
        if (countOf(showId) === seen || pass >= MAX_PASSES) return rows;
      }
    },
    enabled: enabled && Boolean(showId),
    refetchInterval: RECONCILE_MS,
  });
  const { refetch } = query;
  // While the change channel is down the board can go stale without an error, so it says so.
  const [liveDown, setLiveDown] = useState(false);

  useEffect(() => {
    if (!enabled || !showId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const requestRefresh = () => {
      noteChange(showId);
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey, exact: true });
      }, REFRESH_THROTTLE_MS);
    };
    const unsubscribe = subscribeToShowChanges(showId, requestRefresh, status => {
      if (status === 'SUBSCRIBED') {
        setLiveDown(false);
        // Every join counts as a change, the first one included: whatever moved before the
        // channel joined was never signalled.
        requestRefresh();
      } else {
        setLiveDown(true);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, showId, queryClient, queryKey]);

  const inputs = useMemo(() => (query.data ? toLeaderboardInputs(query.data) : null), [query.data]);
  return {
    inputs,
    isLoading: query.isLoading,
    isError: query.isError,
    liveDown,
    retry: () => void refetch(),
  };
}

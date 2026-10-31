import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';
import { fetchNationalsLeaderboardInputs, toLeaderboardInputs } from './nationalsLeaderboardInputs';

/** A scoring burst is one refetch. */
const REFRESH_DEBOUNCE_MS = 1500;

/**
 * The leaderboard's server read (online only), refetched on the show's change signal so scores
 * and releases made on another device reach an open board.
 */
export function useNationalsLeaderboardInputs(showId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ['at-show', 'nationals-leaderboard', showId],
    queryFn: () => fetchNationalsLeaderboardInputs(showId),
    enabled: enabled && Boolean(showId),
  });
  const { refetch } = query;
  // The change channel is the only thing that tells an open board a score moved. While it is down
  // the board can go stale without an error, so it says so, and a reconnect re-reads everything
  // missed in the gap.
  const [liveDown, setLiveDown] = useState(false);

  useEffect(() => {
    if (!enabled || !showId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToShowChanges(
      showId,
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refetch(), REFRESH_DEBOUNCE_MS);
      },
      status => {
        if (status === 'SUBSCRIBED') {
          setLiveDown(false);
          // Every SUBSCRIBED re-reads, the first one included: a change made between the board's
          // first read and the channel joining (or while it was re-enabled) was never signalled.
          void refetch();
        } else {
          setLiveDown(true);
        }
      }
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, showId, refetch]);

  const inputs = useMemo(() => (query.data ? toLeaderboardInputs(query.data) : null), [query.data]);
  return {
    inputs,
    isLoading: query.isLoading,
    isError: query.isError,
    liveDown,
    retry: () => void refetch(),
  };
}

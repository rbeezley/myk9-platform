import { useEffect, useMemo } from 'react';
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

  useEffect(() => {
    if (!enabled || !showId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToShowChanges(showId, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetch(), REFRESH_DEBOUNCE_MS);
    });
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
    retry: () => void refetch(),
  };
}

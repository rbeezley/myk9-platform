import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';
import {
  fetchNationalsLeaderboardInputs,
  toLeaderboardInputs,
  type NationalsLeaderboardInputRow,
} from './nationalsLeaderboardInputs';

/** A scoring burst is one refetch. */
const REFRESH_DEBOUNCE_MS = 1500;
/** Between two passes of one read, so a burst of changes settles before the next pass. */
const PASS_SETTLE_MS = 500;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * The leaderboard's server read (online only), kept current by the show's change signal.
 *
 * ONE refresh mechanism, so no trigger can lose a race with another:
 *  - every signal (a change, or the channel joining or re-joining) only MARKS the board dirty;
 *  - a read that finds the board marked dirty while it ran discards its result and reads again,
 *    so a change that lands during the first read (or between its pages, which are offset-based
 *    and can shift) is never served as current;
 *  - when no read is running, a marked board schedules one debounced read.
 */
export function useNationalsLeaderboardInputs(showId: string, enabled: boolean) {
  const dirtyRef = useRef(0);
  const readingRef = useRef(false);
  const query = useQuery({
    queryKey: ['at-show', 'nationals-leaderboard', showId],
    queryFn: async (): Promise<NationalsLeaderboardInputRow[]> => {
      readingRef.current = true;
      try {
        for (;;) {
          const seen = dirtyRef.current;
          const rows = await fetchNationalsLeaderboardInputs(showId);
          if (dirtyRef.current === seen) return rows;
          await sleep(PASS_SETTLE_MS);
        }
      } finally {
        readingRef.current = false;
      }
    },
    enabled: enabled && Boolean(showId),
  });
  const { refetch } = query;
  // The change channel is the only thing that tells an open board a score moved. While it is down
  // the board can go stale without an error, so it says so; its re-join marks the board dirty.
  const [liveDown, setLiveDown] = useState(false);

  useEffect(() => {
    if (!enabled || !showId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const markDirty = () => {
      dirtyRef.current += 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // A running read sees the mark itself and reads again; starting another would only be
        // deduplicated into it.
        if (!readingRef.current) void refetch();
      }, REFRESH_DEBOUNCE_MS);
    };
    const unsubscribe = subscribeToShowChanges(showId, markDirty, status => {
      if (status === 'SUBSCRIBED') {
        setLiveDown(false);
        // Every join marks the board dirty, the first one included: a change made between the
        // board's first read and the channel joining was never signalled.
        markDirty();
      } else {
        setLiveDown(true);
      }
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
    liveDown,
    retry: () => void refetch(),
  };
}

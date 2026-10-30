import { useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { useAuthContext } from '@/hooks/useAuthContext';
import { areAtShowEntryCountsKnown } from './atShowClassListAdapter';
import { subscribeAtShowSyncSettled } from './atShowDataAdapter';

const retryButtonClass =
  'inline-flex min-h-11 items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 text-sm text-warning hover:bg-warning/20';

export interface AtShowEntriesNotOnDevice {
  /** The save-for-offline node, or undefined when the show's entries are on this device. */
  notOnDevice: ReactNode | undefined;
  /** True until the first answer arrives, so the page keeps its skeleton rather than claim "none". */
  isChecking: boolean;
}

/**
 * MYK9-1520: whether the entry list should say "Entries are not on this device".
 *
 * Asks the same question the class cards ask before showing a count
 * ("Entry count not loaded yet"): has this show's entries scope ever completed
 * a sync on this device? An empty class on a synced show is genuinely empty;
 * an empty class on an unsynced one is unknown. The node is the existing
 * offline badge, so its "Save for show day" action is the one the show page
 * already offers. Anonymous passcode sessions get no readiness (so the badge
 * renders nothing), so they get a plain retry of the show's hydration instead.
 *
 * Held back while the first hydration runs, reports `isChecking` until the
 * metadata read resolves, and re-asks each time a sync of the show settles
 * (success or failure), because that is the moment the answer can change.
 */
export function useAtShowEntriesNotOnDevice(
  showId: string | undefined,
  isFirstHydrationPending: boolean,
  refresh: (forceSync: boolean) => Promise<void>
): AtShowEntriesNotOnDevice {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const queryKey = ['at-show', 'entry-list-entries-known', showId];
  const enabled = !!showId && !isFirstHydrationPending;
  const { data: entriesKnown, isFetching } = useQuery({
    queryKey,
    queryFn: () => areAtShowEntryCountsKnown(showId as string),
    enabled,
    // Reads IndexedDB, so it must answer without a network.
    networkMode: 'always',
    // A cached answer from an earlier visit is exactly what this must not trust.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!showId) return;
    return subscribeAtShowSyncSettled(showId, () => {
      void queryClient.invalidateQueries({
        queryKey: ['at-show', 'entry-list-entries-known', showId],
      });
    });
  }, [queryClient, showId]);

  // isFetching, not just missing data: a retained answer from an earlier visit
  // (cleared cache, other account) must not stand in for the fresh read.
  const isChecking = enabled && (entriesKnown === undefined || isFetching);
  if (entriesKnown !== false) return { notOnDevice: undefined, isChecking };
  const notOnDevice =
    user?.is_anonymous === true ? (
      <button type="button" className={retryButtonClass} onClick={() => void refresh(true)}>
        Try again
      </button>
    ) : (
      <OfflineReadyBadge showId={showId} />
    );
  return { notOnDevice, isChecking };
}

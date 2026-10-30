import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { areAtShowEntryCountsKnown } from './atShowClassListAdapter';

/**
 * MYK9-1520: the entry list's "not on this device" node, or undefined when the
 * show's entries have been downloaded here.
 *
 * Asks the same question the class cards ask before showing a count
 * ("Entry count not loaded yet"): has this show's entries scope ever completed
 * a sync on this device? An empty class on a synced show is genuinely empty;
 * an empty class on an unsynced one is unknown. The node is the existing
 * offline badge, so its "Save for show day" action is the one the show page
 * already offers, not a second implementation.
 *
 * Held back while the first hydration runs (the page shows its skeleton then),
 * and re-asked when that settles or the list changes, because a sync that
 * lands rows or fails changes the answer.
 */
export function useAtShowEntriesNotOnDevice(
  showId: string | undefined,
  isFirstHydrationPending: boolean,
  entryCount: number
): ReactNode | undefined {
  const { data: entriesKnown } = useQuery({
    queryKey: ['at-show', 'entry-list-entries-known', showId, isFirstHydrationPending, entryCount],
    queryFn: () => areAtShowEntryCountsKnown(showId as string),
    enabled: !!showId && !isFirstHydrationPending,
    // Reads IndexedDB, so it must answer without a network.
    networkMode: 'always',
  });
  return entriesKnown === false ? <OfflineReadyBadge showId={showId} /> : undefined;
}

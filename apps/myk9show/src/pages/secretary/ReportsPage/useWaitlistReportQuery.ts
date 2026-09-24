import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getWaitlistReportRows } from '@/services/database/waitlists';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { subscribeHandlerPeopleHydration } from '@/services/database/entries/handlerHydration';
import type { ReportWaitlistRow } from '@/lib/reports/types';

/**
 * The waitlist replica has never completed a sync on this device, and holds no
 * rows. "No rows" then means "not downloaded", not "nobody is waiting", so the
 * report must say so rather than print an empty waitlist (MYK9-717).
 */
export class WaitlistNotDownloadedError extends Error {
  constructor() {
    super('The waitlist has not been downloaded to this device yet.');
    this.name = 'WaitlistNotDownloadedError';
  }
}

/**
 * Read the report rows, refusing to answer "empty" from a cold replica. The
 * same test `areAtShowEntryCountsKnown` uses: a completed sync always records
 * `totalRows` in the table's sync metadata. Rows that ARE present are good
 * evidence even from an unconfirmed replica, as in `useHasAnyEntryForShow`.
 */
async function readWaitlistReport(showId: string): Promise<ReportWaitlistRow[]> {
  const [rows, metadata] = await Promise.all([
    getWaitlistReportRows(showId),
    replicatedWaitlistEntriesTable.getSyncMetadata(),
  ]);
  if (rows.length === 0 && metadata?.totalRows === undefined) {
    throw new WaitlistNotDownloadedError();
  }
  return rows;
}

/**
 * The Waitlist Report's rows (MYK9-717): a replica-backed query in the shape of
 * useAtShowClassList / useHasAnyEntryForShow / useExhibitorUpcomingShows.
 *
 * - `networkMode: 'always'`: it reads IndexedDB, and the default 'online' mode
 *   parks it at `fetchStatus: 'paused'` offline without ever running it.
 * - Subscribe-and-invalidate on every table it reads (waitlist, classes, dogs;
 *   `emitCurrent: false`), plus handler-name hydration (`people` is not a
 *   replicated table), unsubscribed on unmount. This also covers a promote the
 *   server confirmed before the replica had it.
 * - A cold replica is an error (`WaitlistNotDownloadedError`), never "empty".
 * - Read failures throw and surface as `isError`; nothing is swallowed.
 * - `staleTime: 0`: re-read on every open so the paper matches the Waitlist tab.
 * `useHostedReportData` counts any unresolved state of this query as busy.
 */
export function useWaitlistReportQuery(showId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const key = queryKeys.showWaitlistReport(showId ?? '');
  const keyShowId = key[1];

  useEffect(() => {
    if (!enabled) return;
    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.showWaitlistReport(keyShowId) });
    const unsubscribes = [
      replicatedWaitlistEntriesTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedClassesTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedDogsTable.subscribe(invalidate, { emitCurrent: false }),
      subscribeHandlerPeopleHydration(invalidate),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [enabled, queryClient, keyShowId]);

  return useQuery({
    queryKey: key,
    queryFn: () => readWaitlistReport(showId as string),
    enabled,
    staleTime: 0,
    networkMode: 'always',
    // A local read either works or it does not; retrying a cold replica only
    // delays the explanation. One retry for a transient IndexedDB failure.
    retry: (failureCount, error) =>
      !(error instanceof WaitlistNotDownloadedError) && failureCount < 1,
  });
}

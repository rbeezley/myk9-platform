import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import { getWaitlistReportRows, WaitlistNotDownloadedError } from '@/services/database/waitlists';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { subscribeHandlerPeopleHydration } from '@/services/database/entries/handlerHydration';

/**
 * The Waitlist Report's rows (MYK9-717), in the replica-read shape MYK9-721
 * gave `useReportData`, so they resolve through the same readiness rule:
 *
 * - `networkMode: 'always'`: the read is IndexedDB. The default 'online' mode
 *   would park it at `paused` offline without ever running it.
 * - Re-read on every notice from the tables it joins (waitlist, dogs;
 *   `emitCurrent: false`) and on handler-name hydration. The refetch is what
 *   makes the page read `refreshing`, so Print waits for the fresh rows.
 * - A waitlist replica that has never synced is an error, never "empty".
 *
 * `classIds` is the page's own settled class set; `undefined` holds the read
 * until it exists, which reads as `loading`.
 */
export function useWaitlistReportQuery(
  showId: string | undefined,
  classIds: readonly string[] | undefined,
  enabled: boolean
) {
  const queryClient = useQueryClient();
  const scopeKey = useMemo(() => (classIds ? [...classIds].sort() : null), [classIds]);
  const baseKey = queryKeys.showWaitlistReport(showId ?? '');
  const keyShowId = baseKey[1];
  const active = enabled && Boolean(showId) && scopeKey !== null;

  useEffect(() => {
    if (!active) return;
    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.showWaitlistReport(keyShowId) });
    const unsubscribes = [
      replicatedWaitlistEntriesTable.subscribe(invalidate, { emitCurrent: false }),
      replicatedDogsTable.subscribe(invalidate, { emitCurrent: false }),
      subscribeHandlerPeopleHydration(invalidate),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [active, queryClient, keyShowId]);

  return useQuery({
    queryKey: [...baseKey, scopeKey ?? []] as const,
    queryFn: () => getWaitlistReportRows(scopeKey ?? []),
    enabled: active,
    ...cacheStrategies.moderate,
    networkMode: 'always',
    // A local read either works or it does not; retrying a cold replica only
    // delays the explanation. One retry for a transient IndexedDB failure.
    retry: (failureCount, error) =>
      !(error instanceof WaitlistNotDownloadedError) && failureCount < 1,
  });
}

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getWaitlistReportRows } from '@/services/database/waitlists';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { subscribeHandlerPeopleHydration } from '@/services/database/entries/handlerHydration';

/**
 * The Waitlist Report's rows (MYK9-717), read from the local replica.
 *
 * A promote or remove invalidates `queryKeys.show` as soon as the SERVER
 * answers, which can be before the replica has the change. So, like
 * useMyRingConflicts and useShowPaperworkPrints, the query is also invalidated
 * whenever a table it reads changes locally — the waitlist, the classes it
 * groups by, the dogs it names — and when handler names finish hydrating
 * (`people` is not a replicated table). Each refetch counts as busy in
 * `useHostedReportData`, so Print waits for it.
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
    queryFn: () => getWaitlistReportRows(showId as string),
    enabled,
    // A local replica read: re-read on every open so the paper matches the Waitlist tab.
    staleTime: 0,
  });
}

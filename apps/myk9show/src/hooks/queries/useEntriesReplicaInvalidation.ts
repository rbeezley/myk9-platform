import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication';

/**
 * Refresh reads that derive from the entries replica when the replica changes,
 * instead of polling them on a timer (MYK9-1368).
 *
 * The replica notifies on a leading and a trailing edge, and a sync pass changes
 * it in bursts, so notices are coalesced: the first one after an idle period
 * opens a window of `coalesceMs`, further notices inside it are absorbed, and
 * the keys are invalidated ONCE when the window closes. Invalidating refetches
 * only active queries, so a hook that is unmounted or disabled costs nothing.
 *
 * `emitCurrent: false` skips the initial emit (the query's own first read
 * already holds the current rows).
 */
export function useEntriesReplicaInvalidation(
  queryKeys: readonly QueryKey[],
  coalesceMs: number
): void {
  const queryClient = useQueryClient();
  // Keys are rebuilt every render; read them through a ref so the subscription
  // is made once per client/window, and the latest keys are the ones invalidated.
  // Written in an effect, not during render (react-hooks/refs).
  const keysRef = useRef(queryKeys);
  useEffect(() => {
    keysRef.current = queryKeys;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        for (const queryKey of keysRef.current) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }, coalesceMs);
    };
    const unsubscribe = replicatedEntriesTable.subscribe(schedule, { emitCurrent: false });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [queryClient, coalesceMs]);
}

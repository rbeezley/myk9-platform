import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication';

/** A replicated table whose change notices can drive invalidation. */
export interface ReplicaChangeSource {
  subscribe(callback: () => void, options: { emitCurrent: false }): () => void;
}

const DEFAULT_SOURCES: readonly ReplicaChangeSource[] = [replicatedEntriesTable];

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
 *
 * `sources` defaults to the entries replica. A read derived from several
 * replicas passes them all; one coalescing window covers the lot (MYK9-1416).
 * Pass a module-level or memoized array: it is a subscription dependency.
 */
export function useEntriesReplicaInvalidation(
  queryKeys: readonly QueryKey[],
  coalesceMs: number,
  sources: readonly ReplicaChangeSource[] = DEFAULT_SOURCES
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
    const unsubscribes = sources.map(source => source.subscribe(schedule, { emitCurrent: false }));
    return () => {
      clearTimeout(timer);
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [queryClient, coalesceMs, sources]);
}

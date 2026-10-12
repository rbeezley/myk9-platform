import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

/**
 * After a Discard puts a dog's row back to the server's state (MYK9-1076),
 * refetch every cached dog read: the roster and detail under `['dogs']`, and
 * every owner's dogs under `['users', ownerId, 'dogs']` (a discarded transfer
 * touched two owners' lists).
 *
 * Refetch only, no hand patch of the caches: the dog reads are hybrid
 * PostgREST reads, not replica subscribers, and patching them from the
 * replica kept missing fields (Codex review, round 2). The queries are
 * `networkMode: 'online'`, so offline the refetch waits for reconnect and the
 * screen shows the discarded value until then; the replica is already right.
 * Reading dogs from the replica removes that gap (MYK9-1124).
 */
export function refreshDogCachesAfterDiscard(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
  void queryClient.invalidateQueries({
    predicate: query => query.queryKey[0] === 'users' && query.queryKey[2] === 'dogs',
  });
}

/** Listens for `replication:discard-row-replaced` from `@myk9/replication`. */
export function useDiscardRevertCacheSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const handle = (event: Event) => {
      const { tableName } = (event as CustomEvent<{ tableName: string }>).detail;
      if (tableName === 'dogs') refreshDogCachesAfterDiscard(queryClient);
    };
    window.addEventListener('replication:discard-row-replaced', handle);
    return () => window.removeEventListener('replication:discard-row-replaced', handle);
  }, [queryClient]);
}

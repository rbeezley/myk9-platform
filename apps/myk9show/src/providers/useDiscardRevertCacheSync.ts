import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getPostSyncInvalidationKeys } from './replicationSyncStatus';

/**
 * After a Discard puts a dog's row back to the server's state (MYK9-1076),
 * refetch every cached dog read: the roster and detail under `['dogs']`, and
 * every owner's dogs under `['users', ownerId, 'dogs']` (a discarded transfer
 * touched two owners' lists).
 *
 * Refetch only, no hand patch of the caches: patching them from the replica kept
 * missing fields (Codex review, round 2). The dog reads are `offlineFirst`
 * (server first, device replica when the server cannot be reached), so offline
 * the refetch is answered from the replica, which Discard has already put right,
 * and the restored dog shows without a reconnect (MYK9-1124).
 */
export function refreshDogCachesAfterDiscard(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
  void queryClient.invalidateQueries({
    predicate: query => query.queryKey[0] === 'users' && query.queryKey[2] === 'dogs',
  });
}

/**
 * Reads derived from entries whose key does not name them: class counts, the Show
 * Desk check-in report and the judge dashboard's assignments read.
 */
const ENTRY_DERIVED_ROOTS: ReadonlySet<unknown> = new Set(['classes', 'check-in-report']);

/**
 * After a Discard puts an entry's row back to the server's state (MYK9-1922),
 * refetch every cached read of entries. One structural rule, not a list of keys:
 * any query whose key contains the `'entries'` segment (`['entries', ...]`,
 * `['shows', id, 'entries']`, `['trials', id, 'entries']`, `['classes', id, 'entries']`),
 * plus the derived roots above and the post-sync keys. Two review rounds each found a
 * key a hand-picked list had missed, so a new entries read is covered by its name.
 */
export function refreshEntryCachesAfterDiscard(queryClient: QueryClient): void {
  for (const queryKey of getPostSyncInvalidationKeys(['entries'])) {
    void queryClient.invalidateQueries({ queryKey });
  }
  void queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey.includes('entries') || ENTRY_DERIVED_ROOTS.has(queryKey[0]),
  });
}

/** Listens for `replication:discard-row-replaced` from `@myk9/replication`. */
export function useDiscardRevertCacheSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const handle = (event: Event) => {
      const { tableName } = (event as CustomEvent<{ tableName: string }>).detail;
      if (tableName === 'dogs') refreshDogCachesAfterDiscard(queryClient);
      else if (tableName === 'entries') refreshEntryCachesAfterDiscard(queryClient);
    };
    window.addEventListener('replication:discard-row-replaced', handle);
    return () => window.removeEventListener('replication:discard-row-replaced', handle);
  }, [queryClient]);
}

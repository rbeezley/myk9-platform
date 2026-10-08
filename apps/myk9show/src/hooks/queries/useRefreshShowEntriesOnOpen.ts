import { useEffect } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { refreshShowEntriesOnOpen } from '@/services/database/entries/refreshShowEntriesForRead';
import { hasShowEntriesSynced } from '@/services/replication/entriesShowSyncState';

/** Refreshes already invalidated, so callers sharing one refresh invalidate once. */
const invalidatedRefreshes = new WeakSet<Promise<boolean>>();

/**
 * Refresh a show's entries replica when staff open it (MYK9-1064), as a side
 * effect of the shared staff query rather than inside its read.
 *
 * The read (`getEntriesForShow`) serves a warm replica as-is and nothing else
 * syncs a returning device's show scope (the app-level pass has no show scope).
 * Warm replica only: a cold one is hydrated by the read itself, classes and
 * trials included. A successful sync invalidates the show's entries queries so
 * the unchanged read runs again on fresh data (a deleted last entry then goes
 * through its verified-empty path). A failure invalidates nothing and the next
 * open retries. The refetch this causes does not remount the effect, and the
 * 15 s per-show coalescing in `refreshShowEntriesOnOpen` bounds repeat opens.
 */
export function useRefreshShowEntriesOnOpen(showId: string, enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!showId || !enabled || !onlineManager.isOnline()) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!(await hasShowEntriesSynced(showId)) || cancelled) return;
        const refresh = refreshShowEntriesOnOpen(showId);
        if (!(await refresh) || invalidatedRefreshes.has(refresh)) return;
        invalidatedRefreshes.add(refresh);
        // Cancel first: with no cached data TanStack reuses a fetch already in
        // flight (query-core query.js: cancelRefetch only cancels when data
        // exists), and that fetch may have assembled its rows before the sync.
        // cancelQueries reverts it, then invalidate starts a fresh read.
        const queryKey = queryKeys.showEntries(showId);
        await queryClient.cancelQueries({ queryKey });
        await queryClient.invalidateQueries({ queryKey });
      } catch {
        // The cached read stays usable; the next open retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showId, enabled, queryClient]);
}

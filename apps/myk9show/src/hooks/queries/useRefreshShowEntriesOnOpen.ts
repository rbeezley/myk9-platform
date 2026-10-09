import { useCallback, useContext, useEffect, useRef } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { claimShowOpenRefresh } from '@/services/database/entries/showOpenRefreshGate';
import { hasShowEntriesSynced } from '@/services/replication/entriesShowSyncState';

/**
 * A pass already running when the target arrives only queues it, then runs it
 * right after: that is two status advances before the show's rows are fresh.
 */
const PASSES_WHEN_QUEUED = 2;

/**
 * Refresh a show's entries replica when staff open it (MYK9-1064), as a side
 * effect of the shared staff query rather than inside its read.
 *
 * The read (`getEntriesForShow`) serves a warm replica as-is and nothing else
 * syncs a returning device's show scope (the app-level pass has no show scope).
 * This asks the sync provider for a scoped `entries` pass over the show, so
 * the provider's own status (`lastSyncAt`, `tablesStatus.entries`) advances and
 * every consumer that reloads on it (Entry Management) reloads, with no second
 * sync path beside the provider. Warm replica only: a cold one is hydrated by
 * the read itself, classes and trials included.
 *
 * Afterwards the show's entries queries are cancelled and invalidated: with no
 * cached data TanStack reuses a fetch already in flight (query-core
 * `query.js`: `cancelRefetch` only cancels when data exists), and that fetch may
 * have assembled its rows before the sync. A provider status change does not
 * remount this effect, and scoped passes sit outside the 15 s full-pass
 * scheduler, so the refetch this causes starts no further sync; repeat opens
 * are bounded by `claimShowOpenRefresh`.
 */
export function useRefreshShowEntriesOnOpen(showId: string, enabled: boolean): void {
  const queryClient = useQueryClient();
  const sync = useContext(ReplicationSyncContext);
  const triggerSyncRef = useRef(sync?.triggerSync);
  const isSyncingRef = useRef(false);
  const awaitedPasses = useRef<{ showId: string; remaining: number } | null>(null);
  const lastSyncAt = sync?.status.lastSyncAt?.getTime() ?? null;

  const refetchFresh = useCallback(
    async (id: string) => {
      const queryKey = queryKeys.showEntries(id);
      await queryClient.cancelQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey });
    },
    [queryClient]
  );

  // Latest provider values for the open effect, which must not re-run on them.
  useEffect(() => {
    triggerSyncRef.current = sync?.triggerSync;
    isSyncingRef.current = sync?.status.isSyncing ?? false;
  });

  useEffect(() => {
    if (!showId || !enabled || !onlineManager.isOnline() || !triggerSyncRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!(await hasShowEntriesSynced(showId)) || cancelled) return;
        if (!claimShowOpenRefresh(showId)) return;
        const queued = isSyncingRef.current;
        await triggerSyncRef.current?.([{ name: 'entries', scopeId: showId }]);
        if (queued) {
          awaitedPasses.current = { showId, remaining: PASSES_WHEN_QUEUED };
          return;
        }
        await refetchFresh(showId);
      } catch {
        // The cached read stays usable; the next open retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showId, enabled, refetchFresh]);

  // The queued case: the pass that carries this show finishes later.
  useEffect(() => {
    const awaited = awaitedPasses.current;
    if (!awaited || lastSyncAt === null) return;
    awaited.remaining -= 1;
    if (awaited.remaining <= 0) awaitedPasses.current = null;
    void refetchFresh(awaited.showId);
  }, [lastSyncAt, refetchFresh]);
}

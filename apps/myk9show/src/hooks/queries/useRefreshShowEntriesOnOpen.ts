import { useContext, useEffect, useRef } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { claimShowOpenRefresh } from '@/services/database/entries/showOpenRefreshGate';
import { hasShowEntriesSynced } from '@/services/replication/entriesShowSyncState';

/**
 * Refresh a show's entries replica when staff open it (MYK9-1064), as a side
 * effect of the shared staff query rather than inside its read.
 *
 * The read (`getEntriesForShow`) serves a warm replica as-is and nothing else
 * syncs a returning device's show scope (the app-level pass has no show scope).
 * This only asks the sync provider for a scoped `entries` pass over the show
 * and walks away. The provider owns everything after the download: its status
 * (`lastSyncAt`, `tablesStatus.entries`) advances for consumers that reload on
 * it (Entry Management), and it refetches the show's entries query, so a
 * queued request, a request whose component has unmounted, and a fetch already
 * in flight are all handled with no completion tracking here.
 *
 * Warm replica only: a cold one is hydrated by the read itself, classes and
 * trials included. Repeat opens are bounded by `claimShowOpenRefresh`, and the
 * effect does not depend on provider status, so a pass cannot re-trigger it.
 */
export function useRefreshShowEntriesOnOpen(showId: string, enabled: boolean): void {
  const sync = useContext(ReplicationSyncContext);
  const triggerSyncRef = useRef(sync?.triggerSync);

  // Latest provider value for the open effect, which must not re-run on it.
  useEffect(() => {
    triggerSyncRef.current = sync?.triggerSync;
  });

  useEffect(() => {
    if (!showId || !enabled || !onlineManager.isOnline() || !triggerSyncRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!(await hasShowEntriesSynced(showId)) || cancelled) return;
        if (!claimShowOpenRefresh(showId)) return;
        await triggerSyncRef.current?.([{ name: 'entries', scopeId: showId }]);
      } catch {
        // The cached read stays usable; the next open retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showId, enabled]);
}

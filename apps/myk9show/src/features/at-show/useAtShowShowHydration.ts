import { useEffect, useRef, useState } from 'react';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

/**
 * Hydrates the at-show page's own show (trials, their classes, its entries) the
 * moment the page mounts, then again after every completed app-wide sync pass.
 *
 * MYK9-1333: the first hydration used to wait for the app-wide pass, which syncs
 * every replicated table but never downloads entries (they are show-scoped). On
 * a cold device under a slow server that pass alone outlasted a reader's
 * patience, so the class never showed a card. The show's own sync runs
 * alongside the app-wide one: watermarks are per scope and monotonic, and the
 * scoresheet and show boundary already sync this way.
 *
 * Returns whether the first hydration of `showId` is still running, so the page
 * keeps its skeleton instead of claiming "No Entries Yet" before the show's
 * entries have had a chance to arrive.
 */
export function useAtShowShowHydration(
  showId: string | undefined,
  syncStatus: ReplicationSyncContextValue['status'],
  refresh: (forceSync: boolean) => Promise<void>
): boolean {
  const [hydratedShowId, setHydratedShowId] = useState<string | null>(null);
  const startedShowRef = useRef<string | null>(null);
  const passKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!showId || startedShowRef.current === showId) return;
    startedShowRef.current = showId;
    // refresh() swallows sync failures (offline: keep the cached rows), so this
    // settles either way and the page falls back to its normal empty state.
    // A slower hydration of an earlier show must not overwrite a later one's
    // completion (MYK9-1379): only the show still being hydrated may record it.
    const forShow = showId;
    void refresh(true).finally(() =>
      setHydratedShowId(prev => (startedShowRef.current === forShow ? forShow : prev))
    );
  }, [refresh, showId]);

  useEffect(() => {
    if (!showId || syncStatus.isSyncing || !syncStatus.lastSyncAt) return;
    const passKey = `${showId}:${syncStatus.lastSyncAt.getTime()}`;
    if (passKeyRef.current === passKey) return;
    passKeyRef.current = passKey;
    void refresh(true);
  }, [refresh, showId, syncStatus.isSyncing, syncStatus.lastSyncAt]);

  return showId !== undefined && hydratedShowId !== showId;
}

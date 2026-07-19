/**
 * Show-scoped live-update nudge.
 *
 * Broadcast carries no row data. It only asks ReplicationSyncProvider to run
 * its existing incremental sync, keeping the offline-first replica authoritative.
 * The provider's 60-second poll remains the correctness fallback.
 */

import { useEffect } from 'react';
import { features } from '@/config/features';
import { subscribeToShowChanges } from './showChangeSignal';

const NUDGE_DEBOUNCE_MS = 400;

export function showLiveSyncEnabled(): boolean {
  return features.showLiveSync || import.meta.env?.VITE_SHOW_LIVE_SYNC === 'true';
}

export function useShowLiveSync(showId: string | undefined): void {
  const enabled = showLiveSyncEnabled();

  useEffect(() => {
    if (!enabled || !showId) return undefined;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasConnected = false;

    const nudgeSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        window.dispatchEvent(new Event('replication:sync-requested'));
      }, NUDGE_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeToShowChanges(showId, nudgeSync, status => {
      if (status !== 'SUBSCRIBED') return;
      if (hasConnected) nudgeSync();
      hasConnected = true;
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [enabled, showId]);
}

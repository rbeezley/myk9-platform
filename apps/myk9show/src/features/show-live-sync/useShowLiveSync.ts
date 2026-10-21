/**
 * Show-scoped live-update nudge.
 *
 * Broadcast carries no row data. It only asks ReplicationSyncProvider to run
 * its existing incremental sync, keeping the offline-first replica authoritative.
 * The provider's poll remains the correctness fallback: 60 s, or 3-5 min while
 * the show channel is SUBSCRIBED (MYK9-1305).
 */

import { useEffect } from 'react';
import { markRealtimeReconnected } from '@myk9/replication';
import { features } from '@/config/features';
import {
  clearShowChannel,
  markShowChannel,
  registerShowChannelMount,
} from '@/providers/syncCadence';
import { subscribeToShowChanges } from './showChangeSignal';

const NUDGE_DEBOUNCE_MS = 400;

export function showLiveSyncEnabled(): boolean {
  return features.showLiveSync || import.meta.env?.VITE_SHOW_LIVE_SYNC === 'true';
}

export function useShowLiveSync(showId: string | undefined): void {
  const enabled = showLiveSyncEnabled();

  useEffect(() => {
    if (!enabled || !showId) return undefined;

    const mountToken = registerShowChannelMount(showId);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasConnected = false;
    let explicitPending = false;

    // A change nudge is explicit: run now. A reconnect nudge is `deferred`:
    // events may have been missed while the channel was down, so a pass is owed,
    // but the provider must not full-sync on every reconnect (MYK9-1054).
    const nudgeSync = (deferred = false) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      // A change in the same window as a reconnect keeps the prompt pass.
      explicitPending ||= !deferred;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        const isDeferred = !explicitPending;
        explicitPending = false;
        window.dispatchEvent(
          isDeferred
            ? new CustomEvent('replication:sync-requested', { detail: { deferred: true } })
            : new Event('replication:sync-requested')
        );
      }, NUDGE_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeToShowChanges(
      showId,
      () => nudgeSync(),
      status => {
        // MYK9-1305: the 3-5 min poll holds only while the channel is SUBSCRIBED.
        markShowChannel(mountToken, status === 'SUBSCRIBED');
        if (status !== 'SUBSCRIBED') return;
        if (hasConnected) {
          // MYK9-1301: events may have been missed, so the next count pass runs
          // even when a change coalesces this reconnect into a bare nudge.
          markRealtimeReconnected();
          nudgeSync(true);
        }
        hasConnected = true;
      }
    );

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
      clearShowChannel(mountToken);
    };
  }, [enabled, showId]);
}

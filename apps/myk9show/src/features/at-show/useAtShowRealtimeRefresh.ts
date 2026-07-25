import { useEffect, useRef } from 'react';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';

const DEBOUNCE_MS = 1500;

/**
 * Realtime refresh for the at-show entry lists (user decision 2026-06-11:
 * exhibitors expect myK9Q-parity live updates, not pull-to-refresh).
 *
 * Subscribes to the shared show-scoped Broadcast signal and nudges the page's `refresh(true)`
 * (forceSync → replication pull → re-render) behind a debounce so a scoring
 * burst coalesces into one sync. Also refreshes immediately when the app
 * returns to the foreground — the common ringside tab-switch case.
 *
 * Offline-safe: the channel is silently idle without a connection;
 * pull-to-refresh remains the manual fallback.
 */
export function useAtShowRealtimeRefresh(
  showId: string | undefined,
  refresh: (forceSync?: boolean) => Promise<void>
): void {
  // Latest-ref pattern: the channel subscribes once per show, not per render.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!showId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let pendingWhileInFlight = false;

    const runRefresh = async () => {
      if (inFlight) {
        pendingWhileInFlight = true;
        return;
      }
      inFlight = true;
      try {
        await refreshRef.current(true);
      } catch {
        /* non-fatal — next event or pull-to-refresh recovers */
      } finally {
        inFlight = false;
        if (pendingWhileInFlight) {
          pendingWhileInFlight = false;
          void runRefresh();
        }
      }
    };

    const nudge = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void runRefresh(), DEBOUNCE_MS);
    };

    const unsubscribe = subscribeToShowChanges(showId, nudge);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void runRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [showId]);
}

import { useEffect, useRef } from 'react';
import {
  subscribeToShowChanges,
  type ShowChangeSignal,
} from '@/features/show-live-sync/showChangeSignal';
import { syncAtShowChangeSignals } from './atShowDataAdapter';

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
  classIds: readonly string[],
  refresh: (forceSync?: boolean) => Promise<void>,
  synchronize: (
    showId: string,
    signals: readonly ShowChangeSignal[]
  ) => Promise<void> = syncAtShowChangeSignals
): void {
  // Latest-ref pattern: the channel subscribes once per show, not per render.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const synchronizeRef = useRef(synchronize);
  useEffect(() => {
    synchronizeRef.current = synchronize;
  });
  const classScopeKey = [...classIds].sort().join(':');

  useEffect(() => {
    if (!showId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let pendingWhileInFlight = false;
    let pendingFullRefresh = false;
    let pendingSignals: ShowChangeSignal[] = [];
    const watchedClassIds = new Set(classScopeKey ? classScopeKey.split(':') : []);

    const runRefresh = async () => {
      if (inFlight) {
        pendingWhileInFlight = true;
        return;
      }
      const signals = pendingSignals;
      pendingSignals = [];
      const forceFullSync = pendingFullRefresh;
      pendingFullRefresh = false;
      if (!forceFullSync && signals.length === 0) return;
      inFlight = true;
      try {
        if (forceFullSync) {
          await refreshRef.current(true);
        } else {
          try {
            await synchronizeRef.current(showId, signals);
          } finally {
            await refreshRef.current(false);
          }
        }
      } catch {
        /* non-fatal — next event or pull-to-refresh recovers */
      } finally {
        inFlight = false;
        if (pendingWhileInFlight || pendingFullRefresh || pendingSignals.length > 0) {
          pendingWhileInFlight = false;
          void runRefresh();
        }
      }
    };

    const nudge = (signal: ShowChangeSignal) => {
      if (
        signal.classIds &&
        signal.classIds.length > 0 &&
        watchedClassIds.size > 0 &&
        !signal.classIds.some(classId => watchedClassIds.has(classId))
      ) {
        return;
      }
      pendingSignals.push(signal);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void runRefresh(), DEBOUNCE_MS);
    };

    const unsubscribe = subscribeToShowChanges(showId, nudge);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      pendingFullRefresh = true;
      void runRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [classScopeKey, showId]);
}

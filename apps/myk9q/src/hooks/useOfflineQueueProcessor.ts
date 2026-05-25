/**
 * Offline Queue Processor Hook
 *
 * Monitors the offline queue and automatically processes pending items when online.
 * Handles retry logic with exponential backoff for failed items.
 *
 * Usage: Add to App.tsx to run globally:
 * ```tsx
 * useOfflineQueueProcessor();
 * ```
 */

import { useEffect, useRef, useCallback } from 'react';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { submitScore } from '../services/entryService';
import { logger } from '@/utils/logger';

export function useOfflineQueueProcessor() {
  const {
    queue,
    isOnline,
    isSyncing,
    getNextItemToSync,
    getNextRetryAt,
    markAsSyncing,
    markAsCompleted,
    markAsFailed,
    setOnlineStatus,
  } = useOfflineQueueStore();

  const processingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest-ref so the retry timer always invokes the current drain closure.
  const drainRef = useRef<() => void>(() => {});

  /**
   * Drain all currently eligible queue items. Backoff is owned by the store
   * (markAsFailed sets retryAt; getNextItemToSync gates on it), so this loop
   * never blocks on a slow item — each failure releases the loop and the
   * scheduler below re-pokes when the next retryAt elapses.
   */
  const processQueue = useCallback(async () => {
    while (true) {
      const item = getNextItemToSync();
      if (!item) break;

      markAsSyncing(item.id);
      try {
        await submitScore(
          item.entryId,
          item.scoreData,
          undefined, // pairedClassId
          item.classId
        );

        await markAsCompleted(item.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ Failed to sync score for entry ${item.entryId}:`, error);
        markAsFailed(item.id, errorMessage);
      }
    }
  }, [getNextItemToSync, markAsSyncing, markAsCompleted, markAsFailed]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setOnlineStatus(true);
    };

    const handleOffline = () => {
      setOnlineStatus(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial status
    setOnlineStatus(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnlineStatus]);

  // Self-rescheduling drain: process eligible items, then if any items are
  // still gated on backoff, set one timer for the earliest retryAt and recurse
  // when it fires. Idempotent — safe to invoke from the effect, the timer,
  // or directly. Consolidates to at most one active timer.
  const drainAndScheduleNext = useCallback(() => {
    if (processingRef.current) return;
    // Bail when offline — both timer-driven re-pokes AND the main effect
    // flow through here, so without this guard a backoff timer that fires
    // mid-outage would call submitScore, fail, increment retryCount, and
    // potentially exhaust retries purely because the user is offline.
    // When isOnline flips back to true, the main effect re-runs (isOnline
    // is a dep) and drainAndScheduleNext is called again.
    if (!useOfflineQueueStore.getState().isOnline) return;
    processingRef.current = true;
    processQueue().finally(() => {
      processingRef.current = false;

      if (retryTimerRef.current != null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      const nextRetryAt = getNextRetryAt();
      if (nextRetryAt == null) return;

      const delay = Math.max(0, nextRetryAt - Date.now());
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        drainRef.current();
      }, delay);
    });
  }, [processQueue, getNextRetryAt]);

  // Keep drainRef pointing at the latest drainAndScheduleNext so recursive
  // timer-callback invocations always run with current store closures.
  useEffect(() => {
    drainRef.current = drainAndScheduleNext;
  }, [drainAndScheduleNext]);

  // Process queue when online and items are pending.
  // The retry timer is intentionally NOT cleared in this effect's cleanup —
  // unrelated state changes (isSyncing flipping, queue churn) would otherwise
  // stomp a pending backoff timer between failure and re-attempt. Unmount
  // cleanup lives in the separate effect below.
  useEffect(() => {
    if (!isOnline || isSyncing) return;
    const hasPending = queue.some(item => item.status === 'pending');
    if (!hasPending) return;
    drainAndScheduleNext();
  }, [isOnline, queue, isSyncing, drainAndScheduleNext]);

  // Clean up any outstanding retry timer on unmount only.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current != null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  // Return queue stats for debugging
  return {
    queueLength: queue.length,
    pendingCount: queue.filter(item => item.status === 'pending').length,
    failedCount: queue.filter(item => item.status === 'failed').length,
    isOnline,
    isSyncing,
  };
}

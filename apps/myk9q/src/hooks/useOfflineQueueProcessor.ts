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
    markAsSyncing,
    markAsCompleted,
    markAsFailed,
    setOnlineStatus,
  } = useOfflineQueueStore();

  const processingRef = useRef(false);

  /**
   * Process all pending items in the queue
   */
  const processQueue = useCallback(async () => {
while (true) {
      // Get next pending item
      const item = getNextItemToSync();
      if (!item) {
break;
      }

      // Mark as syncing
      markAsSyncing(item.id);
try {
        // Submit score to server
        await submitScore(
          item.entryId,
          item.scoreData,
          undefined, // pairedClassId
          item.classId
        );

// Mark as completed (this removes from queue)
        await markAsCompleted(item.id);

        // Note: Real-time subscription will handle clearing pending change in LocalStateManager
        // This matches the online flow where we don't manually clear pending changes

      } catch (error) {
        logger.error(`❌ Failed to sync score for entry ${item.entryId}:`, error);

        // Check if we should retry
        if (item.retryCount < item.maxRetries) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          markAsFailed(item.id, errorMessage);
// Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, item.retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Max retries reached - keep in failed state
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          markAsFailed(item.id, errorMessage);
          logger.error(`❌ Max retries reached for entry ${item.entryId}, keeping in failed queue`);

          // Move to next item instead of blocking entire queue
          continue;
        }
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

  // Process queue when online and items are pending
  useEffect(() => {
    // Don't process if offline, already processing, or no pending items
    if (!isOnline || processingRef.current || isSyncing) {
      return;
    }

    const hasPending = queue.some(item => item.status === 'pending');
    if (!hasPending) {
      return;
    }

    // Start processing queue
    processingRef.current = true;
    processQueue().finally(() => {
      processingRef.current = false;
    });
  }, [isOnline, queue, isSyncing, processQueue]);

  // Return queue stats for debugging
  return {
    queueLength: queue.length,
    pendingCount: queue.filter(item => item.status === 'pending').length,
    failedCount: queue.filter(item => item.status === 'failed').length,
    isOnline,
    isSyncing,
  };
}

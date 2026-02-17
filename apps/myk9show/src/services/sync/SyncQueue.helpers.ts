/**
 * Sync Queue Helpers
 * Pure functions extracted from SyncQueue.ts for maintainability
 */

import { logger } from '@/services/LoggingService';
import type { SyncQueueItem } from '../../types/sync-types';
import type { QueueMetrics, QueueStats } from './SyncQueue.types';

/**
 * Compare two queue items by priority (descending) then scheduled time (ascending).
 * Used for sorting the queue so highest-priority, earliest-scheduled items come first.
 */
export function compareQueueItems(a: SyncQueueItem, b: SyncQueueItem): number {
  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }
  return a.scheduledFor.getTime() - b.scheduledFor.getTime();
}

/**
 * Find a duplicate item in the queue matching entity type, entity ID, and action type,
 * that is still pending or processing.
 */
export function findDuplicateItem(
  queue: SyncQueueItem[],
  newItem: SyncQueueItem
): SyncQueueItem | null {
  return (
    queue.find(
      item =>
        item.entityType === newItem.entityType &&
        item.entityId === newItem.entityId &&
        item.actionType === newItem.actionType &&
        (item.status === 'pending' || item.status === 'processing')
    ) || null
  );
}

/**
 * Calculate queue statistics from the current queue items.
 */
export function calculateQueueStats(queue: SyncQueueItem[]): QueueStats {
  return queue.reduce(
    (acc, item) => {
      acc.totalItems++;

      switch (item.status) {
        case 'pending':
          acc.pendingItems++;
          break;
        case 'processing':
          acc.processingItems++;
          break;
        case 'completed':
          acc.completedItems++;
          break;
        case 'failed':
          acc.failedItems++;
          break;
      }

      if (item.priority >= 7) {
        acc.highPriorityItems++;
      } else if (item.priority >= 4) {
        acc.mediumPriorityItems++;
      } else {
        acc.lowPriorityItems++;
      }

      return acc;
    },
    {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      highPriorityItems: 0,
      mediumPriorityItems: 0,
      lowPriorityItems: 0,
    }
  );
}

/**
 * Deserialize a raw storage record into a SyncQueueItem with proper Date objects.
 */
export function deserializeQueueItem(item: Record<string, unknown>): SyncQueueItem {
  return {
    ...item,
    timestamp: new Date(item.timestamp as string),
    scheduledFor: new Date((item.scheduledFor as string) || (item.timestamp as string)),
    processedAt: item.processedAt ? new Date(item.processedAt as string) : undefined,
    retries: (item.retries as number) || (item.retryCount as number) || 0,
    retryCount: (item.retryCount as number) || (item.retries as number) || 0,
  } as SyncQueueItem;
}

/**
 * Generate a unique queue item ID.
 */
export function generateQueueItemId(): string {
  return `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load persisted queue data from localStorage.
 * Returns null if no data is found or if parsing fails.
 */
export function loadQueueFromStorage(
  storageKey: string
): { queue: SyncQueueItem[]; metrics: Partial<QueueMetrics> } | null {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;

    const data = JSON.parse(stored);
    const queue: SyncQueueItem[] =
      data.queue?.map((item: Record<string, unknown>) => deserializeQueueItem(item)) || [];

    // Reset processing status for items that were being processed when the app closed
    queue.forEach(item => {
      if (item.status === 'processing') {
        item.status = 'pending';
      }
    });

    queue.sort(compareQueueItems);
    logger.info('Loaded sync items from storage', 'sync', { count: queue.length });

    return { queue, metrics: data.metrics || {} };
  } catch (error) {
    logger.error('Failed to load sync queue from storage', 'sync', {}, error as Error);
    return null;
  }
}

/**
 * Save queue data to localStorage.
 */
export function saveQueueToStorage(
  storageKey: string,
  queue: SyncQueueItem[],
  metrics: QueueMetrics
): void {
  try {
    const data = {
      queue,
      metrics,
      timestamp: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch (error) {
    logger.error('Failed to save sync queue to storage', 'sync', {}, error as Error);
  }
}

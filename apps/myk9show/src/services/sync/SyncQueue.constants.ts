/**
 * Sync Queue Constants
 * Extracted from SyncQueue.ts for maintainability
 */

import type { SyncQueueConfig, QueueMetrics } from './SyncQueue.types';

/** Default configuration for the SyncQueue */
export const DEFAULT_SYNC_QUEUE_CONFIG: SyncQueueConfig = {
  maxQueueSize: 1000,
  batchSize: 10,
  retryAttempts: 5,
  retryDelay: 1000,
  priorityLevels: 10,
  persistenceEnabled: true,
  compressionEnabled: true,
  deduplicationEnabled: true,
};

/** localStorage key for persisted queue data */
export const SYNC_QUEUE_STORAGE_KEY = 'myK9Show_sync_queue';

/** Interval (ms) between queue processing cycles */
export const QUEUE_PROCESSING_INTERVAL = 5000;

/** Delay (ms) for permanently failed items before next retry */
export const PERMANENT_FAILURE_RETRY_DELAY = 24 * 60 * 60 * 1000; // 24 hours

/** Maximum delay (ms) for exponential backoff retries */
export const MAX_RETRY_BACKOFF_DELAY = 60000; // 1 minute

/** Create a fresh set of queue metrics with all counters at zero */
export function createInitialMetrics(): QueueMetrics {
  return {
    queueSize: 0,
    itemsProcessed: 0,
    itemsFailed: 0,
    averageProcessingTime: 0,
    lastProcessedAt: null,
    priorityDistribution: {},
    retryStats: {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
    },
  };
}

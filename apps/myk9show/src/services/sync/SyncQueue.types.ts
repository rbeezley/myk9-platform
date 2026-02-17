/**
 * Sync Queue Types
 * Extracted from SyncQueue.ts for maintainability
 */

export interface SyncQueueConfig {
  maxQueueSize: number;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
  priorityLevels: number;
  persistenceEnabled: boolean;
  compressionEnabled: boolean;
  deduplicationEnabled: boolean;
}

export interface QueueMetrics {
  queueSize: number;
  itemsProcessed: number;
  itemsFailed: number;
  averageProcessingTime: number;
  lastProcessedAt: Date | null;
  priorityDistribution: Record<number, number>;
  retryStats: {
    totalRetries: number;
    successfulRetries: number;
    failedRetries: number;
  };
}

export interface QueueStats {
  totalItems: number;
  pendingItems: number;
  processingItems: number;
  completedItems: number;
  failedItems: number;
  highPriorityItems: number;
  mediumPriorityItems: number;
  lowPriorityItems: number;
}

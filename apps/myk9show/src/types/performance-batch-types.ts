/**
 * Batch processing types for sync operation management
 * Phase 5.1.4: Batch Processing Configuration
 */

import type { SyncPriority } from './performance-sync-types';
import type { SyncConflict } from './performance-delta-types';

/**
 * Configuration for batch processing
 * Optimizes sync operations by grouping changes
 */
export interface BatchProcessingConfig {
  /** Maximum number of operations in a batch */
  maxBatchSize: number;

  /** Maximum time to wait before processing batch (ms) */
  maxWaitTime: number;

  /** Maximum payload size for a batch (bytes) */
  maxPayloadSize: number;

  /** Group operations by type for better performance */
  groupByOperation: boolean;

  /** Enable parallel processing of independent batches */
  parallelProcessing: boolean;

  /** Maximum number of parallel batches */
  maxParallelBatches: number;

  /** Retry configuration for failed batches */
  retry: BatchRetryConfig;
}

/**
 * Retry configuration for batch operations
 */
export interface BatchRetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;

  /** Initial delay between retries (ms) */
  initialDelay: number;

  /** Backoff multiplier for subsequent retries */
  backoffMultiplier: number;

  /** Maximum delay between retries (ms) */
  maxDelay: number;

  /** Retry only specific error types */
  retryableErrors?: string[];
}

/** Status of sync operations */
export enum SyncStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/** Sync operation interface */
export interface SyncOperation {
  /** Unique identifier for the operation */
  id: string;

  /** Type of entity being synced */
  entityType: string;

  /** Specific entity ID */
  entityId: string;

  /** Operation type */
  action: 'create' | 'update' | 'delete' | 'move';

  /** Data payload for the operation */
  data: unknown;

  /** Operation priority */
  priority: SyncPriority;

  /** Timestamp when operation was created */
  timestamp: Date;

  /** Current status of the operation */
  status: SyncStatus;

  /** Operation metadata */
  metadata?: {
    source?: string;
    version?: number;
    lastSync?: Date;
    isDelta?: boolean;
    originalSize?: number;
    deltaSize?: number;
    compressed?: boolean;
    compressionRatio?: number;
    [key: string]: unknown;
  };
}

/** Configuration for batch processing */
export interface BatchConfig {
  /** Maximum batch size */
  maxBatchSize: number;

  /** Minimum batch size */
  minBatchSize: number;

  /** Maximum parallel batches */
  maxParallelBatches: number;

  /** Batch timeout in milliseconds */
  batchTimeout: number;

  /** Enable adaptive batch sizing */
  adaptiveSizing: boolean;

  /** Enable priority-based queuing */
  priorityQueuing: boolean;
}

/** Queue item for batch processing */
export interface BatchQueueItem {
  /** Unique identifier */
  id: string;

  /** Operations in this batch */
  operations: SyncOperation[];

  /** Entity type for this batch */
  entityType: string;

  /** Batch priority */
  priority: SyncPriority;

  /** Current retry count */
  retryCount: number;

  /** When the batch was created */
  createdAt: Date;

  /** Size of the batch in bytes */
  size: number;

  /** Last error message if any */
  lastError?: string;

  /** When to retry next */
  nextRetryAt?: Date;
}

/** Result of batch processing */
export interface BatchResult {
  /** Batch identifier */
  batchId: string;

  /** Successfully processed operations */
  successful: Array<{
    operation: SyncOperation;
    result: unknown;
  }>;

  /** Failed operations */
  failed: Array<{
    operation: SyncOperation;
    error: Error;
    timestamp: Date;
  }>;

  /** Conflicts encountered */
  conflicts: SyncConflict[];

  /** Processing metrics */
  metrics: BatchMetrics;
}

/** Metrics for batch processing */
export interface BatchMetrics {
  /** Total operations in batch */
  totalOperations: number;

  /** Successfully processed count */
  successCount: number;

  /** Failed operation count */
  failureCount: number;

  /** Conflict count */
  conflictCount: number;

  /** Total processing time in ms */
  processingTime: number;

  /** Operations per second */
  throughput: number;

  /** Compression ratio achieved */
  compressionRatio: number;

  /** Number of retries */
  retryCount: number;
}

/** Processing strategy configuration */
export interface ProcessingStrategy {
  /** Strategy type */
  type: 'sequential' | 'parallel' | 'adaptive';

  /** Concurrency level for parallel processing */
  concurrency?: number;

  /** Adaptive parameters */
  adaptive?: {
    minConcurrency: number;
    maxConcurrency: number;
    adjustmentFactor: number;
  };
}

/** Retry configuration */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;

  /** Initial delay between retries (ms) */
  initialDelay: number;

  /** Maximum delay between retries (ms) */
  maxDelay: number;

  /** Backoff multiplier */
  backoffMultiplier: number;

  /** Errors that should trigger retry */
  retryableErrors?: string[];
}

/** Options for batch processing */
export interface BatchProcessingOptions {
  /** Processing strategy to use */
  strategy?: ProcessingStrategy;

  /** Custom retry configuration */
  retryConfig?: RetryConfig;

  /** Enable differential sync */
  enableDeltaSync?: boolean;

  /** Enable compression */
  enableCompression?: boolean;

  /** Performance thresholds */
  performanceThresholds?: {
    maxLatency: number;
    minThroughput: number;
    maxErrorRate: number;
  };
}

/**
 * Batch Processor Types
 *
 * Type definitions for the BatchProcessor service.
 */

import type {
  RetryConfig,
  SyncPriority,
  SyncOperation,
  BatchQueueItem,
} from '@/types/performance-types';

export interface BatchProcessorConfig {
  maxBatchSize: number;
  minBatchSize: number;
  maxParallelBatches: number;
  batchTimeout: number;
  adaptiveSizing: boolean;
  priorityQueuing: boolean;
  retryConfig: RetryConfig;
  performanceThresholds: {
    maxLatency: number;
    minThroughput: number;
    maxErrorRate: number;
  };
}

export interface BatchGroup {
  id: string;
  entityType: string;
  priority: SyncPriority;
  operations: SyncOperation[];
  size: number;
  createdAt: Date;
}

export interface ProcessingMetrics {
  processedCount: number;
  failedCount: number;
  totalLatency: number;
  throughput: number;
  errorRate: number;
  lastProcessedAt: Date;
}

export interface ChunkResult {
  successful: Array<{ operation: SyncOperation; result: unknown }>;
  failed: Array<{ operation: SyncOperation; error: Error; timestamp: Date }>;
  conflicts: import('@/types/performance-types').SyncConflict[];
}

export interface CompressBatchResult {
  operations: SyncOperation[];
  compressionRatio: number;
}

export interface DeltaResult {
  hasChanges: boolean;
  changes: unknown;
  originalSize: number;
  deltaSize: number;
}

export interface CompressionResult {
  compressedData: Uint8Array;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/** Converts a BatchQueueItem into a BatchGroup for active processing */
export function toBatchGroup(item: BatchQueueItem): BatchGroup {
  return {
    id: item.id,
    entityType: item.entityType,
    priority: item.priority,
    operations: item.operations,
    size: item.size,
    createdAt: item.createdAt,
  };
}

/**
 * Batch Processor Helpers
 *
 * Pure helper functions, mock services, and utility operations for the
 * BatchProcessor service.
 */

import type {
  SyncOperation,
  SyncPriority,
  BatchResult,
  BatchMetrics,
  BatchQueueItem,
} from '@/types/performance-types';
import { SyncPriority as SyncPriorityEnum } from '@/types/performance-types';
import type {
  BatchProcessorConfig,
  ProcessingMetrics,
  ChunkResult,
  CompressBatchResult,
  DeltaResult,
  CompressionResult,
} from './BatchProcessor.types';

// ========================================================================
// Mock Services (for integration demo)
// ========================================================================

export class MockDifferentialSyncService {
  async computeDelta(_entityType: string, _entityId: string, data: unknown): Promise<DeltaResult> {
    return {
      hasChanges: true,
      changes: data,
      originalSize: JSON.stringify(data).length,
      deltaSize: JSON.stringify(data).length * 0.3,
    };
  }
}

export class MockCompressionService {
  async compress(data: Uint8Array): Promise<CompressionResult> {
    return {
      compressedData: data,
      originalSize: data.length,
      compressedSize: data.length * 0.4,
      compressionRatio: 2.5,
    };
  }
}

// ========================================================================
// Priority Utilities
// ========================================================================

/** Get a numeric weight for a sync priority */
export function getPriorityWeight(priority: SyncPriority): number {
  switch (priority) {
    case SyncPriorityEnum.CRITICAL:
      return 5;
    case SyncPriorityEnum.HIGH:
      return 4;
    case SyncPriorityEnum.NORMAL:
      return 3;
    case SyncPriorityEnum.LOW:
      return 2;
    case SyncPriorityEnum.BACKGROUND:
      return 1;
    default:
      return 0;
  }
}

/** Calculate the average priority of a set of operations and return the corresponding SyncPriority */
export function calculateBatchPriority(operations: SyncOperation[]): SyncPriority {
  const priorities = operations.map(op => getPriorityWeight(op.priority));
  const avgPriority = priorities.reduce((a, b) => a + b, 0) / priorities.length;

  if (avgPriority >= 3) return SyncPriorityEnum.CRITICAL;
  if (avgPriority >= 2) return SyncPriorityEnum.HIGH;
  if (avgPriority >= 1) return SyncPriorityEnum.NORMAL;
  return SyncPriorityEnum.LOW;
}

// ========================================================================
// Batch Size / Grouping Utilities
// ========================================================================

/** Calculate the total JSON byte size of a set of operations */
export function calculateBatchSize(operations: SyncOperation[]): number {
  return operations.reduce((total, op) => {
    const size = JSON.stringify(op.data).length;
    return total + size;
  }, 0);
}

/** Generate a unique batch ID */
export function generateBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** Group operations by entity type */
export function groupOperationsByEntity(operations: SyncOperation[]): Map<string, SyncOperation[]> {
  const grouped = new Map<string, SyncOperation[]>();

  for (const op of operations) {
    const existing = grouped.get(op.entityType) || [];
    existing.push(op);
    grouped.set(op.entityType, existing);
  }

  return grouped;
}

/** Create optimal batches sorted by priority then timestamp */
export function createOptimalBatches(
  operations: SyncOperation[],
  batchSize: number
): SyncOperation[][] {
  const batches: SyncOperation[][] = [];

  const sorted = [...operations].sort((a, b) => {
    if (a.priority !== b.priority) {
      return getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    }
    return a.timestamp.getTime() - b.timestamp.getTime();
  });

  for (let i = 0; i < sorted.length; i += batchSize) {
    batches.push(sorted.slice(i, i + batchSize));
  }

  return batches;
}

/** Split operations into parallel processing chunks */
export function createProcessingChunks(
  operations: SyncOperation[],
  maxParallelBatches: number
): SyncOperation[][] {
  const chunkSize = Math.ceil(operations.length / maxParallelBatches);
  const chunks: SyncOperation[][] = [];

  for (let i = 0; i < operations.length; i += chunkSize) {
    chunks.push(operations.slice(i, i + chunkSize));
  }

  return chunks;
}

// ========================================================================
// Differential Sync & Compression
// ========================================================================

/** Apply differential sync optimization to operations */
export async function applyDifferentialSync(
  operations: SyncOperation[],
  diffService: MockDifferentialSyncService
): Promise<SyncOperation[]> {
  const optimized: SyncOperation[] = [];

  for (const op of operations) {
    const delta = await diffService.computeDelta(op.entityType, op.entityId, op.data);

    if (delta.hasChanges) {
      optimized.push({
        ...op,
        data: delta.changes,
        metadata: {
          ...op.metadata,
          isDelta: true,
          originalSize: delta.originalSize,
          deltaSize: delta.deltaSize,
        },
      });
    }
  }

  return optimized;
}

/** Compress batch data and annotate operations if beneficial */
export async function compressBatch(
  operations: SyncOperation[],
  compressionService: MockCompressionService
): Promise<CompressBatchResult> {
  const batchData = JSON.stringify(operations);
  const compressed = await compressionService.compress(new TextEncoder().encode(batchData));

  const compressionRatio = compressed.originalSize / compressed.compressedSize;

  if (compressionRatio > 1.2) {
    return {
      operations: operations.map(op => ({
        ...op,
        metadata: { ...op.metadata, compressed: true, compressionRatio },
      })),
      compressionRatio,
    };
  }

  return { operations, compressionRatio: 1 };
}

// ========================================================================
// Chunk Processing
// ========================================================================

/** Process a chunk of operations (simulated) */
export async function processChunk(operations: SyncOperation[]): Promise<ChunkResult> {
  const results: ChunkResult = {
    successful: [],
    failed: [],
    conflicts: [],
  };

  await Promise.all(
    operations.map(async op => {
      try {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

        if (Math.random() < 0.05) {
          results.conflicts.push({
            id: `conflict-${op.id}`,
            entityType: op.entityType,
            entityId: op.entityId,
            localVersion: op.data,
            remoteVersion: {
              ...(op.data as Record<string, unknown>),
              _conflicted: true,
            },
            baseVersion: op.data,
            conflictingFields: ['name', 'updatedAt'],
            timestamp: Date.now(),
            detectedAt: new Date(),
            status: 'pending',
            resolution: 'pending',
          });
        } else {
          results.successful.push({
            operation: op,
            result: { id: op.id, success: true },
          });
        }
      } catch (error) {
        results.failed.push({
          operation: op,
          error: error as Error,
          timestamp: new Date(),
        });
      }
    })
  );

  return results;
}

// ========================================================================
// Metrics & Adaptive Sizing
// ========================================================================

/** Update processing metrics for a given entity type */
export function updateProcessingMetrics(
  metricsMap: Map<string, ProcessingMetrics>,
  entityType: string,
  result: BatchResult
): void {
  const existing = metricsMap.get(entityType) || {
    processedCount: 0,
    failedCount: 0,
    totalLatency: 0,
    throughput: 0,
    errorRate: 0,
    lastProcessedAt: new Date(),
  };

  const total = existing.processedCount + result.metrics.totalOperations;
  const failed = existing.failedCount + result.metrics.failureCount;

  metricsMap.set(entityType, {
    processedCount: total,
    failedCount: failed,
    totalLatency: existing.totalLatency + result.metrics.processingTime,
    throughput: result.metrics.throughput,
    errorRate: failed / total,
    lastProcessedAt: new Date(),
  });
}

/** Compute an adaptive batch size based on performance metrics */
export function computeAdaptiveBatchSize(
  currentBatchSize: number,
  adjustmentFactor: number,
  metrics: BatchMetrics,
  config: BatchProcessorConfig
): { newBatchSize: number; newAdjustmentFactor: number } {
  const { processingTime, throughput } = metrics;
  const { maxLatency, minThroughput } = config.performanceThresholds;

  let adjustment = 1.0;

  if (processingTime > maxLatency) {
    adjustment *= 0.9;
  } else if (processingTime < maxLatency * 0.5) {
    adjustment *= 1.1;
  }

  if (throughput < minThroughput) {
    adjustment *= 0.9;
  } else if (throughput > minThroughput * 2) {
    adjustment *= 1.1;
  }

  const newAdjustmentFactor = 0.7 * adjustmentFactor + 0.3 * adjustment;
  const newBatchSize = Math.floor(
    Math.max(
      config.minBatchSize,
      Math.min(config.maxBatchSize, currentBatchSize * newAdjustmentFactor)
    )
  );

  return { newBatchSize, newAdjustmentFactor };
}

/** Get the adaptive batch size for an entity type based on its performance */
export function getAdaptiveBatchSize(
  entityType: string,
  currentBatchSize: number,
  config: BatchProcessorConfig,
  metricsMap: Map<string, ProcessingMetrics>
): number {
  if (!config.adaptiveSizing) return currentBatchSize;

  const metrics = metricsMap.get(entityType);
  if (!metrics) return currentBatchSize;

  const { throughput, errorRate } = metrics;
  const { minThroughput, maxErrorRate } = config.performanceThresholds;

  if (throughput < minThroughput || errorRate > maxErrorRate) {
    return Math.max(config.minBatchSize, Math.floor(currentBatchSize * 0.8));
  } else if (errorRate < maxErrorRate * 0.5 && throughput > minThroughput * 1.5) {
    return Math.min(config.maxBatchSize, Math.floor(currentBatchSize * 1.2));
  }

  return currentBatchSize;
}

// ========================================================================
// Queue Management
// ========================================================================

/** Get the next batch from priority queues with starvation prevention */
export function getNextFromPriorityQueues(
  priorityQueues: Map<SyncPriority, BatchQueueItem[]>,
  lastProcessedPriority: Map<SyncPriority, Date>
): BatchQueueItem | null {
  const now = new Date();

  // Starvation prevention: process lower priorities if starved
  for (const [priority, queue] of priorityQueues) {
    const lastProcessed = lastProcessedPriority.get(priority);
    const timeSinceLastProcessed = lastProcessed
      ? now.getTime() - lastProcessed.getTime()
      : Infinity;

    if (timeSinceLastProcessed > 60000 && queue.length > 0) {
      const item = queue.shift()!;
      lastProcessedPriority.set(priority, now);
      return item;
    }
  }

  // Normal priority processing
  for (const priority of [
    SyncPriorityEnum.CRITICAL,
    SyncPriorityEnum.HIGH,
    SyncPriorityEnum.NORMAL,
    SyncPriorityEnum.LOW,
    SyncPriorityEnum.BACKGROUND,
  ]) {
    const queue = priorityQueues.get(priority) || [];
    if (queue.length > 0) {
      const item = queue.shift()!;
      lastProcessedPriority.set(priority, now);
      return item;
    }
  }

  return null;
}

/**
 * Batch Processor
 *
 * Intelligent batch processing for sync operations with adaptive sizing,
 * priority queuing, differential sync, compression, and retry logic.
 */

import { EventEmitter } from 'events';
import { logger } from '@/services/LoggingService';
import {
  SyncOperation,
  SyncPriority,
  PerformanceMetrics,
  BatchResult,
  BatchQueueItem,
} from '@/types/performance-types';

import type { BatchProcessorConfig, BatchGroup, ProcessingMetrics } from './BatchProcessor.types';
import { toBatchGroup } from './BatchProcessor.types';
import { DEFAULT_BATCH_CONFIG } from './BatchProcessor.constants';
import {
  MockDifferentialSyncService,
  MockCompressionService,
  calculateBatchPriority,
  calculateBatchSize,
  generateBatchId,
  groupOperationsByEntity,
  createOptimalBatches,
  createProcessingChunks,
  applyDifferentialSync,
  compressBatch,
  processChunk,
  updateProcessingMetrics,
  computeAdaptiveBatchSize,
  getAdaptiveBatchSize,
  getNextFromPriorityQueues,
} from './BatchProcessor.helpers';

export class BatchProcessor extends EventEmitter {
  private config: BatchProcessorConfig;
  private differentialSync: MockDifferentialSyncService;
  private compressionService: MockCompressionService;

  // Processing state
  private processingQueue: Map<string, BatchQueueItem>;
  private activeBatches: Map<string, BatchGroup>;
  private processingMetrics: Map<string, ProcessingMetrics>;
  private isProcessing: boolean;
  private processingInterval?: NodeJS.Timeout;

  // Adaptive sizing state
  private currentBatchSize: number;
  private performanceHistory: PerformanceMetrics[];
  private adaptiveAdjustmentFactor: number;

  // Priority queue implementation
  private priorityQueues: Map<SyncPriority, BatchQueueItem[]>;
  private lastProcessedPriority: Map<SyncPriority, Date>;

  constructor(config: Partial<BatchProcessorConfig> = {}) {
    super();

    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
    this.differentialSync = new MockDifferentialSyncService();
    this.compressionService = new MockCompressionService();

    this.processingQueue = new Map();
    this.activeBatches = new Map();
    this.processingMetrics = new Map();
    this.isProcessing = false;

    this.currentBatchSize = Math.floor((this.config.maxBatchSize + this.config.minBatchSize) / 2);
    this.performanceHistory = [];
    this.adaptiveAdjustmentFactor = 1.0;

    this.priorityQueues = new Map([
      [SyncPriority.CRITICAL, []],
      [SyncPriority.HIGH, []],
      [SyncPriority.NORMAL, []],
      [SyncPriority.LOW, []],
      [SyncPriority.BACKGROUND, []],
    ]);
    this.lastProcessedPriority = new Map();
  }

  /** Queue operations for batch processing */
  async queueOperations(operations: SyncOperation[]): Promise<void> {
    const grouped = groupOperationsByEntity(operations);

    for (const [entityType, ops] of grouped) {
      const batchSize = getAdaptiveBatchSize(
        entityType,
        this.currentBatchSize,
        this.config,
        this.processingMetrics
      );
      const batches = createOptimalBatches(ops, batchSize);

      for (const batch of batches) {
        const queueItem: BatchQueueItem = {
          id: generateBatchId(),
          operations: batch,
          entityType,
          priority: calculateBatchPriority(batch),
          retryCount: 0,
          createdAt: new Date(),
          size: calculateBatchSize(batch),
        };

        this.addToQueue(queueItem);
      }
    }

    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  /** Start batch processing */
  private startProcessing(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processNextBatch().catch(error => {
        logger.error('Batch processing error:', 'sync', {}, error as Error);
      });
    }, 100);

    this.emit('processing:started');
  }

  /** Stop batch processing */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.isProcessing = false;
    this.emit('processing:stopped');
  }

  /** Process the next batch in the queue */
  private async processNextBatch(): Promise<void> {
    if (this.activeBatches.size >= this.config.maxParallelBatches) return;

    const nextBatch = this.getNextBatchFromQueue();
    if (!nextBatch) {
      if (this.processingQueue.size === 0 && this.activeBatches.size === 0) {
        this.stopProcessing();
      }
      return;
    }

    const batchGroup = toBatchGroup(nextBatch);
    this.activeBatches.set(batchGroup.id, batchGroup);
    this.processingQueue.delete(nextBatch.id);

    try {
      await this.processBatch(batchGroup);
    } catch (error) {
      await this.handleBatchError(batchGroup, error as Error, nextBatch);
    } finally {
      this.activeBatches.delete(batchGroup.id);
    }
  }

  /** Process a single batch */
  private async processBatch(batch: BatchGroup): Promise<BatchResult> {
    const startTime = Date.now();
    const results: BatchResult = {
      batchId: batch.id,
      successful: [],
      failed: [],
      conflicts: [],
      metrics: {
        totalOperations: batch.operations.length,
        successCount: 0,
        failureCount: 0,
        conflictCount: 0,
        processingTime: 0,
        throughput: 0,
        compressionRatio: 0,
        retryCount: 0,
      },
    };

    try {
      const optimizedOps = await applyDifferentialSync(batch.operations, this.differentialSync);
      const compressed = await compressBatch(optimizedOps, this.compressionService);
      results.metrics.compressionRatio = compressed.compressionRatio;

      const chunks = createProcessingChunks(optimizedOps, this.config.maxParallelBatches);
      const chunkResults = await Promise.allSettled(chunks.map(chunk => processChunk(chunk)));

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.successful.push(...result.value.successful);
          results.failed.push(...result.value.failed);
          results.conflicts.push(...result.value.conflicts);
        } else {
          results.failed.push({
            operation: { id: 'chunk-error' } as SyncOperation,
            error: result.reason,
            timestamp: new Date(),
          });
        }
      }

      results.metrics.successCount = results.successful.length;
      results.metrics.failureCount = results.failed.length;
      results.metrics.conflictCount = results.conflicts.length;
      results.metrics.processingTime = Date.now() - startTime;
      results.metrics.throughput =
        (results.metrics.successCount / results.metrics.processingTime) * 1000;

      updateProcessingMetrics(this.processingMetrics, batch.entityType, results);

      if (this.config.adaptiveSizing) {
        const { newBatchSize, newAdjustmentFactor } = computeAdaptiveBatchSize(
          this.currentBatchSize,
          this.adaptiveAdjustmentFactor,
          results.metrics,
          this.config
        );
        this.currentBatchSize = newBatchSize;
        this.adaptiveAdjustmentFactor = newAdjustmentFactor;
      }

      this.emit('batch:processed', results);
      return results;
    } catch (error) {
      this.emit('batch:error', { batch, error });
      throw error;
    }
  }

  /** Handle batch processing errors with retry logic */
  private async handleBatchError(
    batch: BatchGroup,
    error: Error,
    originalItem: BatchQueueItem
  ): Promise<void> {
    const { maxRetries, initialDelay, maxDelay, backoffMultiplier } = this.config.retryConfig;

    if (originalItem.retryCount < maxRetries) {
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, originalItem.retryCount),
        maxDelay
      );

      setTimeout(() => {
        const retryItem: BatchQueueItem = {
          ...originalItem,
          retryCount: originalItem.retryCount + 1,
          lastError: error.message,
          nextRetryAt: new Date(Date.now() + delay),
        };

        this.addToQueue(retryItem);
        this.emit('batch:retry', {
          batch,
          retryCount: retryItem.retryCount,
          delay,
        });
      }, delay);
    } else {
      this.emit('batch:failed', { batch, error, finalFailure: true });
    }
  }

  /** Add item to priority queue */
  private addToQueue(item: BatchQueueItem): void {
    this.processingQueue.set(item.id, item);

    if (this.config.priorityQueuing) {
      const queue = this.priorityQueues.get(item.priority) || [];
      queue.push(item);
      this.priorityQueues.set(item.priority, queue);
    }
  }

  /** Get next batch from queue (priority or FIFO) */
  private getNextBatchFromQueue(): BatchQueueItem | null {
    if (!this.config.priorityQueuing) {
      const [, firstItem] = this.processingQueue.entries().next().value || [];
      return firstItem || null;
    }

    return getNextFromPriorityQueues(this.priorityQueues, this.lastProcessedPriority);
  }

  /** Get current batch processing metrics */
  getMetrics(): {
    queueSize: number;
    activeBatches: number;
    currentBatchSize: number;
    processingMetrics: Map<string, ProcessingMetrics>;
    priorityQueueSizes: Record<SyncPriority, number>;
  } {
    return {
      queueSize: this.processingQueue.size,
      activeBatches: this.activeBatches.size,
      currentBatchSize: this.currentBatchSize,
      processingMetrics: new Map(this.processingMetrics),
      priorityQueueSizes: {
        [SyncPriority.CRITICAL]: this.priorityQueues.get(SyncPriority.CRITICAL)?.length || 0,
        [SyncPriority.HIGH]: this.priorityQueues.get(SyncPriority.HIGH)?.length || 0,
        [SyncPriority.NORMAL]: this.priorityQueues.get(SyncPriority.NORMAL)?.length || 0,
        [SyncPriority.LOW]: this.priorityQueues.get(SyncPriority.LOW)?.length || 0,
        [SyncPriority.BACKGROUND]: this.priorityQueues.get(SyncPriority.BACKGROUND)?.length || 0,
      },
    };
  }

  /** Clear all queues and reset state */
  reset(): void {
    this.stopProcessing();
    this.processingQueue.clear();
    this.activeBatches.clear();
    this.processingMetrics.clear();
    this.performanceHistory = [];
    this.currentBatchSize = Math.floor((this.config.maxBatchSize + this.config.minBatchSize) / 2);
    this.adaptiveAdjustmentFactor = 1.0;

    for (const queue of this.priorityQueues.values()) {
      queue.length = 0;
    }

    this.emit('processor:reset');
  }
}

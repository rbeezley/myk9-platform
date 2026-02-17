/**
 * Sync Queue Implementation
 * Phase 6.3: Sync & Offline Systems
 *
 * Advanced sync queue with priority management, batching, and intelligent retry logic
 * for robust offline-first architecture.
 */

import { logger } from '@/services/LoggingService';
import { errorMonitor } from '../../lib/errorMonitoring';
import { BackoffCalculator } from '../../lib/connectionRecovery';
import { eventEmitter } from './eventEmitter';
import type { SyncQueueItem } from '../../types/sync-types';
import type { SyncProcessor, SyncProcessorResult } from './types/processor';
import type { SyncQueueConfig, QueueMetrics, QueueStats } from './SyncQueue.types';
import {
  DEFAULT_SYNC_QUEUE_CONFIG,
  SYNC_QUEUE_STORAGE_KEY,
  QUEUE_PROCESSING_INTERVAL,
  PERMANENT_FAILURE_RETRY_DELAY,
  MAX_RETRY_BACKOFF_DELAY,
  createInitialMetrics,
} from './SyncQueue.constants';
import {
  compareQueueItems,
  findDuplicateItem,
  calculateQueueStats,
  generateQueueItemId,
  loadQueueFromStorage,
  saveQueueToStorage,
} from './SyncQueue.helpers';

// Re-export types for backward compatibility
export type { SyncQueueConfig, QueueMetrics, QueueStats } from './SyncQueue.types';

/**
 * Advanced Sync Queue with Intelligent Processing
 */
export class SyncQueue {
  private queue: SyncQueueItem[] = [];
  private processingItems = new Set<string>();
  private config: SyncQueueConfig;
  private metrics: QueueMetrics;
  private storageKey = SYNC_QUEUE_STORAGE_KEY;
  private isProcessing = false;
  private processingTimer: NodeJS.Timeout | null = null;
  private retryTimers = new Map<string, NodeJS.Timeout>();
  private processors = new Map<string, SyncProcessor>();

  constructor(customConfig?: Partial<SyncQueueConfig>) {
    this.config = {
      ...DEFAULT_SYNC_QUEUE_CONFIG,
      ...customConfig,
    };

    this.metrics = createInitialMetrics();
    this.loadFromStorage();
    this.startProcessing();
  }

  /**
   * Add item to sync queue with intelligent priority and deduplication
   */
  enqueue(
    item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount' | 'status' | 'processedAt'>
  ): string {
    const now = new Date();
    const queueItem: SyncQueueItem = {
      id: generateQueueItemId(),
      timestamp: now,
      retryCount: 0,
      status: 'pending',
      processedAt: undefined,
      ...item,
      retries: item.retries || 0, // Add for backward compatibility
      scheduledFor: item.scheduledFor || now,
    };

    // Deduplication check
    if (this.config.deduplicationEnabled) {
      const duplicate = findDuplicateItem(this.queue, queueItem);
      if (duplicate) {
        logger.debug('Duplicate sync item detected, updating existing', 'sync', {
          itemId: duplicate.id,
        });
        this.updateItem(duplicate.id, queueItem);
        return duplicate.id;
      }
    }

    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      this.evictLowPriorityItems();
    }

    // Add to queue
    this.queue.push(queueItem);
    this.sortQueue();

    // Update metrics
    this.metrics.priorityDistribution[queueItem.priority] =
      (this.metrics.priorityDistribution[queueItem.priority] || 0) + 1;

    // Persist to storage
    if (this.config.persistenceEnabled) {
      this.saveToStorage();
    }

    logger.debug('Added sync item to queue', 'sync', {
      itemId: queueItem.id,
      priority: queueItem.priority,
    });
    return queueItem.id;
  }

  /**
   * Register a processor for a specific entity type.
   * Processors handle the actual sync logic for their entity types.
   */
  registerProcessor(processor: SyncProcessor): void {
    this.processors.set(processor.entityType, processor);
    logger.info('Registered sync processor', 'sync', { entityType: processor.entityType });
  }

  /**
   * Get the processor for a given entity type
   */
  getProcessor(entityType: string): SyncProcessor | undefined {
    return this.processors.get(entityType);
  }

  /**
   * Check if a processor is registered for the given entity type
   */
  hasProcessor(entityType: string): boolean {
    return this.processors.has(entityType);
  }

  /**
   * Get next batch of items to process
   */
  async dequeueBatch(): Promise<SyncQueueItem[]> {
    if (this.queue.length === 0) return [];

    // Get items that are not currently being processed
    const availableItems = this.queue.filter(
      item => item.status === 'pending' && !this.processingItems.has(item.id)
    );

    if (availableItems.length === 0) return [];

    // Sort by priority and get batch
    const batch = availableItems.sort(compareQueueItems).slice(0, this.config.batchSize);

    // Mark as processing
    batch.forEach(item => {
      item.status = 'processing';
      this.processingItems.add(item.id);
    });

    return batch;
  }

  /**
   * Get the next item to process (legacy compatibility)
   */
  async dequeue(): Promise<SyncQueueItem | null> {
    const batch = await this.dequeueBatch();
    return batch.length > 0 ? batch[0] : null;
  }

  /**
   * Mark item as completed and remove from queue
   */
  markCompleted(itemId: string): void {
    const index = this.queue.findIndex(item => item.id === itemId);
    if (index === -1) return;

    const item = this.queue[index];
    item.status = 'completed';
    item.processedAt = new Date();

    // Update metrics
    this.metrics.itemsProcessed++;
    const processingTime = Date.now() - item.timestamp.getTime();
    this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime + processingTime) / 2;
    this.metrics.lastProcessedAt = new Date();

    // Remove from processing set and queue
    this.processingItems.delete(itemId);
    this.queue.splice(index, 1);

    // Clear retry timer if exists
    const retryTimer = this.retryTimers.get(itemId);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(itemId);
    }

    // Emit completion event
    eventEmitter.emit('sync:operation-completed', {
      operation: item,
      processingTime,
      timestamp: Date.now(),
    });

    logger.debug('Sync item completed', 'sync', { itemId });

    if (this.config.persistenceEnabled) {
      this.saveToStorage();
    }
  }

  /**
   * Mark item as failed and schedule retry
   */
  markFailed(itemId: string, error: Error): void {
    const item = this.queue.find(item => item.id === itemId);
    if (!item) return;

    item.status = 'failed';
    item.lastError = error.message;
    item.retryCount++;
    item.retries++; // Update both fields for backward compatibility
    this.processingItems.delete(itemId);

    // Update metrics
    this.metrics.itemsFailed++;
    this.metrics.retryStats.totalRetries++;

    // Log error
    errorMonitor.captureError(error, {
      additionalData: {
        syncItemId: itemId,
        retryCount: item.retryCount,
        entityType: item.entityType,
        actionType: item.actionType,
      },
    });

    // Schedule retry if under limit
    if (item.retryCount < this.config.retryAttempts) {
      this.scheduleRetry(item);
    } else {
      logger.error('Sync item failed permanently', 'sync', { itemId, retryCount: item.retryCount });
      // Keep in queue for manual intervention or exponentially longer retry
      item.scheduledFor = new Date(Date.now() + PERMANENT_FAILURE_RETRY_DELAY);
    }

    if (this.config.persistenceEnabled) {
      this.saveToStorage();
    }
  }

  /**
   * Update existing item in queue
   */
  private updateItem(itemId: string, updates: Partial<SyncQueueItem>): void {
    const item = this.queue.find(item => item.id === itemId);
    if (!item) return;

    // Update with new data but keep original timestamp and retry count
    Object.assign(item, {
      ...updates,
      id: itemId, // Keep original ID
      timestamp: item.timestamp, // Keep original timestamp
      retryCount: item.retryCount, // Keep retry count
      retries: item.retries, // Keep legacy retry count
      priority: Math.max(item.priority, updates.priority || 0), // Use higher priority
    });

    this.sortQueue();
  }

  /**
   * Schedule item for retry with exponential backoff
   */
  private scheduleRetry(item: SyncQueueItem): void {
    const delay = BackoffCalculator.calculateDelay(item.retryCount, {
      maxAttempts: this.config.retryAttempts,
      baseDelay: this.config.retryDelay,
      maxDelay: MAX_RETRY_BACKOFF_DELAY,
      backoffMultiplier: 2,
      jitter: true,
    });

    item.scheduledFor = new Date(Date.now() + delay);
    item.status = 'pending';

    logger.debug('Scheduling retry for sync item', 'sync', {
      itemId: item.id,
      delay,
      attempt: item.retryCount,
    });

    // Set timer to mark as available for processing
    const timer = setTimeout(() => {
      logger.debug('Retry available for sync item', 'sync', { itemId: item.id });
      this.retryTimers.delete(item.id);
    }, delay);

    this.retryTimers.set(item.id, timer);
  }

  /**
   * Evict low priority items to make room
   */
  private evictLowPriorityItems(): void {
    // Remove completed/failed items first
    this.queue = this.queue.filter(
      item => item.status === 'pending' || item.status === 'processing'
    );

    // If still over limit, remove lowest priority pending items
    if (this.queue.length >= this.config.maxQueueSize) {
      const pendingItems = this.queue
        .filter(item => item.status === 'pending')
        .sort((a, b) => a.priority - b.priority);

      const toRemove = pendingItems.slice(0, Math.ceil(this.config.maxQueueSize * 0.1));
      toRemove.forEach(item => {
        const index = this.queue.indexOf(item);
        if (index > -1) {
          this.queue.splice(index, 1);
          logger.debug('Evicted low priority sync item', 'sync', { itemId: item.id });
        }
      });
    }
  }

  /**
   * Sort queue by priority and scheduled time
   */
  private sortQueue(): void {
    this.queue.sort(compareQueueItems);
  }

  /**
   * Start background processing
   */
  private startProcessing(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }

    this.processingTimer = setInterval(() => {
      if (!this.isProcessing) {
        this.processQueue();
      }
    }, QUEUE_PROCESSING_INTERVAL);
  }

  /**
   * Process queue items
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    try {
      const batch = await this.dequeueBatch();

      if (batch.length > 0) {
        logger.debug('Processing sync batch', 'sync', { batchSize: batch.length });

        // Process batch (actual sync logic would be implemented here)
        await Promise.allSettled(batch.map(item => this.processItem(item)));
      }
    } catch (error) {
      logger.error(
        'Error processing sync queue',
        'sync',
        { queueSize: this.queue.length },
        error as Error
      );
      errorMonitor.captureError(error as Error, {
        additionalData: { queueSize: this.queue.length },
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual sync item using registered processors
   */
  private async processItem(item: SyncQueueItem): Promise<void> {
    try {
      logger.debug('Processing sync item', 'sync', {
        itemId: item.id,
        entityType: item.entityType,
        actionType: item.actionType,
      });

      // Get the processor for this entity type
      const processor = this.processors.get(item.entityType);

      if (processor) {
        // Use the registered processor
        const result: SyncProcessorResult = await processor.processItem(item);

        if (result.success) {
          this.markCompleted(item.id);
          eventEmitter.emit('sync-item-completed', {
            itemId: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            serverData: result.serverData,
          });
        } else if (result.conflictDetected) {
          // Handle conflict - emit event for conflict resolution
          eventEmitter.emit('sync-conflict-detected', {
            itemId: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            serverVersion: result.serverVersion,
            serverData: result.serverData,
            error: result.error?.message,
          });
          // Keep in queue for manual resolution
          this.updateItemStatus(item.id, 'pending');
        } else {
          // Regular failure - will be retried
          this.markFailed(item.id, result.error || new Error('Unknown processing error'));
        }
      } else {
        // No processor registered - use legacy stub behavior
        logger.warn('No processor registered for entity type', 'sync', {
          entityType: item.entityType,
        });
        await new Promise(resolve => setTimeout(resolve, 100));
        this.markCompleted(item.id);
      }
    } catch (error) {
      this.markFailed(item.id, error as Error);
    }
  }

  /**
   * Update item status without marking as failed
   */
  private updateItemStatus(id: string, status: SyncQueueItem['status']): void {
    const item = this.queue.find(i => i.id === id);
    if (item) {
      item.status = status;
      this.saveToStorage();
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    if (!this.config.persistenceEnabled) return;

    const result = loadQueueFromStorage(this.storageKey);
    if (result) {
      this.queue = result.queue;
      this.metrics = { ...this.metrics, ...result.metrics };
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    if (!this.config.persistenceEnabled) return;
    saveQueueToStorage(this.storageKey, this.queue, this.metrics);
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return calculateQueueStats(this.queue);
  }

  /**
   * Get queue metrics
   */
  getMetrics(): QueueMetrics {
    return {
      ...this.metrics,
      queueSize: this.queue.length,
    };
  }

  /**
   * Get all items in queue
   */
  getAll(): SyncQueueItem[] {
    return [...this.queue];
  }

  /**
   * Get items by status
   */
  getByStatus(status: SyncQueueItem['status']): SyncQueueItem[] {
    return this.queue.filter(item => item.status === status);
  }

  /**
   * Get items by entity type
   */
  getByEntityType(entityType: string): SyncQueueItem[] {
    return this.queue.filter(item => item.entityType === entityType);
  }

  /**
   * Remove specific item from queue
   */
  remove(itemId: string): boolean {
    const index = this.queue.findIndex(item => item.id === itemId);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    this.processingItems.delete(itemId);

    // Clear retry timer if exists
    const retryTimer = this.retryTimers.get(itemId);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(itemId);
    }

    if (this.config.persistenceEnabled) {
      this.saveToStorage();
    }

    return true;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear all items from queue
   */
  clear(): void {
    this.queue = [];
    this.processingItems.clear();

    // Clear all retry timers
    this.retryTimers.forEach(timer => clearTimeout(timer));
    this.retryTimers.clear();

    this.metrics = createInitialMetrics();

    if (this.config.persistenceEnabled) {
      this.saveToStorage();
    }

    logger.info('Sync queue cleared', 'sync');
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
    logger.info('Sync queue processing paused', 'sync');
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    if (!this.processingTimer) {
      this.startProcessing();
      logger.info('Sync queue processing resumed', 'sync');
    }
  }

  /**
   * Get configuration
   */
  getConfig(): SyncQueueConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SyncQueueConfig>): void {
    this.config = { ...this.config, ...updates };

    // Restart processing if batch size or timing changed
    if (updates.batchSize) {
      this.pause();
      this.resume();
    }
  }

  /**
   * Cleanup and destroy queue
   */
  destroy(): void {
    // Stop processing
    this.pause();

    // Clear all timers
    this.retryTimers.forEach(timer => clearTimeout(timer));
    this.retryTimers.clear();

    // Save final state
    if (this.config.persistenceEnabled) {
      this.saveToStorage();
    }

    logger.info('Sync queue destroyed', 'sync');
  }
}

// Create singleton instance
export const syncQueue = new SyncQueue();

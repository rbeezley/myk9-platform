/**
 * Sync Queue Implementation
 * Phase 6.3: Sync & Offline Systems
 * 
 * Advanced sync queue with priority management, batching, and intelligent retry logic
 * for robust offline-first architecture.
 */

import { errorMonitor } from '../../lib/errorMonitoring';
import { BackoffCalculator } from '../../lib/connectionRecovery';
import { syncPerformanceOptimizer } from '../performance/syncPerformanceOptimizer';
import { performanceMonitor } from '../performance/PerformanceMonitor';
import { eventEmitter } from './eventEmitter';
import type { SyncQueueItem, SyncOperation } from '../../types/sync-types';
import { SyncPriority, SyncStatus } from '../../types/performance-types';

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

/**
 * Advanced Sync Queue with Intelligent Processing
 */
export class SyncQueue {
  private queue: SyncQueueItem[] = [];
  private processingItems = new Set<string>();
  private config: SyncQueueConfig;
  private metrics: QueueMetrics;
  private storageKey = 'myK9Show_sync_queue';
  private isProcessing = false;
  private processingTimer: NodeJS.Timeout | null = null;
  private retryTimers = new Map<string, NodeJS.Timeout>();

  constructor(customConfig?: Partial<SyncQueueConfig>) {
    this.config = {
      maxQueueSize: 1000,
      batchSize: 10,
      retryAttempts: 5,
      retryDelay: 1000,
      priorityLevels: 10,
      persistenceEnabled: true,
      compressionEnabled: true,
      deduplicationEnabled: true,
      ...customConfig,
    };

    this.metrics = this.initializeMetrics();
    this.loadFromStorage();
    
    // Start performance optimization
    syncPerformanceOptimizer.startOptimization();
    
    this.startProcessing();
  }

  /**
   * Add item to sync queue with intelligent priority and deduplication
   */
  enqueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount' | 'status' | 'processedAt'>): string {
    const now = new Date();
    const queueItem: SyncQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
      const duplicate = this.findDuplicate(queueItem);
      if (duplicate) {
        console.log(`Duplicate sync item detected, updating existing: ${duplicate.id}`);
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

    console.log(`Added sync item to queue: ${queueItem.id} (priority: ${queueItem.priority})`);
    return queueItem.id;
  }

  /**
   * Get next batch of items to process with performance optimization
   */
  async dequeueBatch(): Promise<SyncQueueItem[]> {
    const timerId = performanceMonitor.startTimer('sync-queue-dequeue-batch');
    
    try {
      if (this.queue.length === 0) {
        performanceMonitor.endTimer(timerId, { success: true, batchSize: 0 });
        return [];
      }

      // Get items that are not currently being processed
      const availableItems = this.queue.filter(
        item => item.status === 'pending' && !this.processingItems.has(item.id)
      );

      if (availableItems.length === 0) {
        performanceMonitor.endTimer(timerId, { success: true, batchSize: 0, reason: 'no-available-items' });
        return [];
      }

      // Convert SyncQueueItem[] to SyncOperation[] for optimization
      const operations: SyncOperation[] = availableItems.map(item => ({
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        operation: item.actionType,
        data: item.data,
        timestamp: item.timestamp.getTime(),
        clientId: item.userId,
        version: 1, // Default version
      }));

      // Apply performance optimization to the queue
      // Convert sync-types operations to performance-types format
      const performanceOperations = operations.map(op => ({
        id: op.id,
        entityType: op.entityType,
        entityId: op.entityId,
        action: op.operation as 'create' | 'update' | 'delete',
        data: op.data,
        priority: SyncPriority.NORMAL,
        status: SyncStatus.PENDING,
        timestamp: new Date(op.timestamp)
      }));
      
      const optimizedOperations = await syncPerformanceOptimizer.optimizeSyncQueue(performanceOperations);
      
      // Convert back to SyncQueueItem[]
      const optimizedItems = optimizedOperations.map(op => 
        availableItems.find(item => item.id === op.id)!
      ).filter(Boolean);

      // Get batch with optimized ordering
      const batch = optimizedItems.slice(0, this.config.batchSize);

      // Mark as processing
      batch.forEach(item => {
        item.status = 'processing';
        this.processingItems.add(item.id);
      });

      // Emit sync operation started events
      batch.forEach(item => {
        eventEmitter.emit('sync:operation-started', {
          operation: item,
          timestamp: Date.now()
        });
      });

      performanceMonitor.endTimer(timerId, { 
        success: true, 
        batchSize: batch.length,
        availableItems: availableItems.length,
        optimized: true
      });

      return batch;
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback to original logic
      return this.dequeueBatchFallback();
    }
  }

  /**
   * Fallback batch dequeue without optimization
   */
  private dequeueBatchFallback(): SyncQueueItem[] {
    if (this.queue.length === 0) return [];

    // Get items that are not currently being processed
    const availableItems = this.queue.filter(
      item => item.status === 'pending' && !this.processingItems.has(item.id)
    );

    if (availableItems.length === 0) return [];

    // Sort by priority and get batch
    const batch = availableItems
      .sort((a, b) => {
        // Priority first (higher number = higher priority)
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        // Then by scheduled time
        return a.scheduledFor.getTime() - b.scheduledFor.getTime();
      })
      .slice(0, this.config.batchSize);

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
    const timerId = performanceMonitor.startTimer('sync-queue-mark-completed');
    
    try {
      const index = this.queue.findIndex(item => item.id === itemId);
      if (index === -1) {
        performanceMonitor.endTimer(timerId, { success: false, reason: 'item-not-found' });
        return;
      }

      const item = this.queue[index];
      item.status = 'completed';
      item.processedAt = new Date();

      // Update metrics
      this.metrics.itemsProcessed++;
      const processingTime = Date.now() - item.timestamp.getTime();
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime + processingTime) / 2;
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
        timestamp: Date.now()
      });

      console.log(`Sync item completed: ${itemId}`);
      
      if (this.config.persistenceEnabled) {
        this.saveToStorage();
      }

      performanceMonitor.endTimer(timerId, { 
        success: true,
        processingTime
      });
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
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
      }
    });

    // Schedule retry if under limit
    if (item.retryCount < this.config.retryAttempts) {
      this.scheduleRetry(item);
    } else {
      console.error(`Sync item failed permanently after ${item.retryCount} attempts: ${itemId}`);
      // Keep in queue for manual intervention or exponentially longer retry
      item.scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }

    if (this.config.persistenceEnabled) {
      this.saveToStorage();
    }
  }

  /**
   * Find duplicate items in queue
   */
  private findDuplicate(newItem: SyncQueueItem): SyncQueueItem | null {
    return this.queue.find(item => 
      item.entityType === newItem.entityType &&
      item.entityId === newItem.entityId &&
      item.actionType === newItem.actionType &&
      (item.status === 'pending' || item.status === 'processing')
    ) || null;
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
      maxDelay: 60000, // 1 minute max
      backoffMultiplier: 2,
      jitter: true,
    });

    item.scheduledFor = new Date(Date.now() + delay);
    item.status = 'pending';

    console.log(`Scheduling retry for sync item ${item.id} in ${delay}ms (attempt ${item.retryCount})`);

    // Set timer to mark as available for processing
    const timer = setTimeout(() => {
      console.log(`Retry available for sync item: ${item.id}`);
      this.retryTimers.delete(item.id);
    }, delay);

    this.retryTimers.set(item.id, timer);
  }

  /**
   * Evict low priority items to make room
   */
  private evictLowPriorityItems(): void {
    // Remove completed/failed items first
    this.queue = this.queue.filter(item => 
      item.status === 'pending' || item.status === 'processing'
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
          console.log(`Evicted low priority sync item: ${item.id}`);
        }
      });
    }
  }

  /**
   * Sort queue by priority and scheduled time
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Priority first (higher number = higher priority)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Then by scheduled time (earlier first)
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });
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
    }, 5000); // Process every 5 seconds
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
        console.log(`Processing sync batch of ${batch.length} items`);
        
        // Process batch (actual sync logic would be implemented here)
        await Promise.allSettled(
          batch.map(item => this.processItem(item))
        );
      }

    } catch (error) {
      console.error('Error processing sync queue:', error);
      errorMonitor.captureError(error as Error, {
        additionalData: { queueSize: this.queue.length }
      });

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual sync item
   */
  private async processItem(item: SyncQueueItem): Promise<void> {
    try {
      console.log(`Processing sync item: ${item.id} (${item.entityType}.${item.actionType})`);
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Here would be the actual sync logic
      // For now, we'll just mark as completed
      this.markCompleted(item.id);
      
    } catch (error) {
      this.markFailed(item.id, error as Error);
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): QueueMetrics {
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

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    if (!this.config.persistenceEnabled) return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.queue = data.queue?.map((item: Record<string, unknown>) => ({
          ...item,
          timestamp: new Date(item.timestamp as string),
          scheduledFor: new Date((item.scheduledFor as string) || (item.timestamp as string)), // Fallback to timestamp if scheduledFor missing
          processedAt: item.processedAt ? new Date(item.processedAt as string) : undefined,
          retries: (item.retries as number) || (item.retryCount as number) || 0, // Ensure retries field exists
          retryCount: (item.retryCount as number) || (item.retries as number) || 0, // Ensure retryCount field exists
        } as SyncQueueItem)) || [];
        
        this.metrics = { ...this.metrics, ...data.metrics };
        
        // Reset processing status for items that were being processed
        this.queue.forEach(item => {
          if (item.status === 'processing') {
            item.status = 'pending';
          }
        });
        
        this.sortQueue();
        console.log(`Loaded ${this.queue.length} sync items from storage`);
      }
    } catch (error) {
      console.error('Failed to load sync queue from storage:', error);
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    if (!this.config.persistenceEnabled) return;

    try {
      const data = {
        queue: this.queue,
        metrics: this.metrics,
        timestamp: Date.now(),
      };

      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save sync queue to storage:', error);
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const stats = this.queue.reduce((acc, item) => {
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

      // Count by priority (assuming 1-3 scale)
      if (item.priority >= 7) {
        acc.highPriorityItems++;
      } else if (item.priority >= 4) {
        acc.mediumPriorityItems++;
      } else {
        acc.lowPriorityItems++;
      }

      return acc;
    }, {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      highPriorityItems: 0,
      mediumPriorityItems: 0,
      lowPriorityItems: 0,
    });

    return stats;
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

    this.metrics = this.initializeMetrics();

    if (this.config.persistenceEnabled) {
      this.saveToStorage();
    }

    console.log('Sync queue cleared');
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
    console.log('Sync queue processing paused');
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    if (!this.processingTimer) {
      this.startProcessing();
      console.log('Sync queue processing resumed');
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
    
    console.log('Sync queue destroyed');
  }
}

// Create singleton instance
export const syncQueue = new SyncQueue();
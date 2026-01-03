// Queue management for offline sync operations
import { db } from '../database/connection';
import type { 
  SyncQueueItem, 
  SyncConfiguration, 
  SyncEventMap,
  SyncQueueRecord 
} from './types';
import { EventEmitter } from './eventEmitter';

export class QueueManager {
  private config: SyncConfiguration;
  private eventEmitter: EventEmitter<SyncEventMap>;
  private isProcessing = false;

  constructor(config: SyncConfiguration, eventEmitter: EventEmitter<SyncEventMap>) {
    this.config = config;
    this.eventEmitter = eventEmitter;
  }

  async initialize(): Promise<void> {
    // Check for any stuck items and reset them
    await this.resetStuckItems();
  }

  async addToQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount' | 'status'>): Promise<string> {
    const queueItem: SyncQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
      retryCount: 0,
      status: 'pending',
      ...item
    };

    // Check queue size limit
    const queueSize = await db.instance.syncQueue.where('status').anyOf(['pending', 'processing']).count();
    if (queueSize >= this.config.maxQueueSize) {
      // Remove oldest low priority items
      await this.cleanupQueue();
    }

    // Convert to database record
    const record: SyncQueueRecord = {
      id: queueItem.id,
      entityType: queueItem.entityType,
      entityId: queueItem.entityId,
      operation: queueItem.operation,
      data: JSON.stringify(queueItem.data),
      timestamp: queueItem.timestamp,
      retryCount: queueItem.retryCount,
      status: queueItem.status,
      error: queueItem.error,
      priority: queueItem.priority
    };

    await db.instance.syncQueue.add(record);
    return queueItem.id;
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Get pending items ordered by priority and timestamp
      const items = await db.instance.syncQueue
        .where('status')
        .equals('pending')
        .and(item => item.retryCount < this.config.maxRetries)
        .toArray();

      // Sort by priority (descending) then timestamp (ascending)
      const sortedItems = items.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return a.timestamp.getTime() - b.timestamp.getTime(); // Older first
      });

      // Process items in batches
      const batchSize = this.config.batchSize;
      for (let i = 0; i < sortedItems.length; i += batchSize) {
        const batch = sortedItems.slice(i, i + batchSize);
        await this.processBatch(batch);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async clearQueue(): Promise<void> {
    await db.instance.syncQueue.clear();
  }

  async getQueueStatus(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
  }> {
    const [pending, processing, failed, completed] = await Promise.all([
      db.instance.syncQueue.where('status').equals('pending').count(),
      db.instance.syncQueue.where('status').equals('processing').count(),
      db.instance.syncQueue.where('status').equals('failed').count(),
      db.instance.syncQueue.where('status').equals('completed').count()
    ]);

    return { pending, processing, failed, completed };
  }

  async reset(): Promise<void> {
    await this.clearQueue();
  }

  private async processBatch(batch: SyncQueueRecord[]): Promise<void> {
    // Mark items as processing
    const itemIds = batch.map(item => item.id);
    await db.instance.syncQueue.where('id').anyOf(itemIds).modify({ status: 'processing' });

    // Process each item
    for (const record of batch) {
      await this.processItem(record);
    }
  }

  private async processItem(record: SyncQueueRecord): Promise<void> {
    try {
      const item: SyncQueueItem = {
        id: record.id,
        entityType: record.entityType,
        entityId: record.entityId,
        operation: record.operation,
        data: JSON.parse(record.data),
        timestamp: record.timestamp,
        retryCount: record.retryCount,
        status: record.status,
        error: record.error,
        priority: record.priority
      };

      await this.executeOperation(item);

      // Mark as completed
      await db.instance.syncQueue.update(record.id, {
        status: 'completed',
        error: undefined
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Increment retry count
      const newRetryCount = record.retryCount + 1;
      
      if (newRetryCount >= this.config.maxRetries) {
        // Max retries reached, mark as failed
        await db.instance.syncQueue.update(record.id, {
          status: 'failed',
          retryCount: newRetryCount,
          error: errorMessage
        });
      } else {
        // Retry later with backoff
        const backoffMs = this.config.retryBackoffMs * Math.pow(2, newRetryCount - 1);
        
        setTimeout(async () => {
          await db.instance.syncQueue.update(record.id, {
            status: 'pending',
            retryCount: newRetryCount,
            error: errorMessage
          });
        }, backoffMs);
      }

      console.error(`Queue item ${record.id} failed:`, error);
    }
  }

  private async executeOperation(item: SyncQueueItem): Promise<void> {
    // This would integrate with the actual sync operations
    // For now, we'll simulate the operation
    
    switch (item.operation) {
      case 'create':
        await this.executeCreate(item);
        break;
      case 'update':
        await this.executeUpdate(item);
        break;
      case 'delete':
        await this.executeDelete(item);
        break;
      default:
        throw new Error(`Unknown operation: ${item.operation}`);
    }
  }

  private async executeCreate(item: SyncQueueItem): Promise<void> {
    // Implementation would create the entity remotely
    // This is a placeholder for the actual sync logic
    console.log(`Executing create operation for ${item.entityType}:${item.entityId}`);
  }

  private async executeUpdate(item: SyncQueueItem): Promise<void> {
    // Implementation would update the entity remotely
    console.log(`Executing update operation for ${item.entityType}:${item.entityId}`);
  }

  private async executeDelete(item: SyncQueueItem): Promise<void> {
    // Implementation would delete the entity remotely
    console.log(`Executing delete operation for ${item.entityType}:${item.entityId}`);
  }

  private async resetStuckItems(): Promise<void> {
    // Reset any items that were left in 'processing' state
    await db.instance.syncQueue
      .where('status')
      .equals('processing')
      .modify({ status: 'pending' });
  }

  private async cleanupQueue(): Promise<void> {
    // Remove completed items older than 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.instance.syncQueue
      .where('status')
      .equals('completed')
      .and(item => item.timestamp < yesterday)
      .delete();

    // If still over limit, remove oldest low priority pending items
    const queueSize = await db.instance.syncQueue.where('status').anyOf(['pending', 'processing']).count();
    if (queueSize >= this.config.maxQueueSize) {
      const itemsToRemove = queueSize - this.config.maxQueueSize + 10; // Remove extra for buffer
      
      const oldestLowPriority = await db.instance.syncQueue
        .where('status')
        .equals('pending')
        .and(item => item.priority <= 3) // Low priority
        .sortBy('timestamp');

      const idsToRemove = oldestLowPriority
        .slice(0, itemsToRemove)
        .map(item => item.id);

      if (idsToRemove.length > 0) {
        await db.instance.syncQueue.where('id').anyOf(idsToRemove).delete();
      }
    }
  }
}
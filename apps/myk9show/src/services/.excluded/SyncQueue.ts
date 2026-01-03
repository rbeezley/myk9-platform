import { SyncQueueItem, SyncAction } from '@/types/sync-types';
import { SyncPriority } from '@/config/sync-scopes';
import { db } from '@/services/database/connection';

export class SyncQueue {
  private static instance: SyncQueue;
  private queue: SyncQueueItem[] = [];
  private isProcessing = false;

  private constructor() {
    this.loadQueueFromStorage();
  }

  static getInstance(): SyncQueue {
    if (!SyncQueue.instance) {
      SyncQueue.instance = new SyncQueue();
    }
    return SyncQueue.instance;
  }

  /**
   * Add an action to the sync queue
   */
  async add(action: Omit<SyncAction, 'id'>): Promise<string> {
    const queueItem: SyncQueueItem = {
      id: crypto.randomUUID(),
      entityType: action.entityType,
      entityId: action.entityId,
      actionType: action.actionType,
      data: action.data,
      timestamp: action.timestamp,
      userId: action.userId,
      retries: action.retries,
      lastError: action.lastError,
      priority: this.determinePriority(action),
      scheduledFor: new Date(),
      processedAt: undefined,
      status: 'pending',
      retryCount: 0
    };

    this.queue.push(queueItem);
    this.sortByPriority();
    await this.saveQueueToStorage();

    return queueItem.id;
  }

  /**
   * Get pending items from the queue
   */
  getPending(): SyncQueueItem[] {
    return this.queue.filter(item => 
      item.status === 'pending' && 
      item.scheduledFor <= new Date()
    );
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const total = this.queue.length;
    const pending = this.queue.filter(item => item.status === 'pending').length;
    const processing = this.queue.filter(item => item.status === 'processing').length;
    const failed = this.queue.filter(item => item.status === 'failed').length;
    const completed = this.queue.filter(item => item.status === 'completed').length;

    return {
      total,
      pending,
      processing,
      failed,
      completed,
      successRate: total > 0 ? completed / total : 0
    };
  }

  /**
   * Mark an item as processing
   */
  async markProcessing(itemId: string): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.status = 'processing';
      item.processedAt = new Date();
      await this.saveQueueToStorage();
    }
  }

  /**
   * Mark an item as completed
   */
  async markCompleted(itemId: string): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.status = 'completed';
      // Remove completed items after a delay to keep recent history
      setTimeout(() => this.removeItem(itemId), 60000); // Remove after 1 minute
    }
    await this.saveQueueToStorage();
  }

  /**
   * Mark an item as failed and schedule retry
   */
  async markFailed(itemId: string, error: string): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.status = 'failed';
      item.lastError = error;
      item.retries += 1;

      // Schedule retry with exponential backoff
      if (item.retries < 5) {
        const retryDelay = Math.pow(2, item.retries) * 1000; // 2^n seconds
        item.scheduledFor = new Date(Date.now() + retryDelay);
        item.status = 'pending';
      }
    }
    await this.saveQueueToStorage();
  }

  /**
   * Remove an item from the queue
   */
  async removeItem(itemId: string): Promise<void> {
    this.queue = this.queue.filter(item => item.id !== itemId);
    await this.saveQueueToStorage();
  }

  /**
   * Clear all completed and failed items
   */
  async cleanup(): Promise<void> {
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    this.queue = this.queue.filter(item => 
      item.status === 'pending' || 
      item.status === 'processing' ||
      (item.processedAt && item.processedAt > cutoffDate)
    );
    await this.saveQueueToStorage();
  }

  /**
   * Get items by entity type
   */
  getByEntityType(entityType: string): SyncQueueItem[] {
    return this.queue.filter(item => item.entityType === entityType);
  }

  /**
   * Check if an entity has pending changes
   */
  hasPendingChanges(entityType: string, entityId: string): boolean {
    return this.queue.some(item => 
      item.entityType === entityType && 
      item.entityId === entityId && 
      (item.status === 'pending' || item.status === 'processing')
    );
  }

  /**
   * Determine priority based on action type and entity
   */
  private determinePriority(action: Omit<SyncAction, 'id'>): number {
    // Critical: User-initiated actions
    if (action.actionType === 'create' || action.actionType === 'delete') {
      return SyncPriority.CRITICAL;
    }

    // High: Real-time updates for shows and entries
    if (action.entityType === 'show' || action.entityType === 'entry') {
      return SyncPriority.HIGH;
    }

    // Normal: Regular updates
    return SyncPriority.NORMAL;
  }

  /**
   * Sort queue by priority and scheduled time
   */
  private sortByPriority(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });
  }

  /**
   * Load queue from IndexedDB storage
   */
  private async loadQueueFromStorage(): Promise<void> {
    try {
      const stored = await db.instance.syncQueue.toArray();
      this.queue = stored.map(item => ({
        id: item.id,
        entityType: item.entityType as 'club' | 'person' | 'dog' | 'show' | 'entry',
        entityId: item.entityId,
        actionType: item.operation as 'create' | 'update' | 'delete', // Map from SyncQueueRecord to SyncQueueItem
        data: JSON.parse(item.data),
        timestamp: new Date(item.timestamp),
        userId: 'current-user', // Default value since it's not in SyncQueueRecord
        retries: item.retryCount,
        lastError: item.error,
        priority: item.priority,
        scheduledFor: new Date(item.timestamp), // Use timestamp as default
        processedAt: undefined, // Not available in SyncQueueRecord
        status: item.status,
        retryCount: item.retryCount
      }));
      this.sortByPriority();
    } catch (error) {
      console.error('Failed to load sync queue from storage:', error);
      this.queue = [];
    }
  }

  /**
   * Save queue to IndexedDB storage
   */
  private async saveQueueToStorage(): Promise<void> {
    try {
      await db.instance.syncQueue.clear();
      await db.instance.syncQueue.bulkAdd(this.queue.map(item => ({
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        operation: item.actionType, // Map from SyncQueueItem to SyncQueueRecord
        data: JSON.stringify(item.data),
        timestamp: item.timestamp,
        retryCount: item.retryCount,
        status: item.status,
        error: item.lastError,
        priority: item.priority
      })));
    } catch (error) {
      console.error('Failed to save sync queue to storage:', error);
    }
  }
}
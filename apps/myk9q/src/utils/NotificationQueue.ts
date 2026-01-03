/**
 * NotificationQueue Class
 *
 * Extracted from notificationService.ts
 * Manages scheduling, queueing, and retry logic for notification delivery.
 *
 * Features:
 * - Scheduled notification delivery
 * - Automatic retry with exponential backoff
 * - Queue filtering by readiness
 * - Queue status and monitoring
 * - Item removal and clearing
 */

import { logger } from '@/utils/logger';

/**
 * Notification payload structure
 */
export interface NotificationPayload {
  id?: string;
  type: string;
  title: string;
  body?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  data?: Record<string, any>;
}

/**
 * Queued notification item with retry tracking
 */
export interface NotificationQueueItem {
  /** Unique item identifier */
  id: string;
  /** Notification payload */
  payload: NotificationPayload;
  /** Timestamp when notification should be sent */
  scheduledFor: number;
  /** Number of delivery attempts made */
  retryCount: number;
  /** Maximum retry attempts allowed */
  maxRetries: number;
  /** Timestamp when item was created */
  createdAt: number;
}

/**
 * Queue processing result
 */
export interface QueueProcessResult {
  /** Number of items processed */
  processed: number;
  /** Number of successful sends */
  successful: number;
  /** Number of failed items (removed after max retries) */
  failed: number;
  /** Number of items rescheduled for retry */
  retrying: number;
}

/**
 * NotificationQueue manages scheduled notification delivery with retry logic
 *
 * @example
 * ```ts
 * const queue = new NotificationQueue({
 *   maxRetries: 3,
 *   processingInterval: 30000 // 30 seconds
 * });
 *
 * // Start automatic processing
 * queue.startProcessing(async (item) => {
 *   return await sendNotification(item.payload);
 * });
 *
 * // Queue notification for immediate delivery
 * const id = queue.enqueue({
 *   type: 'your_turn',
 *   title: 'Your turn',
 *   priority: 'high'
 * });
 *
 * // Queue for future delivery (5 minutes from now)
 * const scheduledId = queue.enqueue({
 *   type: 'reminder',
 *   title: 'Reminder',
 *   priority: 'normal'
 * }, Date.now() + 5 * 60 * 1000);
 *
 * // Get queue status
 * const status = queue.getStatus();
 * logger.log(`${status.count} notifications queued`);
 * ```
 */
export class NotificationQueue {
  private queue: NotificationQueueItem[] = [];
  private processingInterval: number | null = null;
  private intervalMs: number;
  private maxRetries: number;
  private processHandler: ((item: NotificationQueueItem) => Promise<boolean>) | null = null;

  /**
   * Create a new NotificationQueue
   *
   * @param options - Configuration options
   * @param options.maxRetries - Maximum retry attempts per item (default: 3)
   * @param options.processingInterval - Queue processing interval in ms (default: 30000)
   */
  constructor(options: {
    maxRetries?: number;
    processingInterval?: number;
  } = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.intervalMs = options.processingInterval ?? 30000;
  }

  /**
   * Add notification to queue
   *
   * @param payload - Notification payload
   * @param scheduledFor - Optional timestamp for scheduled delivery (default: now)
   * @returns Queue item ID
   *
   * @example
   * ```ts
   * // Immediate delivery
   * const id = queue.enqueue({ type: 'alert', title: 'Alert' });
   *
   * // Scheduled for 1 hour from now
   * const scheduledId = queue.enqueue(
   *   { type: 'reminder', title: 'Reminder' },
   *   Date.now() + 60 * 60 * 1000
   * );
   * ```
   */
  enqueue(payload: NotificationPayload, scheduledFor?: number): string {
    const id = payload.id || this.generateId();
    const item: NotificationQueueItem = {
      id,
      payload: { ...payload, id },
      scheduledFor: scheduledFor ?? Date.now(),
      retryCount: 0,
      maxRetries: this.maxRetries,
      createdAt: Date.now(),
    };

    this.queue.push(item);
    return id;
  }

  /**
   * Remove specific item from queue
   *
   * @param itemId - ID of item to remove
   * @returns True if item was found and removed
   *
   * @example
   * ```ts
   * const removed = queue.remove('notif_123');
   * if (removed) {
   *   logger.log('Item removed from queue');
   * }
   * ```
   */
  remove(itemId: string): boolean {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter((item) => item.id !== itemId);
    return this.queue.length < initialLength;
  }

  /**
   * Get items ready for processing
   *
   * Returns items where scheduledFor <= current time.
   *
   * @returns Array of items ready to process
   *
   * @example
   * ```ts
   * const readyItems = queue.getReadyItems();
   * logger.log(`${readyItems.length} items ready`);
   * ```
   */
  getReadyItems(): NotificationQueueItem[] {
    const now = Date.now();
    return this.queue.filter((item) => item.scheduledFor <= now);
  }

  /**
   * Get all queue items
   *
   * @returns Copy of all queue items
   *
   * @example
   * ```ts
   * const allItems = queue.getAllItems();
   * logger.log(`Queue contains ${allItems.length} items`);
   * ```
   */
  getAllItems(): NotificationQueueItem[] {
    return [...this.queue];
  }

  /**
   * Get specific queue item by ID
   *
   * @param itemId - ID of item to retrieve
   * @returns Queue item if found, undefined otherwise
   *
   * @example
   * ```ts
   * const item = queue.getItem('notif_123');
   * if (item) {
   *   logger.log(`Scheduled for: ${new Date(item.scheduledFor)}`);
   * }
   * ```
   */
  getItem(itemId: string): NotificationQueueItem | undefined {
    return this.queue.find((item) => item.id === itemId);
  }

  /**
   * Get queue status
   *
   * @returns Object with queue count and items
   *
   * @example
   * ```ts
   * const status = queue.getStatus();
   * logger.log(`${status.count} notifications in queue`);
   * logger.log(`Next scheduled: ${new Date(status.items[0]?.scheduledFor)}`);
   * ```
   */
  getStatus(): { count: number; items: NotificationQueueItem[] } {
    return {
      count: this.queue.length,
      items: [...this.queue],
    };
  }

  /**
   * Clear all items from queue
   *
   * @example
   * ```ts
   * queue.clear();
   * logger.log('Queue cleared');
   * ```
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Process ready queue items
   *
   * Requires startProcessing() to have been called with a handler.
   *
   * @returns Processing result with counts
   *
   * @example
   * ```ts
   * const result = await queue.process();
   * logger.log(`Processed: ${result.processed}`);
   * logger.log(`Successful: ${result.successful}`);
   * logger.log(`Failed: ${result.failed}`);
   * logger.log(`Retrying: ${result.retrying}`);
   * ```
   */
  async process(): Promise<QueueProcessResult> {
    if (!this.processHandler) {
      throw new Error('Process handler not set. Call startProcessing() first.');
    }

    const result: QueueProcessResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      retrying: 0,
    };

    const readyItems = this.getReadyItems();
    const now = Date.now();

    for (const item of readyItems) {
      result.processed++;

      try {
        const success = await this.processHandler(item);

        if (success) {
          // Remove from queue
          this.remove(item.id);
          result.successful++;
        } else {
          // Retry logic
          item.retryCount++;

          if (item.retryCount >= item.maxRetries) {
            this.remove(item.id);
            result.failed++;
          } else {
            // Exponential backoff: 1min, 2min, 4min
            item.scheduledFor = now + Math.pow(2, item.retryCount) * 60 * 1000;
            result.retrying++;
          }
        }
      } catch (error) {
        logger.error('Error processing queue item:', error);
        item.retryCount++;

        if (item.retryCount >= item.maxRetries) {
          this.remove(item.id);
          result.failed++;
        } else {
          item.scheduledFor = now + Math.pow(2, item.retryCount) * 60 * 1000;
          result.retrying++;
        }
      }
    }

    return result;
  }

  /**
   * Start automatic queue processing
   *
   * @param handler - Async function that processes queue items
   *                  Should return true if successful, false to retry
   *
   * @example
   * ```ts
   * queue.startProcessing(async (item) => {
   *   try {
   *     await sendNotification(item.payload);
   *     return true;
   *   } catch (error) {
   *     logger.error('Send failed:', error);
   *     return false;
   *   }
   * });
   * ```
   */
  startProcessing(
    handler: (item: NotificationQueueItem) => Promise<boolean>
  ): void {
    if (this.processingInterval) {
      logger.warn('Queue processing already started');
      return;
    }

    this.processHandler = handler;

    this.processingInterval = window.setInterval(() => {
      this.process().catch((error) => {
        logger.error('Queue processing error:', error);
      });
    }, this.intervalMs);
  }

  /**
   * Stop automatic queue processing
   *
   * @example
   * ```ts
   * queue.stopProcessing();
   * logger.log('Queue processing stopped');
   * ```
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      this.processHandler = null;
    }
  }

  /**
   * Check if processing is active
   *
   * @returns True if automatic processing is running
   *
   * @example
   * ```ts
   * if (queue.isProcessing()) {
   *   logger.log('Queue is being processed automatically');
   * }
   * ```
   */
  isProcessing(): boolean {
    return this.processingInterval !== null;
  }

  /**
   * Generate unique queue item ID
   */
  private generateId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

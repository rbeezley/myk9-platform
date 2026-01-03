/**
 * Priority Queue Helper Utilities
 *
 * Pure utility functions for managing priority queues, commonly used for
 * prefetching, task scheduling, and batch processing operations.
 * Extracted from usePrefetch hook for better testability.
 *
 * @module queueHelpers
 */

/**
 * Generic queue item with priority
 */
export interface PriorityQueueItem<T = any> {
  /** Unique identifier for the item */
  key: string;
  /** Item data/payload */
  data: T;
  /** Priority (higher = more important) */
  priority: number;
  /** Timestamp when item was added */
  timestamp: number;
}

/**
 * Insert item into priority queue maintaining sort order
 *
 * @param queue - The priority queue array
 * @param item - Item to insert
 * @returns Updated queue (mutates in place)
 *
 * @example
 * ```typescript
 * const queue: PriorityQueueItem<any>[] = [];
 * insertWithPriority(queue, { key: 'a', data: {}, priority: 5, timestamp: Date.now() });
 * insertWithPriority(queue, { key: 'b', data: {}, priority: 10, timestamp: Date.now() });
 * // queue is now sorted by priority: [{ key: 'b', priority: 10 }, { key: 'a', priority: 5 }]
 * ```
 */
export function insertWithPriority<T>(
  queue: PriorityQueueItem<T>[],
  item: PriorityQueueItem<T>
): PriorityQueueItem<T>[] {
  queue.push(item);
  queue.sort((a, b) => b.priority - a.priority); // Descending order
  return queue;
}

/**
 * Update priority of existing item in queue
 *
 * @param queue - The priority queue array
 * @param key - Key of item to update
 * @param newPriority - New priority value
 * @returns True if item was found and updated
 *
 * @example
 * ```typescript
 * const queue = [{ key: 'a', data: {}, priority: 5, timestamp: Date.now() }];
 * updatePriority(queue, 'a', 10); // true
 * // queue[0].priority is now 10
 * ```
 */
export function updatePriority<T>(
  queue: PriorityQueueItem<T>[],
  key: string,
  newPriority: number
): boolean {
  const item = queue.find(i => i.key === key);
  if (!item) return false;

  item.priority = newPriority;
  queue.sort((a, b) => b.priority - a.priority); // Re-sort
  return true;
}

/**
 * Update priority of existing item only if new priority is higher
 *
 * @param queue - The priority queue array
 * @param key - Key of item to update
 * @param newPriority - New priority value
 * @returns True if item was found and updated
 *
 * @example
 * ```typescript
 * const queue = [{ key: 'a', data: {}, priority: 5, timestamp: Date.now() }];
 * updatePriorityIfHigher(queue, 'a', 3); // false (not updated)
 * updatePriorityIfHigher(queue, 'a', 10); // true (updated)
 * ```
 */
export function updatePriorityIfHigher<T>(
  queue: PriorityQueueItem<T>[],
  key: string,
  newPriority: number
): boolean {
  const item = queue.find(i => i.key === key);
  if (!item) return false;

  if (newPriority > item.priority) {
    item.priority = newPriority;
    queue.sort((a, b) => b.priority - a.priority); // Re-sort
    return true;
  }

  return false;
}

/**
 * Remove and return N highest-priority items from queue
 *
 * @param queue - The priority queue array
 * @param maxItems - Maximum number of items to dequeue (default: 1)
 * @returns Array of dequeued items
 *
 * @example
 * ```typescript
 * const queue = [
 *   { key: 'a', data: {}, priority: 10, timestamp: Date.now() },
 *   { key: 'b', data: {}, priority: 5, timestamp: Date.now() },
 *   { key: 'c', data: {}, priority: 3, timestamp: Date.now() }
 * ];
 * const items = dequeueN(queue, 2);
 * // items = [{ key: 'a', priority: 10 }, { key: 'b', priority: 5 }]
 * // queue = [{ key: 'c', priority: 3 }]
 * ```
 */
export function dequeueN<T>(
  queue: PriorityQueueItem<T>[],
  maxItems: number = 1
): PriorityQueueItem<T>[] {
  return queue.splice(0, maxItems);
}

/**
 * Find item in queue by key
 *
 * @param queue - The priority queue array
 * @param key - Key to search for
 * @returns Item if found, undefined otherwise
 *
 * @example
 * ```typescript
 * const queue = [{ key: 'a', data: {}, priority: 5, timestamp: Date.now() }];
 * findInQueue(queue, 'a'); // { key: 'a', ... }
 * findInQueue(queue, 'b'); // undefined
 * ```
 */
export function findInQueue<T>(
  queue: PriorityQueueItem<T>[],
  key: string
): PriorityQueueItem<T> | undefined {
  return queue.find(item => item.key === key);
}

/**
 * Check if key exists in queue
 *
 * @param queue - The priority queue array
 * @param key - Key to search for
 * @returns True if key exists in queue
 *
 * @example
 * ```typescript
 * const queue = [{ key: 'a', data: {}, priority: 5, timestamp: Date.now() }];
 * hasKey(queue, 'a'); // true
 * hasKey(queue, 'b'); // false
 * ```
 */
export function hasKey<T>(
  queue: PriorityQueueItem<T>[],
  key: string
): boolean {
  return queue.some(item => item.key === key);
}

/**
 * Remove item from queue by key
 *
 * @param queue - The priority queue array
 * @param key - Key of item to remove
 * @returns True if item was found and removed
 *
 * @example
 * ```typescript
 * const queue = [{ key: 'a', data: {}, priority: 5, timestamp: Date.now() }];
 * removeFromQueue(queue, 'a'); // true
 * queue.length; // 0
 * ```
 */
export function removeFromQueue<T>(
  queue: PriorityQueueItem<T>[],
  key: string
): boolean {
  const index = queue.findIndex(item => item.key === key);
  if (index === -1) return false;

  queue.splice(index, 1);
  return true;
}

/**
 * Get queue statistics
 *
 * @param queue - The priority queue array
 * @returns Statistics about the queue
 *
 * @example
 * ```typescript
 * const queue = [
 *   { key: 'a', data: {}, priority: 10, timestamp: Date.now() },
 *   { key: 'b', data: {}, priority: 5, timestamp: Date.now() }
 * ];
 * getQueueStats(queue);
 * // {
 * //   size: 2,
 * //   highestPriority: 10,
 * //   lowestPriority: 5,
 * //   averagePriority: 7.5,
 * //   oldestTimestamp: 1234567890,
 * //   newestTimestamp: 1234567890
 * // }
 * ```
 */
export function getQueueStats<T>(queue: PriorityQueueItem<T>[]): {
  size: number;
  highestPriority: number | null;
  lowestPriority: number | null;
  averagePriority: number | null;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
} {
  if (queue.length === 0) {
    return {
      size: 0,
      highestPriority: null,
      lowestPriority: null,
      averagePriority: null,
      oldestTimestamp: null,
      newestTimestamp: null,
    };
  }

  const priorities = queue.map(item => item.priority);
  const timestamps = queue.map(item => item.timestamp);

  return {
    size: queue.length,
    highestPriority: Math.max(...priorities),
    lowestPriority: Math.min(...priorities),
    averagePriority: priorities.reduce((a, b) => a + b, 0) / priorities.length,
    oldestTimestamp: Math.min(...timestamps),
    newestTimestamp: Math.max(...timestamps),
  };
}

/**
 * Clear all items from queue
 *
 * @param queue - The priority queue array
 * @returns Number of items removed
 *
 * @example
 * ```typescript
 * const queue = [{ key: 'a', data: {}, priority: 5, timestamp: Date.now() }];
 * clearQueue(queue); // 1
 * queue.length; // 0
 * ```
 */
export function clearQueue<T>(queue: PriorityQueueItem<T>[]): number {
  const size = queue.length;
  queue.length = 0;
  return size;
}

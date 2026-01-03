/**
 * Unit Tests for Priority Queue Helper Utilities
 */

import {
  insertWithPriority,
  updatePriority,
  updatePriorityIfHigher,
  dequeueN,
  findInQueue,
  hasKey,
  removeFromQueue,
  getQueueStats,
  clearQueue,
  type PriorityQueueItem
} from './queueHelpers';

describe('insertWithPriority', () => {
  test('should insert item into empty queue', () => {
    const queue: PriorityQueueItem[] = [];
    const item: PriorityQueueItem = {
      key: 'a',
      data: { value: 1 },
      priority: 5,
      timestamp: Date.now()
    };

    insertWithPriority(queue, item);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(item);
  });

  test('should maintain descending priority order', () => {
    const queue: PriorityQueueItem[] = [];

    insertWithPriority(queue, { key: 'a', data: {}, priority: 5, timestamp: Date.now() });
    insertWithPriority(queue, { key: 'b', data: {}, priority: 10, timestamp: Date.now() });
    insertWithPriority(queue, { key: 'c', data: {}, priority: 3, timestamp: Date.now() });

    expect(queue[0].key).toBe('b'); // priority 10
    expect(queue[1].key).toBe('a'); // priority 5
    expect(queue[2].key).toBe('c'); // priority 3
  });

  test('should handle duplicate priorities', () => {
    const queue: PriorityQueueItem[] = [];

    insertWithPriority(queue, { key: 'a', data: {}, priority: 5, timestamp: 1000 });
    insertWithPriority(queue, { key: 'b', data: {}, priority: 5, timestamp: 2000 });

    expect(queue).toHaveLength(2);
    expect(queue[0].priority).toBe(5);
    expect(queue[1].priority).toBe(5);
  });
});

describe('updatePriority', () => {
  let queue: PriorityQueueItem[];

  beforeEach(() => {
    queue = [
      { key: 'a', data: {}, priority: 10, timestamp: Date.now() },
      { key: 'b', data: {}, priority: 5, timestamp: Date.now() },
      { key: 'c', data: {}, priority: 3, timestamp: Date.now() }
    ];
  });

  test('should update priority and re-sort', () => {
    const result = updatePriority(queue, 'c', 15);

    expect(result).toBe(true);
    expect(queue[0].key).toBe('c'); // now highest priority
    expect(queue[0].priority).toBe(15);
  });

  test('should return false for non-existent key', () => {
    const result = updatePriority(queue, 'nonexistent', 20);
    expect(result).toBe(false);
  });

  test('should handle priority decrease', () => {
    const result = updatePriority(queue, 'a', 2);

    expect(result).toBe(true);
    expect(queue[2].key).toBe('a'); // now lowest priority
    expect(queue[2].priority).toBe(2);
  });
});

describe('updatePriorityIfHigher', () => {
  let queue: PriorityQueueItem[];

  beforeEach(() => {
    queue = [
      { key: 'a', data: {}, priority: 10, timestamp: Date.now() },
      { key: 'b', data: {}, priority: 5, timestamp: Date.now() }
    ];
  });

  test('should update if new priority is higher', () => {
    const result = updatePriorityIfHigher(queue, 'b', 15);

    expect(result).toBe(true);
    expect(queue[0].key).toBe('b');
    expect(queue[0].priority).toBe(15);
  });

  test('should not update if new priority is lower', () => {
    const result = updatePriorityIfHigher(queue, 'a', 8);

    expect(result).toBe(false);
    expect(queue[0].priority).toBe(10); // unchanged
  });

  test('should not update if new priority is equal', () => {
    const result = updatePriorityIfHigher(queue, 'a', 10);

    expect(result).toBe(false);
    expect(queue[0].priority).toBe(10);
  });

  test('should return false for non-existent key', () => {
    const result = updatePriorityIfHigher(queue, 'nonexistent', 20);
    expect(result).toBe(false);
  });
});

describe('dequeueN', () => {
  let queue: PriorityQueueItem[];

  beforeEach(() => {
    queue = [
      { key: 'a', data: {}, priority: 10, timestamp: Date.now() },
      { key: 'b', data: {}, priority: 5, timestamp: Date.now() },
      { key: 'c', data: {}, priority: 3, timestamp: Date.now() }
    ];
  });

  test('should dequeue single item by default', () => {
    const items = dequeueN(queue);

    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('a');
    expect(queue).toHaveLength(2);
  });

  test('should dequeue N items', () => {
    const items = dequeueN(queue, 2);

    expect(items).toHaveLength(2);
    expect(items[0].key).toBe('a');
    expect(items[1].key).toBe('b');
    expect(queue).toHaveLength(1);
    expect(queue[0].key).toBe('c');
  });

  test('should dequeue all items if N exceeds queue length', () => {
    const items = dequeueN(queue, 10);

    expect(items).toHaveLength(3);
    expect(queue).toHaveLength(0);
  });

  test('should return empty array for empty queue', () => {
    const emptyQueue: PriorityQueueItem[] = [];
    const items = dequeueN(emptyQueue);

    expect(items).toEqual([]);
    expect(emptyQueue).toHaveLength(0);
  });
});

describe('findInQueue', () => {
  let queue: PriorityQueueItem[];

  beforeEach(() => {
    queue = [
      { key: 'a', data: { value: 1 }, priority: 10, timestamp: Date.now() },
      { key: 'b', data: { value: 2 }, priority: 5, timestamp: Date.now() }
    ];
  });

  test('should find existing item', () => {
    const item = findInQueue(queue, 'b');

    expect(item).toBeDefined();
    expect(item?.key).toBe('b');
    expect(item?.data.value).toBe(2);
  });

  test('should return undefined for non-existent key', () => {
    const item = findInQueue(queue, 'nonexistent');
    expect(item).toBeUndefined();
  });

  test('should return undefined for empty queue', () => {
    const item = findInQueue([], 'a');
    expect(item).toBeUndefined();
  });
});

describe('hasKey', () => {
  let queue: PriorityQueueItem[];

  beforeEach(() => {
    queue = [
      { key: 'a', data: {}, priority: 10, timestamp: Date.now() },
      { key: 'b', data: {}, priority: 5, timestamp: Date.now() }
    ];
  });

  test('should return true for existing key', () => {
    expect(hasKey(queue, 'a')).toBe(true);
    expect(hasKey(queue, 'b')).toBe(true);
  });

  test('should return false for non-existent key', () => {
    expect(hasKey(queue, 'c')).toBe(false);
    expect(hasKey(queue, 'nonexistent')).toBe(false);
  });

  test('should return false for empty queue', () => {
    expect(hasKey([], 'a')).toBe(false);
  });
});

describe('removeFromQueue', () => {
  let queue: PriorityQueueItem[];

  beforeEach(() => {
    queue = [
      { key: 'a', data: {}, priority: 10, timestamp: Date.now() },
      { key: 'b', data: {}, priority: 5, timestamp: Date.now() },
      { key: 'c', data: {}, priority: 3, timestamp: Date.now() }
    ];
  });

  test('should remove existing item', () => {
    const result = removeFromQueue(queue, 'b');

    expect(result).toBe(true);
    expect(queue).toHaveLength(2);
    expect(hasKey(queue, 'b')).toBe(false);
  });

  test('should return false for non-existent key', () => {
    const result = removeFromQueue(queue, 'nonexistent');

    expect(result).toBe(false);
    expect(queue).toHaveLength(3);
  });

  test('should handle removing first item', () => {
    removeFromQueue(queue, 'a');
    expect(queue[0].key).toBe('b');
  });

  test('should handle removing last item', () => {
    removeFromQueue(queue, 'c');
    expect(queue).toHaveLength(2);
    expect(queue[queue.length - 1].key).toBe('b');
  });
});

describe('getQueueStats', () => {
  test('should return stats for populated queue', () => {
    const queue: PriorityQueueItem[] = [
      { key: 'a', data: {}, priority: 10, timestamp: 1000 },
      { key: 'b', data: {}, priority: 5, timestamp: 2000 },
      { key: 'c', data: {}, priority: 3, timestamp: 3000 }
    ];

    const stats = getQueueStats(queue);

    expect(stats.size).toBe(3);
    expect(stats.highestPriority).toBe(10);
    expect(stats.lowestPriority).toBe(3);
    expect(stats.averagePriority).toBe(6); // (10 + 5 + 3) / 3
    expect(stats.oldestTimestamp).toBe(1000);
    expect(stats.newestTimestamp).toBe(3000);
  });

  test('should return nulls for empty queue', () => {
    const stats = getQueueStats([]);

    expect(stats.size).toBe(0);
    expect(stats.highestPriority).toBe(null);
    expect(stats.lowestPriority).toBe(null);
    expect(stats.averagePriority).toBe(null);
    expect(stats.oldestTimestamp).toBe(null);
    expect(stats.newestTimestamp).toBe(null);
  });

  test('should return correct stats for single item', () => {
    const queue: PriorityQueueItem[] = [
      { key: 'a', data: {}, priority: 7, timestamp: 5000 }
    ];

    const stats = getQueueStats(queue);

    expect(stats.size).toBe(1);
    expect(stats.highestPriority).toBe(7);
    expect(stats.lowestPriority).toBe(7);
    expect(stats.averagePriority).toBe(7);
    expect(stats.oldestTimestamp).toBe(5000);
    expect(stats.newestTimestamp).toBe(5000);
  });

  test('should handle negative priorities', () => {
    const queue: PriorityQueueItem[] = [
      { key: 'a', data: {}, priority: -5, timestamp: Date.now() },
      { key: 'b', data: {}, priority: 10, timestamp: Date.now() },
      { key: 'c', data: {}, priority: -10, timestamp: Date.now() }
    ];

    const stats = getQueueStats(queue);

    expect(stats.highestPriority).toBe(10);
    expect(stats.lowestPriority).toBe(-10);
    expect(stats.averagePriority).toBe(-5 / 3);
  });
});

describe('clearQueue', () => {
  test('should clear all items from queue', () => {
    const queue: PriorityQueueItem[] = [
      { key: 'a', data: {}, priority: 10, timestamp: Date.now() },
      { key: 'b', data: {}, priority: 5, timestamp: Date.now() }
    ];

    const count = clearQueue(queue);

    expect(count).toBe(2);
    expect(queue).toHaveLength(0);
  });

  test('should return 0 for empty queue', () => {
    const queue: PriorityQueueItem[] = [];
    const count = clearQueue(queue);

    expect(count).toBe(0);
    expect(queue).toHaveLength(0);
  });
});

describe('Integration: Queue workflow', () => {
  test('should manage queue through typical workflow', () => {
    const queue: PriorityQueueItem[] = [];

    // Insert items
    insertWithPriority(queue, { key: 'task1', data: {}, priority: 5, timestamp: Date.now() });
    insertWithPriority(queue, { key: 'task2', data: {}, priority: 10, timestamp: Date.now() });
    insertWithPriority(queue, { key: 'task3', data: {}, priority: 3, timestamp: Date.now() });

    // Check stats
    let stats = getQueueStats(queue);
    expect(stats.size).toBe(3);
    expect(stats.highestPriority).toBe(10);

    // Verify order
    expect(queue[0].key).toBe('task2'); // highest priority first

    // Boost priority of task3
    updatePriority(queue, 'task3', 15);
    expect(queue[0].key).toBe('task3'); // now highest

    // Process highest priority item
    const processed = dequeueN(queue, 1);
    expect(processed[0].key).toBe('task3');
    expect(queue).toHaveLength(2);

    // Remove specific item
    removeFromQueue(queue, 'task1');
    expect(queue).toHaveLength(1);
    expect(queue[0].key).toBe('task2');

    // Clear remaining
    clearQueue(queue);
    expect(queue).toHaveLength(0);
  });

  test('should handle priority-based prefetch simulation', () => {
    const queue: PriorityQueueItem[] = [];

    // Add routes with different priorities
    insertWithPriority(queue, {
      key: '/home',
      data: { route: '/home' },
      priority: 10, // high priority
      timestamp: Date.now()
    });
    insertWithPriority(queue, {
      key: '/about',
      data: { route: '/about' },
      priority: 3, // low priority
      timestamp: Date.now()
    });
    insertWithPriority(queue, {
      key: '/profile',
      data: { route: '/profile' },
      priority: 7, // medium priority
      timestamp: Date.now()
    });

    // User hovers over /about - boost priority
    updatePriorityIfHigher(queue, '/about', 15);
    expect(queue[0].key).toBe('/about'); // now highest

    // Process batch of prefetches
    const batch = dequeueN(queue, 2);
    expect(batch[0].key).toBe('/about');
    expect(batch[1].key).toBe('/home');
    expect(queue).toHaveLength(1);
  });
});

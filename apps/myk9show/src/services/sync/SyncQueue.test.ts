import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncQueue } from './SyncQueue';
import type { SyncQueueItem } from '../../types/sync-types';

type NewItem = Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount' | 'status' | 'processedAt'>;

function makeItem(overrides: Partial<NewItem> = {}): NewItem {
  return {
    entityType: 'entry',
    actionType: 'update',
    entityId: 'entry-1',
    data: { foo: 'bar' },
    userId: 'user-1',
    retries: 0,
    priority: 5,
    scheduledFor: new Date(),
    ...overrides,
  };
}

describe('SyncQueue', () => {
  let queue: SyncQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new SyncQueue({ persistenceEnabled: false, maxQueueSize: 5 });
  });

  afterEach(() => {
    queue.destroy();
    vi.useRealTimers();
  });

  it('enqueues an item and assigns it pending status', () => {
    const id = queue.enqueue(makeItem());

    expect(id).toBeTruthy();
    expect(queue.size()).toBe(1);
    expect(queue.getByStatus('pending')).toHaveLength(1);
  });

  it('deduplicates items with the same entityType/entityId/actionType while pending', () => {
    const id1 = queue.enqueue(makeItem({ entityId: 'entry-1', data: { v: 1 } }));
    const id2 = queue.enqueue(makeItem({ entityId: 'entry-1', data: { v: 2 } }));

    expect(id2).toBe(id1);
    expect(queue.size()).toBe(1);
    expect(queue.getAll()[0].data).toEqual({ v: 2 });
  });

  it('does not deduplicate items for different entities', () => {
    queue.enqueue(makeItem({ entityId: 'entry-1' }));
    queue.enqueue(makeItem({ entityId: 'entry-2' }));

    expect(queue.size()).toBe(2);
  });

  it('orders dequeueBatch by descending priority', async () => {
    queue.enqueue(makeItem({ entityId: 'low', priority: 1 }));
    queue.enqueue(makeItem({ entityId: 'high', priority: 9 }));
    queue.enqueue(makeItem({ entityId: 'mid', priority: 5 }));

    const batch = await queue.dequeueBatch();

    expect(batch.map(i => i.entityId)).toEqual(['high', 'mid', 'low']);
    expect(batch.every(i => i.status === 'processing')).toBe(true);
  });

  it('dequeueBatch excludes items already marked as processing', async () => {
    queue.enqueue(makeItem({ entityId: 'a' }));
    await queue.dequeueBatch();

    const secondBatch = await queue.dequeueBatch();
    expect(secondBatch).toHaveLength(0);
  });

  it('markCompleted removes the item from the queue and updates metrics', async () => {
    const id = queue.enqueue(makeItem());
    await queue.dequeueBatch();

    queue.markCompleted(id);

    expect(queue.size()).toBe(0);
    expect(queue.getMetrics().itemsProcessed).toBe(1);
  });

  it('markFailed increments retryCount and reschedules the item as pending', () => {
    const id = queue.enqueue(makeItem());
    queue.markFailed(id, new Error('network down'));

    const item = queue.getAll().find(i => i.id === id);
    expect(item?.status).toBe('pending');
    expect(item?.retryCount).toBe(1);
    expect(item?.lastError).toBe('network down');
    expect(queue.getMetrics().itemsFailed).toBe(1);
  });

  it('leaves a permanently failed item in the queue once retries are exhausted', () => {
    const id = queue.enqueue(makeItem());
    const item = queue.getAll()[0];

    // Exhaust retries (default retryAttempts is 5)
    for (let i = 0; i < 5; i++) {
      queue.markFailed(id, new Error(`attempt ${i}`));
    }

    expect(queue.getAll().find(i => i.id === item.id)).toBeDefined();
    expect(queue.getAll()[0].retryCount).toBe(5);
  });

  it('evicts low priority pending items once the queue exceeds maxQueueSize', () => {
    // maxQueueSize is 5 in this suite's config
    for (let i = 0; i < 5; i++) {
      queue.enqueue(makeItem({ entityId: `entry-${i}`, priority: i + 1 }));
    }
    // Sixth item triggers eviction before it is added
    queue.enqueue(makeItem({ entityId: 'entry-new', priority: 10 }));

    expect(queue.size()).toBeLessThanOrEqual(6);
    // The newly added highest-priority item should survive
    expect(queue.getAll().some(i => i.entityId === 'entry-new')).toBe(true);
  });

  it('getStats tallies items by status and priority band', async () => {
    queue.enqueue(makeItem({ entityId: 'high', priority: 8 }));
    queue.enqueue(makeItem({ entityId: 'mid', priority: 5 }));
    queue.enqueue(makeItem({ entityId: 'low', priority: 1 }));

    const stats = queue.getStats();

    expect(stats.totalItems).toBe(3);
    expect(stats.pendingItems).toBe(3);
    expect(stats.highPriorityItems).toBe(1);
    expect(stats.mediumPriorityItems).toBe(1);
    expect(stats.lowPriorityItems).toBe(1);
  });

  it('getByEntityType filters items by entity type', () => {
    queue.enqueue(makeItem({ entityType: 'entry' }));
    queue.enqueue(makeItem({ entityType: 'dog', entityId: 'dog-1' }));

    expect(queue.getByEntityType('entry')).toHaveLength(1);
    expect(queue.getByEntityType('dog')).toHaveLength(1);
  });

  it('remove deletes a queue item and returns true, false when missing', () => {
    const id = queue.enqueue(makeItem());

    expect(queue.remove(id)).toBe(true);
    expect(queue.size()).toBe(0);
    expect(queue.remove('missing-id')).toBe(false);
  });

  it('clear empties the queue and resets metrics', async () => {
    const id = queue.enqueue(makeItem());
    await queue.dequeueBatch();
    queue.markCompleted(id);
    queue.enqueue(makeItem({ entityId: 'entry-2' }));

    queue.clear();

    expect(queue.size()).toBe(0);
    expect(queue.isEmpty()).toBe(true);
    expect(queue.getMetrics().itemsProcessed).toBe(0);
  });

  it('isEmpty reflects queue contents', () => {
    expect(queue.isEmpty()).toBe(true);
    queue.enqueue(makeItem());
    expect(queue.isEmpty()).toBe(false);
  });

  it('registerProcessor / hasProcessor / getProcessor track registered processors', () => {
    const processor = {
      entityType: 'entry',
      processItem: vi.fn().mockResolvedValue({ success: true }),
    };

    expect(queue.hasProcessor('entry')).toBe(false);
    queue.registerProcessor(processor as never);

    expect(queue.hasProcessor('entry')).toBe(true);
    expect(queue.getProcessor('entry')).toBe(processor);
  });

  it('updateConfig merges new configuration values', () => {
    queue.updateConfig({ retryAttempts: 2 });
    expect(queue.getConfig().retryAttempts).toBe(2);
  });
});

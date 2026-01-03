/**
 * Tests for NotificationQueue Class
 */

import { NotificationQueue, type NotificationPayload } from './NotificationQueue';

describe('NotificationQueue', () => {
  let queue: NotificationQueue;

  beforeEach(() => {
    queue = new NotificationQueue();
    vi.useFakeTimers();
  });

  afterEach(() => {
    queue.stopProcessing();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const instance = new NotificationQueue();
      expect(instance.getStatus().count).toBe(0);
    });

    it('should create instance with custom max retries', () => {
      const instance = new NotificationQueue({ maxRetries: 5 });
      const id = instance.enqueue({ type: 'test', title: 'Test' });
      const item = instance.getItem(id);
      expect(item?.maxRetries).toBe(5);
    });

    it('should create instance with custom processing interval', () => {
      const instance = new NotificationQueue({ processingInterval: 60000 });
      expect(instance.isProcessing()).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('should add item to queue with immediate scheduling', () => {
      const payload: NotificationPayload = {
        type: 'your_turn',
        title: 'Your turn',
        priority: 'high',
      };

      const id = queue.enqueue(payload);

      expect(id).toBeDefined();
      expect(queue.getStatus().count).toBe(1);

      const item = queue.getItem(id);
      expect(item?.payload.title).toBe('Your turn');
      expect(item?.retryCount).toBe(0);
    });

    it('should add item with scheduled delivery time', () => {
      const futureTime = Date.now() + 60000; // 1 minute from now

      const id = queue.enqueue(
        { type: 'reminder', title: 'Reminder' },
        futureTime
      );

      const item = queue.getItem(id);
      expect(item?.scheduledFor).toBe(futureTime);
    });

    it('should use provided ID if present in payload', () => {
      const customId = 'custom_123';
      const id = queue.enqueue({
        id: customId,
        type: 'test',
        title: 'Test',
      });

      expect(id).toBe(customId);
    });

    it('should generate unique IDs for multiple items', () => {
      const id1 = queue.enqueue({ type: 'test', title: 'Test 1' });
      const id2 = queue.enqueue({ type: 'test', title: 'Test 2' });

      expect(id1).not.toBe(id2);
    });

    it('should set createdAt timestamp', () => {
      const beforeTime = Date.now();
      const id = queue.enqueue({ type: 'test', title: 'Test' });
      const afterTime = Date.now();

      const item = queue.getItem(id);
      expect(item?.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(item?.createdAt).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('remove', () => {
    it('should remove item from queue', () => {
      const id = queue.enqueue({ type: 'test', title: 'Test' });
      expect(queue.getStatus().count).toBe(1);

      const removed = queue.remove(id);

      expect(removed).toBe(true);
      expect(queue.getStatus().count).toBe(0);
    });

    it('should return false when removing non-existent item', () => {
      const removed = queue.remove('nonexistent');

      expect(removed).toBe(false);
    });

    it('should only remove specified item', () => {
      const id1 = queue.enqueue({ type: 'test', title: 'Test 1' });
      const id2 = queue.enqueue({ type: 'test', title: 'Test 2' });
      const id3 = queue.enqueue({ type: 'test', title: 'Test 3' });

      queue.remove(id2);

      expect(queue.getStatus().count).toBe(2);
      expect(queue.getItem(id1)).toBeDefined();
      expect(queue.getItem(id2)).toBeUndefined();
      expect(queue.getItem(id3)).toBeDefined();
    });
  });

  describe('getReadyItems', () => {
    it('should return items scheduled for now or past', () => {
      const past = Date.now() - 10000;
      const now = Date.now();
      const future = Date.now() + 10000;

      queue.enqueue({ type: 'test', title: 'Past' }, past);
      queue.enqueue({ type: 'test', title: 'Now' }, now);
      queue.enqueue({ type: 'test', title: 'Future' }, future);

      const ready = queue.getReadyItems();

      expect(ready.length).toBe(2);
      expect(ready.some(item => item.payload.title === 'Past')).toBe(true);
      expect(ready.some(item => item.payload.title === 'Now')).toBe(true);
      expect(ready.some(item => item.payload.title === 'Future')).toBe(false);
    });

    it('should return empty array when no items are ready', () => {
      const future = Date.now() + 60000;
      queue.enqueue({ type: 'test', title: 'Future' }, future);

      const ready = queue.getReadyItems();

      expect(ready).toEqual([]);
    });

    it('should return all items when all are ready', () => {
      queue.enqueue({ type: 'test', title: 'Test 1' });
      queue.enqueue({ type: 'test', title: 'Test 2' });

      const ready = queue.getReadyItems();

      expect(ready.length).toBe(2);
    });
  });

  describe('getAllItems', () => {
    it('should return all queue items', () => {
      queue.enqueue({ type: 'test', title: 'Test 1' });
      queue.enqueue({ type: 'test', title: 'Test 2' });

      const items = queue.getAllItems();

      expect(items.length).toBe(2);
    });

    it('should return copy of items', () => {
      queue.enqueue({ type: 'test', title: 'Test' });

      const items = queue.getAllItems();
      items.push({
        id: 'fake',
        payload: { type: 'fake', title: 'Fake' },
        scheduledFor: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
      });

      expect(queue.getStatus().count).toBe(1);
    });
  });

  describe('getItem', () => {
    it('should return specific item by ID', () => {
      const id = queue.enqueue({ type: 'test', title: 'Test' });

      const item = queue.getItem(id);

      expect(item?.id).toBe(id);
      expect(item?.payload.title).toBe('Test');
    });

    it('should return undefined for non-existent item', () => {
      const item = queue.getItem('nonexistent');

      expect(item).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('should return correct count and items', () => {
      queue.enqueue({ type: 'test', title: 'Test 1' });
      queue.enqueue({ type: 'test', title: 'Test 2' });

      const status = queue.getStatus();

      expect(status.count).toBe(2);
      expect(status.items.length).toBe(2);
    });

    it('should return copy of items', () => {
      queue.enqueue({ type: 'test', title: 'Test' });

      const status = queue.getStatus();
      status.items.push({
        id: 'fake',
        payload: { type: 'fake', title: 'Fake' },
        scheduledFor: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
      });

      expect(queue.getStatus().count).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all items from queue', () => {
      queue.enqueue({ type: 'test', title: 'Test 1' });
      queue.enqueue({ type: 'test', title: 'Test 2' });

      expect(queue.getStatus().count).toBe(2);

      queue.clear();

      expect(queue.getStatus().count).toBe(0);
      expect(queue.getAllItems()).toEqual([]);
    });
  });

  describe('process', () => {
    it('should throw error if handler not set', async () => {
      await expect(queue.process()).rejects.toThrow('Process handler not set');
    });

    it('should process ready items successfully', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      queue.startProcessing(handler);

      queue.enqueue({ type: 'test', title: 'Test 1' });
      queue.enqueue({ type: 'test', title: 'Test 2' });

      const result = await queue.process();

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.retrying).toBe(0);
      expect(queue.getStatus().count).toBe(0);
    });

    it('should retry failed items', async () => {
      const handler = vi.fn().mockResolvedValue(false);
      queue.startProcessing(handler);

      queue.enqueue({ type: 'test', title: 'Test' });

      const result = await queue.process();

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.retrying).toBe(1);
      expect(queue.getStatus().count).toBe(1);

      const item = queue.getAllItems()[0];
      expect(item.retryCount).toBe(1);
      expect(item.scheduledFor).toBeGreaterThan(Date.now());
    });

    it('should remove items after max retries', async () => {
      const testQueue = new NotificationQueue({ maxRetries: 2 });
      const handler = vi.fn().mockResolvedValue(false);
      testQueue.startProcessing(handler);

      testQueue.enqueue({ type: 'test', title: 'Test' });

      // First failure - retryCount becomes 1, still under maxRetries (2)
      await testQueue.process();
      expect(testQueue.getStatus().count).toBe(1);

      // Make it ready for second retry
      const item1 = testQueue.getAllItems()[0];
      item1.scheduledFor = Date.now();

      // Second failure - retryCount becomes 2, reaches maxRetries, should be removed
      await testQueue.process();
      expect(testQueue.getStatus().count).toBe(0);
    });

    it('should handle handler exceptions', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      queue.startProcessing(handler);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      queue.enqueue({ type: 'test', title: 'Test' });

      const result = await queue.process();

      expect(result.processed).toBe(1);
      expect(result.retrying).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should apply exponential backoff', async () => {
      const handler = vi.fn().mockResolvedValue(false);
      queue.startProcessing(handler);

      queue.enqueue({ type: 'test', title: 'Test' });
      const now = Date.now();

      // First failure - retryCount becomes 1, backoff 2^1 = 2 minutes
      await queue.process();
      let item = queue.getAllItems()[0];
      expect(item.scheduledFor - now).toBe(120000); // 2^1 * 60000 = 120000

      // Make it ready again
      item.scheduledFor = now;

      // Second failure - retryCount becomes 2, backoff 2^2 = 4 minutes
      await queue.process();
      item = queue.getAllItems()[0];
      expect(item.scheduledFor - now).toBe(240000); // 2^2 * 60000 = 240000
    });

    it('should not process future-scheduled items', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      queue.startProcessing(handler);

      queue.enqueue({ type: 'test', title: 'Future' }, Date.now() + 60000);

      const result = await queue.process();

      expect(result.processed).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('startProcessing', () => {
    it('should start automatic processing', () => {
      const handler = vi.fn().mockResolvedValue(true);

      queue.startProcessing(handler);

      expect(queue.isProcessing()).toBe(true);
    });

    it('should process queue at interval', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      queue.startProcessing(handler);

      queue.enqueue({ type: 'test', title: 'Test' });

      // Advance time by processing interval (default 30s)
      await vi.advanceTimersByTimeAsync(30000);

      expect(handler).toHaveBeenCalled();
    });

    it('should warn if processing already started', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const handler = vi.fn().mockResolvedValue(true);

      queue.startProcessing(handler);
      queue.startProcessing(handler);

      expect(consoleWarnSpy).toHaveBeenCalledWith('Queue processing already started');
    });
  });

  describe('stopProcessing', () => {
    it('should stop automatic processing', () => {
      const handler = vi.fn().mockResolvedValue(true);

      queue.startProcessing(handler);
      expect(queue.isProcessing()).toBe(true);

      queue.stopProcessing();
      expect(queue.isProcessing()).toBe(false);
    });

    it('should not process after stopping', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      queue.startProcessing(handler);
      queue.enqueue({ type: 'test', title: 'Test' });

      queue.stopProcessing();

      // Advance time
      await vi.advanceTimersByTimeAsync(30000);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should be safe to call when not processing', () => {
      expect(() => queue.stopProcessing()).not.toThrow();
    });
  });

  describe('isProcessing', () => {
    it('should return false initially', () => {
      expect(queue.isProcessing()).toBe(false);
    });

    it('should return true when processing', () => {
      const handler = vi.fn().mockResolvedValue(true);
      queue.startProcessing(handler);

      expect(queue.isProcessing()).toBe(true);
    });

    it('should return false after stopping', () => {
      const handler = vi.fn().mockResolvedValue(true);
      queue.startProcessing(handler);
      queue.stopProcessing();

      expect(queue.isProcessing()).toBe(false);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complete queue lifecycle', async () => {
      const handler = vi.fn()
        .mockResolvedValueOnce(false) // First attempt fails
        .mockResolvedValueOnce(true); // Second attempt succeeds

      queue.startProcessing(handler);

      const id = queue.enqueue({
        type: 'your_turn',
        title: 'Your turn',
        priority: 'high',
      });

      // First process - should fail and reschedule
      await queue.process();
      expect(queue.getStatus().count).toBe(1);
      expect(queue.getItem(id)?.retryCount).toBe(1);

      // Make it ready again
      const item = queue.getItem(id);
      if (item) {
        item.scheduledFor = Date.now();
      }

      // Second process - should succeed
      await queue.process();
      expect(queue.getStatus().count).toBe(0);
    });

    it('should handle mixed success and failure', async () => {
      let callCount = 0;
      const handler = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount % 2 === 0); // Alternate success/failure
      });

      queue.startProcessing(handler);

      queue.enqueue({ type: 'test', title: 'Test 1' });
      queue.enqueue({ type: 'test', title: 'Test 2' });
      queue.enqueue({ type: 'test', title: 'Test 3' });

      const result = await queue.process();

      expect(result.processed).toBe(3);
      expect(result.successful).toBe(1);
      expect(result.retrying).toBe(2);
    });

    it('should handle scheduled notifications', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      queue.startProcessing(handler);

      const now = Date.now();

      // Schedule 3 notifications at different times
      queue.enqueue({ type: 'test', title: 'Now' }, now);
      queue.enqueue({ type: 'test', title: '1 min' }, now + 60000);
      queue.enqueue({ type: 'test', title: '2 min' }, now + 120000);

      // Process immediately - only first should process
      let result = await queue.process();
      expect(result.processed).toBe(1);
      expect(queue.getStatus().count).toBe(2);

      // Advance 1 minute - second should process
      vi.setSystemTime(now + 60000);
      result = await queue.process();
      expect(result.processed).toBe(1);
      expect(queue.getStatus().count).toBe(1);

      // Advance 2 minutes - third should process
      vi.setSystemTime(now + 120000);
      result = await queue.process();
      expect(result.processed).toBe(1);
      expect(queue.getStatus().count).toBe(0);
    });
  });
});

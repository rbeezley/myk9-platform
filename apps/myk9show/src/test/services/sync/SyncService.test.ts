// Comprehensive tests for SyncService (MockSyncService) core functionality
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncService, MockSyncService, syncService } from '@/services/sync/syncService';
import type { MockSyncQueueItem } from '@/services/sync/syncService';

describe('SyncService', () => {
  let service: MockSyncService;

  beforeEach(() => {
    service = new SyncService();
    vi.clearAllMocks();
    // Suppress console.debug from deprecated stubs
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Instantiation', () => {
    it('should create a new instance', () => {
      const instance = new SyncService();
      expect(instance).toBeInstanceOf(MockSyncService);
    });

    it('should export a singleton syncService instance', () => {
      expect(syncService).toBeInstanceOf(MockSyncService);
    });

    it('should export SyncService as alias for MockSyncService', () => {
      expect(SyncService).toBe(MockSyncService);
    });
  });

  describe('addToQueue', () => {
    it('should add an item and return a queue id string', async () => {
      const item: MockSyncQueueItem = {
        entityType: 'club',
        entityId: 'club-123',
        operation: 'create',
        data: { name: 'Test Club' },
        priority: 'medium',
      };

      const queueId = await service.addToQueue(item);

      expect(queueId).toBeDefined();
      expect(typeof queueId).toBe('string');
      expect(queueId).toMatch(/^mock-queue-/);
    });

    it('should return unique ids for different calls', async () => {
      const item: MockSyncQueueItem = {
        entityType: 'club',
        entityId: 'club-1',
        operation: 'create',
        data: {},
        priority: 'low',
      };

      const id1 = await service.addToQueue(item);
      // Small delay to ensure Date.now() differs
      await new Promise((r) => setTimeout(r, 2));
      const id2 = await service.addToQueue(item);

      expect(id1).not.toBe(id2);
    });

    it('should handle create operations', async () => {
      const queueId = await service.addToQueue({
        entityType: 'dog',
        entityId: 'dog-1',
        operation: 'create',
        data: { name: 'Rex' },
        priority: 'medium',
      });

      expect(queueId).toBeDefined();
    });

    it('should handle update operations', async () => {
      const queueId = await service.addToQueue({
        entityType: 'dog',
        entityId: 'dog-1',
        operation: 'update',
        data: { name: 'Rex Updated' },
        priority: 'medium',
      });

      expect(queueId).toBeDefined();
    });

    it('should handle delete operations', async () => {
      const queueId = await service.addToQueue({
        entityType: 'entry',
        entityId: 'entry-1',
        operation: 'delete',
        data: {},
        priority: 'high',
      });

      expect(queueId).toBeDefined();
    });

    it('should handle different entity types', async () => {
      const entityTypes = ['club', 'person', 'dog', 'show', 'entry'];

      for (const entityType of entityTypes) {
        const queueId = await service.addToQueue({
          entityType,
          entityId: `${entityType}-123`,
          operation: 'create',
          data: {},
          priority: 'medium',
        });

        expect(queueId).toBeDefined();
        expect(typeof queueId).toBe('string');
      }
    });

    it('should handle all priority levels', async () => {
      const priorities: MockSyncQueueItem['priority'][] = ['low', 'medium', 'high', 'critical'];

      for (const priority of priorities) {
        const queueId = await service.addToQueue({
          entityType: 'club',
          entityId: 'club-1',
          operation: 'create',
          data: {},
          priority,
        });

        expect(queueId).toBeDefined();
      }
    });

    it('should handle items with complex data payloads', async () => {
      const queueId = await service.addToQueue({
        entityType: 'show',
        entityId: 'show-1',
        operation: 'update',
        data: {
          name: 'Big Show',
          dates: { start: '2026-03-01', end: '2026-03-03' },
          entries: [1, 2, 3],
          nested: { deep: { value: true } },
        },
        priority: 'high',
      });

      expect(queueId).toBeDefined();
    });

    it('should log a deprecation debug message', async () => {
      await service.addToQueue({
        entityType: 'club',
        entityId: 'club-1',
        operation: 'create',
        data: {},
        priority: 'low',
      });

      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEPRECATED]'),
        'club'
      );
    });

    it('should handle large batches of items efficiently', async () => {
      const startTime = performance.now();

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          service.addToQueue({
            entityType: 'club',
            entityId: `club-${i}`,
            operation: 'create',
            data: { name: `Club ${i}` },
            priority: 'medium',
          })
        );
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();

      expect(results).toHaveLength(100);
      results.forEach((id) => {
        expect(typeof id).toBe('string');
      });
      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status object', async () => {
      const status = await service.getQueueStatus();

      expect(status).toEqual({
        pending: 0,
        processing: 0,
        failed: 0,
        completed: 0,
      });
    });

    it('should return numeric values for all status fields', async () => {
      const status = await service.getQueueStatus();

      expect(typeof status.pending).toBe('number');
      expect(typeof status.processing).toBe('number');
      expect(typeof status.failed).toBe('number');
      expect(typeof status.completed).toBe('number');
    });

    it('should return zeros since this is a no-op stub', async () => {
      // Add some items first (they won't actually be queued)
      await service.addToQueue({
        entityType: 'club',
        entityId: 'club-1',
        operation: 'create',
        data: {},
        priority: 'medium',
      });

      const status = await service.getQueueStatus();

      expect(status.pending).toBe(0);
      expect(status.processing).toBe(0);
      expect(status.failed).toBe(0);
      expect(status.completed).toBe(0);
    });
  });

  describe('processQueue', () => {
    it('should resolve without error', async () => {
      await expect(service.processQueue()).resolves.not.toThrow();
    });

    it('should return void', async () => {
      const result = await service.processQueue();
      expect(result).toBeUndefined();
    });

    it('should log a deprecation debug message', async () => {
      await service.processQueue();

      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEPRECATED]')
      );
    });
  });

  describe('clearQueue', () => {
    it('should resolve without error', async () => {
      await expect(service.clearQueue()).resolves.not.toThrow();
    });

    it('should return void', async () => {
      const result = await service.clearQueue();
      expect(result).toBeUndefined();
    });

    it('should log a deprecation debug message', async () => {
      await service.clearQueue();

      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEPRECATED]')
      );
    });
  });

  describe('End-to-end workflow', () => {
    it('should support full queue lifecycle: add, process, check status, clear', async () => {
      // Add item to queue
      const queueId = await service.addToQueue({
        entityType: 'entry',
        entityId: 'entry-42',
        operation: 'create',
        data: { dogId: 'dog-1', classId: 'class-1' },
        priority: 'high',
      });
      expect(queueId).toBeDefined();

      // Process queue
      await expect(service.processQueue()).resolves.not.toThrow();

      // Check status
      const status = await service.getQueueStatus();
      expect(status).toBeDefined();
      expect(status.pending).toBe(0);

      // Clear queue
      await expect(service.clearQueue()).resolves.not.toThrow();
    });

    it('should handle repeated process and clear calls gracefully', async () => {
      await service.processQueue();
      await service.processQueue();
      await service.clearQueue();
      await service.clearQueue();
      await service.processQueue();

      // Should not throw
      const status = await service.getQueueStatus();
      expect(status).toBeDefined();
    });
  });
});

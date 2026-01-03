import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncService } from '@/services/sync/SyncService';
import { SyncQueue } from '@/services/sync/SyncQueue';

// Mock Supabase
const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn().mockResolvedValue({ data: { id: 'server-id-123' }, error: null }),
    update: vi.fn().mockResolvedValue({ data: { id: 'server-id-123' }, error: null }),
    delete: vi.fn().mockResolvedValue({ data: null, error: null }),
    select: vi.fn().mockResolvedValue({ data: [], error: null })
  })),
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn()
  }))
};

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn().mockResolvedValue({
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        add: vi.fn().mockResolvedValue('id'),
        put: vi.fn().mockResolvedValue('id'),
        delete: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(undefined),
        getAll: vi.fn().mockResolvedValue([]),
        clear: vi.fn().mockResolvedValue(undefined)
      }))
    }))
  })
};

Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB
});

// Mock network status
const mockNetworkStatus = { online: true };
Object.defineProperty(navigator, 'onLine', {
  get: () => mockNetworkStatus.online,
  configurable: true
});

describe('Sync Queue Processing Tests', () => {
  let syncService: SyncService;
  let syncQueue: SyncQueue;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockNetworkStatus.online = true;
    
    syncQueue = new SyncQueue();
    syncService = new SyncService();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await syncService.stop();
    vi.clearAllTimers();
  });

  describe('Basic Queue Processing', () => {
    it('should process single sync action successfully', async () => {
      const syncAction = {
        id: 'action-1',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-123',
        data: {
          name: 'Test Dog',
          breed: 'Golden Retriever',
          sex: 'male'
        },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(syncAction);
      
      const result = await syncService.processQueue();
      
      expect(result.processed).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      
      // Should have called Supabase insert
      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should process multiple sync actions in order', async () => {
      const actions = [
        {
          id: 'action-1',
          entityType: 'person' as const,
          actionType: 'create' as const,
          entityId: 'temp-person-1',
          data: { firstName: 'John', lastName: 'Doe' },
          timestamp: new Date(Date.now() - 2000),
          userId: 'user-123',
          retries: 0
        },
        {
          id: 'action-2',
          entityType: 'dog' as const,
          actionType: 'create' as const,
          entityId: 'temp-dog-1',
          data: { name: 'Rex', breed: 'GSD' },
          timestamp: new Date(Date.now() - 1000),
          userId: 'user-123',
          retries: 0
        },
        {
          id: 'action-3',
          entityType: 'show' as const,
          actionType: 'create' as const,
          entityId: 'temp-show-1',
          data: { name: 'Test Show', date: '2024-06-01' },
          timestamp: new Date(),
          userId: 'user-123',
          retries: 0
        }
      ];

      for (const action of actions) {
        await syncQueue.add(action);
      }

      const result = await syncService.processQueue();

      expect(result.processed).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);

      // Should process in timestamp order (oldest first)
      const fromCalls = mockSupabase.from.mock.calls;
      expect(fromCalls[0][0]).toBe('people');
      expect(fromCalls[1][0]).toBe('dogs');
      expect(fromCalls[2][0]).toBe('shows');
    });

    it('should handle batch processing correctly', async () => {
      // Add many actions
      const actions = Array.from({ length: 25 }, (_, i) => ({
        id: `action-${i}`,
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: `temp-dog-${i}`,
        data: { name: `Dog ${i}`, breed: 'Test' },
        timestamp: new Date(Date.now() + i * 100),
        userId: 'user-123',
        retries: 0
      }));

      for (const action of actions) {
        await syncQueue.add(action);
      }

      const result = await syncService.processQueue();

      expect(result.processed).toBe(25);
      expect(result.successful).toBe(25);
      
      // Should have processed in batches
      expect(mockSupabase.from).toHaveBeenCalledTimes(25);
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry failed sync actions with exponential backoff', async () => {
      let attemptCount = 0;
      mockSupabase.from.mockImplementation(() => ({
        insert: vi.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 3) {
            return Promise.resolve({ data: null, error: { message: 'Network error' } });
          }
          return Promise.resolve({ data: { id: 'server-id-123' }, error: null });
        })
      }));

      const syncAction = {
        id: 'action-retry',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-retry',
        data: { name: 'Retry Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(syncAction);

      // Process queue multiple times to trigger retries
      await syncService.processQueue();
      
      // Wait for retry delay
      await new Promise(resolve => setTimeout(resolve, 1100));
      await syncService.processQueue();
      
      await new Promise(resolve => setTimeout(resolve, 2100));
      await syncService.processQueue();

      expect(attemptCount).toBe(3);
    });

    it('should mark actions as failed after max retries', async () => {
      mockSupabase.from.mockImplementation(() => ({
        insert: vi.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Persistent error' } 
        })
      }));

      const syncAction = {
        id: 'action-fail',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-fail',
        data: { name: 'Fail Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(syncAction);

      // Process queue enough times to exceed max retries
      for (let i = 0; i < 5; i++) {
        await syncService.processQueue();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const queueStatus = await syncQueue.getStatus();
      expect(queueStatus.failed).toBeGreaterThan(0);
    });

    it('should handle network timeouts gracefully', async () => {
      mockSupabase.from.mockImplementation(() => ({
        insert: vi.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 30000)
          )
        )
      }));

      const syncAction = {
        id: 'action-timeout',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-timeout',
        data: { name: 'Timeout Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(syncAction);

      const startTime = Date.now();
      await syncService.processQueue();
      const endTime = Date.now();

      // Should timeout quickly, not wait 30 seconds
      expect(endTime - startTime).toBeLessThan(10000);
    });
  });

  describe('Priority Processing', () => {
    it('should process high priority actions first', async () => {
      const lowPriorityAction = {
        id: 'action-low',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-low',
        data: { name: 'Low Priority Dog' },
        timestamp: new Date(Date.now() - 1000),
        userId: 'user-123',
        retries: 0,
        priority: 'low' as const
      };

      const highPriorityAction = {
        id: 'action-high',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-high',
        data: { name: 'High Priority Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0,
        priority: 'high' as const
      };

      await syncQueue.add(lowPriorityAction);
      await syncQueue.add(highPriorityAction);

      const processOrder: string[] = [];
      mockSupabase.from.mockImplementation(() => ({
        insert: vi.fn().mockImplementation((data) => {
          processOrder.push(data.name);
          return Promise.resolve({ data: { id: 'server-id' }, error: null });
        })
      }));

      await syncService.processQueue();

      expect(processOrder[0]).toBe('High Priority Dog');
      expect(processOrder[1]).toBe('Low Priority Dog');
    });

    it('should prioritize user actions over system actions', async () => {
      const systemAction = {
        id: 'action-system',
        entityType: 'dog' as const,
        actionType: 'update' as const,
        entityId: 'dog-system',
        data: { _lastModified: new Date() },
        timestamp: new Date(),
        userId: 'system',
        retries: 0,
        priority: 'low' as const
      };

      const userAction = {
        id: 'action-user',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-user',
        data: { name: 'User Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0,
        priority: 'medium' as const
      };

      await syncQueue.add(systemAction);
      await syncQueue.add(userAction);

      const processOrder: string[] = [];
      mockSupabase.from.mockImplementation(() => ({
        insert: vi.fn().mockImplementation((data) => {
          processOrder.push(data.name || 'system-update');
          return Promise.resolve({ data: { id: 'server-id' }, error: null });
        }),
        update: vi.fn().mockImplementation(() => {
          processOrder.push('system-update');
          return Promise.resolve({ data: { id: 'server-id' }, error: null });
        })
      }));

      await syncService.processQueue();

      expect(processOrder[0]).toBe('User Dog');
      expect(processOrder[1]).toBe('system-update');
    });
  });

  describe('Different Action Types', () => {
    it('should handle CREATE actions correctly', async () => {
      const createAction = {
        id: 'action-create',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-create',
        data: {
          name: 'New Dog',
          breed: 'Labrador',
          sex: 'female'
        },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(createAction);
      await syncService.processQueue();

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      const insertCall = mockSupabase.from().insert;
      expect(insertCall).toHaveBeenCalledWith({
        name: 'New Dog',
        breed: 'Labrador',
        sex: 'female'
      });
    });

    it('should handle UPDATE actions correctly', async () => {
      const updateAction = {
        id: 'action-update',
        entityType: 'dog' as const,
        actionType: 'update' as const,
        entityId: 'existing-dog-123',
        data: {
          name: 'Updated Dog Name',
          _version: 2
        },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({ data: { id: 'existing-dog-123' }, error: null }),
        eq: vi.fn().mockReturnThis()
      }));

      await syncQueue.add(updateAction);
      await syncService.processQueue();

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      const updateCall = mockSupabase.from().update;
      expect(updateCall).toHaveBeenCalledWith({
        name: 'Updated Dog Name',
        _version: 2
      });
    });

    it('should handle DELETE actions correctly', async () => {
      const deleteAction = {
        id: 'action-delete',
        entityType: 'dog' as const,
        actionType: 'delete' as const,
        entityId: 'dog-to-delete',
        data: {},
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      mockSupabase.from.mockImplementation(() => ({
        delete: vi.fn().mockResolvedValue({ data: null, error: null }),
        eq: vi.fn().mockReturnThis()
      }));

      await syncQueue.add(deleteAction);
      await syncService.processQueue();

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      const deleteCall = mockSupabase.from().delete;
      expect(deleteCall).toHaveBeenCalled();
    });
  });

  describe('Network State Handling', () => {
    it('should pause processing when offline', async () => {
      const syncAction = {
        id: 'action-offline',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-offline',
        data: { name: 'Offline Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(syncAction);

      // Go offline
      mockNetworkStatus.online = false;

      const result = await syncService.processQueue();

      expect(result.processed).toBe(0);
      expect(mockSupabase.from).not.toHaveBeenCalled();

      // Verify queue still has the action
      const queueStatus = await syncQueue.getStatus();
      expect(queueStatus.pending).toBe(1);
    });

    it('should resume processing when back online', async () => {
      const syncAction = {
        id: 'action-resume',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-resume',
        data: { name: 'Resume Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(syncAction);

      // Start offline
      mockNetworkStatus.online = false;
      let result = await syncService.processQueue();
      expect(result.processed).toBe(0);

      // Go back online
      mockNetworkStatus.online = true;
      result = await syncService.processQueue();

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(1);
      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should detect intermittent connectivity issues', async () => {
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => ({
        insert: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve({ data: { id: 'server-id' }, error: null });
        })
      }));

      const syncAction = {
        id: 'action-intermittent',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-intermittent',
        data: { name: 'Intermittent Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(syncAction);

      // First attempt should fail
      await syncService.processQueue();
      
      // Wait for retry delay
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Second attempt should succeed
      await syncService.processQueue();

      expect(callCount).toBe(2);
    });
  });

  describe('Queue Status and Monitoring', () => {
    it('should provide accurate queue status', async () => {
      const actions = [
        {
          id: 'action-1',
          entityType: 'dog' as const,
          actionType: 'create' as const,
          entityId: 'temp-dog-1',
          data: { name: 'Dog 1' },
          timestamp: new Date(),
          userId: 'user-123',
          retries: 0
        },
        {
          id: 'action-2',
          entityType: 'dog' as const,
          actionType: 'create' as const,
          entityId: 'temp-dog-2',
          data: { name: 'Dog 2' },
          timestamp: new Date(),
          userId: 'user-123',
          retries: 0
        }
      ];

      for (const action of actions) {
        await syncQueue.add(action);
      }

      let status = await syncQueue.getStatus();
      expect(status.pending).toBe(2);
      expect(status.processing).toBe(0);
      expect(status.completed).toBe(0);
      expect(status.failed).toBe(0);

      await syncService.processQueue();

      status = await syncQueue.getStatus();
      expect(status.pending).toBe(0);
      expect(status.completed).toBe(2);
    });

    it('should track processing metrics', async () => {
      const actions = Array.from({ length: 10 }, (_, i) => ({
        id: `action-${i}`,
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: `temp-dog-${i}`,
        data: { name: `Dog ${i}` },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      }));

      for (const action of actions) {
        await syncQueue.add(action);
      }

      const startTime = Date.now();
      const result = await syncService.processQueue();
      const endTime = Date.now();

      expect(result.processed).toBe(10);
      expect(result.successful).toBe(10);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(endTime - startTime + 100);
    });

    it('should clear completed actions periodically', async () => {
      // Add and process actions
      const action = {
        id: 'action-cleanup',
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: 'temp-dog-cleanup',
        data: { name: 'Cleanup Dog' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      };

      await syncQueue.add(action);
      await syncService.processQueue();

      let status = await syncQueue.getStatus();
      expect(status.completed).toBe(1);

      // Trigger cleanup (would normally happen automatically)
      await syncQueue.cleanup();

      status = await syncQueue.getStatus();
      expect(status.completed).toBe(0);
    });
  });

  describe('Concurrent Processing', () => {
    it('should handle concurrent queue additions', async () => {
      const concurrentActions = Array.from({ length: 20 }, (_, i) => 
        syncQueue.add({
          id: `concurrent-action-${i}`,
          entityType: 'dog' as const,
          actionType: 'create' as const,
          entityId: `temp-dog-concurrent-${i}`,
          data: { name: `Concurrent Dog ${i}` },
          timestamp: new Date(),
          userId: 'user-123',
          retries: 0
        })
      );

      await Promise.all(concurrentActions);

      const status = await syncQueue.getStatus();
      expect(status.pending).toBe(20);

      const result = await syncService.processQueue();
      expect(result.processed).toBe(20);
      expect(result.successful).toBe(20);
    });

    it('should prevent race conditions during processing', async () => {
      const actions = Array.from({ length: 5 }, (_, i) => ({
        id: `race-action-${i}`,
        entityType: 'dog' as const,
        actionType: 'create' as const,
        entityId: `temp-dog-race-${i}`,
        data: { name: `Race Dog ${i}` },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      }));

      for (const action of actions) {
        await syncQueue.add(action);
      }

      // Start multiple processing attempts simultaneously
      const processingPromises = [
        syncService.processQueue(),
        syncService.processQueue(),
        syncService.processQueue()
      ];

      const results = await Promise.all(processingPromises);

      // Total processed should equal the number of actions (no duplicates)
      const totalProcessed = results.reduce((sum, result) => sum + result.processed, 0);
      expect(totalProcessed).toBe(5);
    });
  });
});
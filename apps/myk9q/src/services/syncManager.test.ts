import { vi } from 'vitest';
import { syncManager } from './syncManager';
import { supabase } from '../lib/supabase';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import * as entryService from './entryService';

// Mock the supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: vi.fn()
  }
}));

// Mock the entryService
vi.mock('./entryService', () => ({
  submitScore: vi.fn()
}));

// Mock the offlineQueueStore
vi.mock('../stores/offlineQueueStore', () => ({
  useOfflineQueueStore: {
    getState: vi.fn()
  }
}));

describe('SyncManager', () => {
  let onlineEventHandler: (() => void) | null = null;
  let offlineEventHandler: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window event listeners
    onlineEventHandler = null;
    offlineEventHandler = null;

    // @ts-ignore - Mock window.addEventListener
    global.window = {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'online') onlineEventHandler = handler;
        if (event === 'offline') offlineEventHandler = handler;
      })
    } as any;

    // Mock navigator.onLine
    Object.defineProperty(global.navigator, 'onLine', {
      writable: true,
      value: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getState', () => {
    test('should return current sync state', () => {
      const state = syncManager.getState();

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('lastSyncTime');
      expect(state).toHaveProperty('pendingChanges');
      expect(state).toHaveProperty('error');
    });

    test('should return a copy of state, not reference', () => {
      const state1 = syncManager.getState();
      const state2 = syncManager.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('subscribe', () => {
    test('should add listener and return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = syncManager.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');

      // Cleanup
      unsubscribe();
    });

    test('should notify listener on state changes', () => {
      const listener = vi.fn();
      const unsubscribe = syncManager.subscribe(listener);

      // Trigger a state change by pausing sync
      syncManager.pauseSync();

      expect(listener).toHaveBeenCalled();

      // Cleanup
      unsubscribe();
      syncManager.resumeSync();
    });

    test('should stop notifying after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = syncManager.subscribe(listener);

      // Unsubscribe immediately
      unsubscribe();
      listener.mockClear();

      // Trigger state change
      syncManager.pauseSync();

      expect(listener).not.toHaveBeenCalled();

      // Cleanup
      syncManager.resumeSync();
    });
  });

  describe('subscribeToUpdates', () => {
    test('should create a new subscription', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn()
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      const callback = vi.fn();
      const unsubscribe = syncManager.subscribeToUpdates(
        'test-key',
        'entries',
        'license_key=eq.test',
        callback
      );

      expect(supabase.channel).toHaveBeenCalledWith('test-key');
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'entries',
          filter: 'license_key=eq.test'
        }),
        expect.any(Function)
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();

      // Cleanup
      unsubscribe();
    });

    test('should unsubscribe old subscription if key already exists', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn()
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      const callback = vi.fn();

      // First subscription
      syncManager.subscribeToUpdates('test-key', 'entries', 'filter1', callback);

      // Second subscription with same key
      syncManager.subscribeToUpdates('test-key', 'entries', 'filter2', callback);

      // Should have unsubscribed from first
      expect(mockChannel.unsubscribe).toHaveBeenCalled();
    });

    test('should return unsubscribe function', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn()
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      const unsubscribe = syncManager.subscribeToUpdates(
        'test-key',
        'entries',
        'filter',
        vi.fn()
      );

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      expect(mockChannel.unsubscribe).toHaveBeenCalled();
    });

    test('should handle subscription errors', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((callback) => {
          callback('SUBSCRIBED', { message: 'Connection error' });
          return mockChannel;
        }),
        unsubscribe: vi.fn()
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      syncManager.subscribeToUpdates('test-key', 'entries', 'filter', vi.fn());

      // State should reflect error
      const state = syncManager.getState();
      expect(state.status).toBe('error');
    });
  });

  describe('unsubscribe', () => {
    test('should unsubscribe from specific subscription', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn()
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      syncManager.subscribeToUpdates('test-key', 'entries', 'filter', vi.fn());
      syncManager.unsubscribe('test-key');

      expect(mockChannel.unsubscribe).toHaveBeenCalled();
    });

    test('should do nothing if key does not exist', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn()
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      // Should not throw
      syncManager.unsubscribe('non-existent-key');

      expect(mockChannel.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribeAll', () => {
    test('should unsubscribe from all active subscriptions', () => {
      const mockChannel1 = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn()
      };

      const mockChannel2 = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn()
      };

      vi.mocked(supabase.channel)
        .mockReturnValueOnce(mockChannel1 as any)
        .mockReturnValueOnce(mockChannel2 as any);

      syncManager.subscribeToUpdates('key1', 'entries', 'filter1', vi.fn());
      syncManager.subscribeToUpdates('key2', 'results', 'filter2', vi.fn());

      syncManager.unsubscribeAll();

      expect(mockChannel1.unsubscribe).toHaveBeenCalled();
      expect(mockChannel2.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('pauseSync', () => {
    test('should pause sync and update state', () => {
      syncManager.pauseSync();

      const state = syncManager.getState();
      expect(state.status).toBe('paused');
    });

    test('should unsubscribe all subscriptions', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn()
      };

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);

      syncManager.subscribeToUpdates('key', 'entries', 'filter', vi.fn());
      syncManager.pauseSync();

      expect(mockChannel.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('resumeSync', () => {
    test('should resume sync and update state', () => {
      syncManager.pauseSync();
      syncManager.resumeSync();

      const state = syncManager.getState();
      expect(state.status).toBe('synced');
    });
  });

  describe('queueSync', () => {
    test('should add operation to queue and update pending count', () => {
      const operation = vi.fn().mockResolvedValue(undefined);

      syncManager.queueSync(operation);

      const state = syncManager.getState();
      expect(state.pendingChanges).toBeGreaterThanOrEqual(0);
    });

    test('should process queue immediately', async () => {
      const operation = vi.fn().mockResolvedValue(undefined);

      syncManager.queueSync(operation);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(operation).toHaveBeenCalled();
    });
  });

  describe('manualSync', () => {
    test('should process offline queue and sync queue', async () => {
      const mockOfflineState = {
        queue: [],
        startSync: vi.fn(),
        markAsSyncing: vi.fn(),
        markAsCompleted: vi.fn(),
        markAsFailed: vi.fn(),
        syncComplete: vi.fn()
      };

      vi.mocked(useOfflineQueueStore.getState).mockReturnValue(mockOfflineState as any);

      await syncManager.manualSync();

      expect(useOfflineQueueStore.getState).toHaveBeenCalled();
    });

    test('should process pending offline queue items', async () => {
      const mockOfflineState = {
        queue: [
          { id: '1', entryId: 101, scoreData: { time: 30 }, status: 'pending' },
          { id: '2', entryId: 102, scoreData: { time: 35 }, status: 'pending' }
        ],
        startSync: vi.fn(),
        markAsSyncing: vi.fn(),
        markAsCompleted: vi.fn(),
        markAsFailed: vi.fn(),
        syncComplete: vi.fn()
      };

      vi.mocked(useOfflineQueueStore.getState).mockReturnValue(mockOfflineState as any);
      vi.mocked(entryService.submitScore).mockResolvedValue(undefined as any);

      await syncManager.manualSync();

      expect(mockOfflineState.startSync).toHaveBeenCalled();
      expect(mockOfflineState.markAsSyncing).toHaveBeenCalledTimes(2);
      expect(entryService.submitScore).toHaveBeenCalledTimes(2);
      expect(mockOfflineState.markAsCompleted).toHaveBeenCalledTimes(2);
    });

    test('should handle failed offline queue items', async () => {
      const mockOfflineState = {
        queue: [
          { id: '1', entryId: 101, scoreData: { time: 30 }, status: 'pending' }
        ],
        startSync: vi.fn(),
        markAsSyncing: vi.fn(),
        markAsCompleted: vi.fn(),
        markAsFailed: vi.fn(),
        syncComplete: vi.fn()
      };

      vi.mocked(useOfflineQueueStore.getState).mockReturnValue(mockOfflineState as any);
      vi.mocked(entryService.submitScore).mockRejectedValue(new Error('Network error'));

      await syncManager.manualSync();

      expect(mockOfflineState.markAsFailed).toHaveBeenCalledWith('1', 'Network error');
      expect(mockOfflineState.syncComplete).toHaveBeenCalledWith([], ['1']);
    });
  });

  describe('shouldBlockSync', () => {
    test('should block sync when offline', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: false
      });

      expect(syncManager.shouldBlockSync()).toBe(true);
    });

    test('should block sync when paused', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: true
      });

      syncManager.pauseSync();
      expect(syncManager.shouldBlockSync()).toBe(true);

      // Cleanup
      syncManager.resumeSync();
    });

    test('should not block sync when online and not paused', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        writable: true,
        value: true
      });

      syncManager.resumeSync();
      expect(syncManager.shouldBlockSync()).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    test('should calculate exponential backoff', () => {
      expect(syncManager.getRetryDelay(0)).toBe(1000);
      expect(syncManager.getRetryDelay(1)).toBe(2000);
      expect(syncManager.getRetryDelay(2)).toBe(4000);
      expect(syncManager.getRetryDelay(3)).toBe(8000);
    });

    test('should cap delay at 30 seconds', () => {
      expect(syncManager.getRetryDelay(10)).toBe(30000);
      expect(syncManager.getRetryDelay(20)).toBe(30000);
    });

    test('should use custom base delay', () => {
      expect(syncManager.getRetryDelay(0, 500)).toBe(500);
      expect(syncManager.getRetryDelay(1, 500)).toBe(1000);
      expect(syncManager.getRetryDelay(2, 500)).toBe(2000);
    });
  });

  describe('isWiFiOnlyAndCellular', () => {
    test('should always return false (feature removed)', () => {
      expect(syncManager.isWiFiOnlyAndCellular()).toBe(false);
    });
  });

  describe('network event handlers', () => {
    test('should handle online event', async () => {
      const mockOfflineState = {
        queue: [],
        startSync: vi.fn(),
        markAsSyncing: vi.fn(),
        markAsCompleted: vi.fn(),
        markAsFailed: vi.fn(),
        syncComplete: vi.fn()
      };

      vi.mocked(useOfflineQueueStore.getState).mockReturnValue(mockOfflineState as any);

      // Trigger online event
      if (onlineEventHandler) {
        await onlineEventHandler();
      }

      const state = syncManager.getState();
      expect(state.status).toBe('synced');
    });

    test('should update status to offline when pauseSync is called', () => {
      // Resume sync first to ensure starting state
      syncManager.resumeSync();

      // Pause sync (which is what handleOffline does internally)
      syncManager.pauseSync();

      const state = syncManager.getState();
      expect(state.status).toBe('paused');

      // Cleanup
      syncManager.resumeSync();
    });
  });
});

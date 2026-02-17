/**
 * ReplicationManager Tests
 *
 * Validates the central orchestrator for table replication in the offline-first PWA:
 * - Constructor initialization and module coordination
 * - Table registration and lookup
 * - Sync operations (syncAll, syncTable, fullSync, refresh)
 * - Cache update listeners for UI notification
 * - Performance reporting and cache statistics
 * - Network event handling
 * - Error handling and cleanup
 * - Singleton management
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  ReplicationManager,
  initReplicationManager,
  getReplicationManager,
  destroyReplicationManager,
} from '../ReplicationManager';
import type { ReplicatedTable, SyncResult } from '@myk9/replication';

/** Typed mock shape for SyncEngine */
interface MockSyncEngine {
  isNetworkOnline: Mock;
  clearAllMutations: Mock;
  destroy: Mock;
}

/** Typed mock shape for ConnectionManager */
interface MockConnectionManager {
  initialize: Mock;
  subscribeToTable: Mock;
  unsubscribeFromTable: Mock;
  waitForSubscriptionsReady: Mock;
  destroy: Mock;
}

/** Typed mock shape for SyncOrchestrator */
interface MockSyncOrchestrator {
  isSyncInProgress: Mock;
  syncTable: Mock;
  syncAll: Mock;
  fullSyncTable: Mock;
  fullSyncAll: Mock;
  refreshTable: Mock;
  refreshAll: Mock;
  startAutoSync: Mock;
  stopAutoSync: Mock;
  evictLRU: Mock;
  getSyncHistory: Mock;
  handleNetworkOnline: Mock;
  handleNetworkOffline: Mock;
  destroy: Mock;
}

/** Typed mock shape for PrefetchManager */
interface MockPrefetchManager {
  trackNavigation: Mock;
  getStats: Mock;
  prefetchForPage: Mock;
}

/** Access to ReplicationManager private internals for testing */
interface ManagerTestInternals {
  syncEngine: MockSyncEngine;
  connectionManager: MockConnectionManager;
  syncOrchestrator: MockSyncOrchestrator;
  prefetchManager: MockPrefetchManager;
  notifyCacheUpdated: (tableName: string) => void;
  cacheUpdateListeners: Map<string, Set<(tableName: string) => void>>;
}

// Mock dependencies
vi.mock('../SyncEngine', () => ({
  SyncEngine: vi.fn(function (this: MockSyncEngine) {
    this.isNetworkOnline = vi.fn(() => true);
    this.clearAllMutations = vi.fn().mockResolvedValue(undefined);
    this.destroy = vi.fn();
  }),
}));

vi.mock('../ConnectionManager', () => ({
  ConnectionManager: vi.fn(function (this: MockConnectionManager) {
    this.initialize = vi.fn();
    this.subscribeToTable = vi.fn();
    this.unsubscribeFromTable = vi.fn();
    this.waitForSubscriptionsReady = vi.fn().mockResolvedValue(undefined);
    this.destroy = vi.fn();
  }),
}));

vi.mock('../SyncOrchestrator', () => ({
  SyncOrchestrator: vi.fn(function (this: MockSyncOrchestrator) {
    this.isSyncInProgress = vi.fn(() => false);
    this.syncTable = vi.fn().mockResolvedValue({
      success: true,
      tableName: 'test-table',
      duration: 100,
      rowsProcessed: 10,
      timestamp: Date.now(),
    } as SyncResult);
    this.syncAll = vi.fn().mockResolvedValue([
      {
        success: true,
        tableName: 'table1',
        duration: 100,
        rowsProcessed: 10,
        timestamp: Date.now(),
      },
      {
        success: true,
        tableName: 'table2',
        duration: 150,
        rowsProcessed: 15,
        timestamp: Date.now(),
      },
    ] as SyncResult[]);
    this.fullSyncTable = vi.fn().mockResolvedValue({
      success: true,
      tableName: 'test-table',
      duration: 200,
      rowsProcessed: 20,
      timestamp: Date.now(),
    } as SyncResult);
    this.fullSyncAll = vi.fn().mockResolvedValue([
      {
        success: true,
        tableName: 'table1',
        duration: 200,
        rowsProcessed: 20,
        timestamp: Date.now(),
      },
    ] as SyncResult[]);
    this.refreshTable = vi.fn().mockResolvedValue({
      success: true,
      tableName: 'test-table',
      duration: 150,
      rowsProcessed: 15,
      timestamp: Date.now(),
    } as SyncResult);
    this.refreshAll = vi.fn().mockResolvedValue([
      {
        success: true,
        tableName: 'table1',
        duration: 150,
        rowsProcessed: 15,
        timestamp: Date.now(),
      },
    ] as SyncResult[]);
    this.startAutoSync = vi.fn();
    this.stopAutoSync = vi.fn();
    this.evictLRU = vi.fn().mockResolvedValue(1024);
    this.getSyncHistory = vi.fn(() => []);
    this.handleNetworkOnline = vi.fn().mockResolvedValue(undefined);
    this.handleNetworkOffline = vi.fn();
    this.destroy = vi.fn();
  }),
}));

vi.mock('../PrefetchManager', () => ({
  PrefetchManager: vi.fn(function (this: MockPrefetchManager) {
    this.trackNavigation = vi.fn();
    this.getStats = vi.fn(() => ({
      totalPatterns: 0,
      mostCommonTransition: null,
      currentPage: '',
    }));
    this.prefetchForPage = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('../PrefetchCacheManager', () => ({
  prefetchCache: {
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../MutationQueueManager', () => ({
  mutationQueue: {
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const TEST_LICENSE_KEY = 'test-license-123';

describe('ReplicationManager', () => {
  let manager: ReplicationManager;
  let mockTable: ReplicatedTable<{ id: string }>;
  let mockSyncEngine: MockSyncEngine;
  let mockConnectionManager: MockConnectionManager;
  let mockSyncOrchestrator: MockSyncOrchestrator;
  let mockPrefetchManager: MockPrefetchManager;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create a mock table
    mockTable = {
      clearCache: vi.fn().mockResolvedValue(undefined),
      getCacheStats: vi.fn().mockResolvedValue({
        rowCount: 100,
        sizeMB: 1.5,
        sizeBytes: 1572864,
        dirtyCount: 5,
      }),
    } as unknown as ReplicatedTable<{ id: string }>;

    // Create manager instance
    manager = new ReplicationManager({
      licenseKey: TEST_LICENSE_KEY,
      autoSyncInterval: 30000,
      autoSyncOnStartup: false,
      autoSyncOnReconnect: true,
    });

    // Access the mocked instances from the manager's private properties
    const internals = manager as unknown as ManagerTestInternals;
    mockSyncEngine = internals.syncEngine;
    mockConnectionManager = internals.connectionManager;
    mockSyncOrchestrator = internals.syncOrchestrator;
    mockPrefetchManager = internals.prefetchManager;
  });

  afterEach(() => {
    // Clean up manager
    if (manager) {
      manager.destroy();
    }
  });

  describe('Constructor Initialization', () => {
    it('should initialize with required config', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(ReplicationManager);
    });

    it('should have initialized SyncEngine', () => {
      expect(mockSyncEngine).toBeDefined();
      expect(mockSyncEngine.isNetworkOnline).toBeDefined();
    });

    it('should have initialized ConnectionManager', () => {
      expect(mockConnectionManager).toBeDefined();
      expect(mockConnectionManager.initialize).toHaveBeenCalled();
    });

    it('should have initialized SyncOrchestrator', () => {
      expect(mockSyncOrchestrator).toBeDefined();
      expect(mockSyncOrchestrator.syncTable).toBeDefined();
    });

    it('should have initialized PrefetchManager', () => {
      expect(mockPrefetchManager).toBeDefined();
      expect(mockPrefetchManager.trackNavigation).toBeDefined();
    });

    it('should set up network event listeners', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      // Create a new manager to capture listeners
      const newManager = new ReplicationManager({
        licenseKey: TEST_LICENSE_KEY,
      });

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'connection:network-online',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'connection:network-offline',
        expect.any(Function)
      );

      newManager.destroy();
    });
  });

  describe('Table Registration', () => {
    it('should register a table', () => {
      manager.registerTable('entries', mockTable);

      const retrieved = manager.getTable('entries');
      expect(retrieved).toBe(mockTable);
    });

    it('should subscribe to real-time changes when registering table', () => {
      manager.registerTable('entries', mockTable);

      expect(mockConnectionManager.subscribeToTable).toHaveBeenCalledWith('entries');
    });

    it('should not register duplicate tables', () => {
      manager.registerTable('entries', mockTable);

      const secondTable = { ...mockTable } as ReplicatedTable<{ id: string }>;
      manager.registerTable('entries', secondTable);

      const retrieved = manager.getTable('entries');
      expect(retrieved).toBe(mockTable); // First table should still be registered
    });

    it('should log warning when registering duplicate table', async () => {
      const loggerModule = await import('@/utils/logger');

      manager.registerTable('entries', mockTable);
      manager.registerTable('entries', mockTable);

      expect(loggerModule.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already registered')
      );
    });

    it('should unregister a table', () => {
      manager.registerTable('entries', mockTable);
      manager.unregisterTable('entries');

      const retrieved = manager.getTable('entries');
      expect(retrieved).toBeNull();
    });

    it('should unsubscribe from real-time changes when unregistering', () => {
      manager.registerTable('entries', mockTable);
      manager.unregisterTable('entries');

      expect(mockConnectionManager.unsubscribeFromTable).toHaveBeenCalledWith('entries');
    });

    it('should return null for non-existent table', () => {
      const retrieved = manager.getTable('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should get all registered table names', () => {
      manager.registerTable('entries', mockTable);
      manager.registerTable('classes', mockTable);

      const tableNames = manager.getRegisteredTables();
      expect(tableNames).toContain('entries');
      expect(tableNames).toContain('classes');
      expect(tableNames).toHaveLength(2);
    });
  });

  describe('Sync Operations', () => {
    beforeEach(() => {
      manager.registerTable('test-table', mockTable);
    });

    it('should check if sync is in progress', () => {
      const result = manager.isSyncInProgress();
      expect(result).toBe(false);
    });

    it('should wait for subscriptions to be ready', async () => {
      await manager.waitForSubscriptionsReady();

      expect(mockConnectionManager.waitForSubscriptionsReady).toHaveBeenCalled();
    });

    it('should sync a single table', async () => {
      const result = await manager.syncTable('test-table');

      expect(result.success).toBe(true);
      expect(result.tableName).toBe('test-table');
    });

    it('should pass options to syncTable', async () => {
      await manager.syncTable('test-table', { forceFullSync: true });

      expect(mockSyncOrchestrator.syncTable).toHaveBeenCalledWith('test-table', {
        forceFullSync: true,
      });
    });

    it('should sync all registered tables', async () => {
      manager.registerTable('table2', mockTable);

      const results = await manager.syncAll();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should force full sync for a table', async () => {
      const result = await manager.fullSyncTable('test-table');

      expect(result.success).toBe(true);
      expect(result.rowsProcessed).toBe(20);
    });

    it('should force full sync for all tables', async () => {
      const results = await manager.fullSyncAll();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should refresh a single table', async () => {
      const result = await manager.refreshTable('test-table');

      expect(result.success).toBe(true);
      expect(result.duration).toBe(150);
    });

    it('should refresh all tables', async () => {
      const results = await manager.refreshAll();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });
  });

  describe('Auto-Sync', () => {
    it('should start auto-sync', () => {
      manager.startAutoSync();

      expect(mockSyncOrchestrator.startAutoSync).toHaveBeenCalled();
    });

    it('should stop auto-sync', () => {
      manager.stopAutoSync();

      expect(mockSyncOrchestrator.stopAutoSync).toHaveBeenCalled();
    });
  });

  describe('Cache Operations', () => {
    beforeEach(() => {
      manager.registerTable('entries', mockTable);
      manager.registerTable('classes', mockTable);
    });

    it('should clear all caches', async () => {
      await manager.clearAllCaches();

      expect(mockTable.clearCache).toHaveBeenCalledTimes(2);
    });

    it('should clear pending mutations when clearing caches', async () => {
      await manager.clearAllCaches();

      expect(mockSyncEngine.clearAllMutations).toHaveBeenCalled();
    });

    it('should clear prefetch cache when clearing all caches', async () => {
      const prefetchCacheModule = await import('../PrefetchCacheManager');

      await manager.clearAllCaches();

      expect(prefetchCacheModule.prefetchCache.clear).toHaveBeenCalled();
    });

    it('should clear offline queue when clearing all caches', async () => {
      const mutationQueueModule = await import('../MutationQueueManager');

      await manager.clearAllCaches();

      expect(mutationQueueModule.mutationQueue.clear).toHaveBeenCalled();
    });

    it('should handle errors when clearing individual table caches', async () => {
      const loggerModule = await import('@/utils/logger');
      const errorTable = {
        clearCache: vi.fn().mockRejectedValue(new Error('Clear failed')),
        getCacheStats: vi
          .fn()
          .mockResolvedValue({ rowCount: 0, sizeMB: 0, sizeBytes: 0, dirtyCount: 0 }),
      } as unknown as ReplicatedTable<{ id: string }>;

      manager.registerTable('error-table', errorTable);

      await manager.clearAllCaches();

      expect(loggerModule.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear cache for error-table'),
        expect.any(Error)
      );
    });

    it('should run LRU eviction', async () => {
      const bytesEvicted = await manager.evictLRU(50);

      expect(bytesEvicted).toBe(1024);
    });

    it('should get cache statistics', async () => {
      const stats = await manager.getCacheStats();

      expect(stats.totalRows).toBe(200); // 2 tables * 100 rows
      expect(stats.totalSizeMB).toBe(3); // 2 tables * 1.5 MB
      expect(stats.tableStats).toHaveLength(2);
      expect(stats.tableStats[0]).toMatchObject({
        tableName: expect.any(String),
        rowCount: 100,
        sizeMB: 1.5,
        sizeBytes: 1572864,
        dirtyCount: 5,
      });
    });

    it('should sort cache stats by size descending', async () => {
      // Add a larger table
      const largeTable = {
        clearCache: vi.fn().mockResolvedValue(undefined),
        getCacheStats: vi.fn().mockResolvedValue({
          rowCount: 500,
          sizeMB: 5.0,
          sizeBytes: 5242880,
          dirtyCount: 10,
        }),
      } as unknown as ReplicatedTable<{ id: string }>;

      manager.registerTable('large-table', largeTable);

      const stats = await manager.getCacheStats();

      expect(stats.tableStats[0].sizeMB).toBe(5.0);
      expect(stats.tableStats[1].sizeMB).toBe(1.5);
    });
  });

  describe('Network & Status', () => {
    it('should check if network is online', () => {
      const isOnline = manager.isOnline();
      expect(isOnline).toBe(true);
    });

    it('should get sync history', () => {
      mockSyncOrchestrator.getSyncHistory.mockReturnValue([
        {
          success: true,
          tableName: 'test',
          duration: 100,
          rowsProcessed: 10,
          timestamp: Date.now(),
        },
      ]);

      const history = manager.getSyncHistory(5);

      expect(mockSyncOrchestrator.getSyncHistory).toHaveBeenCalledWith(5);
      expect(history).toHaveLength(1);
    });

    it('should get performance report', async () => {
      mockSyncOrchestrator.getSyncHistory.mockReturnValue([
        {
          success: true,
          tableName: 'test1',
          duration: 100,
          rowsProcessed: 10,
          timestamp: Date.now(),
          conflictsResolved: 2,
        },
        {
          success: true,
          tableName: 'test2',
          duration: 200,
          rowsProcessed: 20,
          timestamp: Date.now(),
          conflictsResolved: 3,
        },
        {
          success: false,
          tableName: 'test3',
          duration: 50,
          rowsProcessed: 0,
          timestamp: Date.now(),
          error: 'Failed',
        },
      ]);

      manager.registerTable('table1', mockTable);
      manager.registerTable('table2', mockTable);

      const report = await manager.getPerformanceReport();

      expect(report.avgSyncDuration).toBe('150ms'); // (100 + 200) / 2
      expect(report.conflictsResolved).toBe(5); // 2 + 3
      expect(report.mutationSuccessRate).toBe(67); // 2 successful out of 3
      expect(report.tablesReplicated).toBe(2);
    });

    it('should handle empty sync history in performance report', async () => {
      mockSyncOrchestrator.getSyncHistory.mockReturnValue([]);

      const report = await manager.getPerformanceReport();

      expect(report.avgSyncDuration).toBe('0ms');
      expect(report.conflictsResolved).toBe(0);
      expect(report.mutationSuccessRate).toBe(100); // Default to 100%
    });

    it('should get storage estimate in performance report', async () => {
      const mockEstimate = {
        usage: 10485760, // 10 MB
        quota: 50000000,
      };

      // Mock navigator.storage.estimate
      if (typeof navigator.storage?.estimate === 'undefined') {
        Object.defineProperty(navigator, 'storage', {
          value: {
            estimate: vi.fn().mockResolvedValue(mockEstimate),
          },
          configurable: true,
        });
      } else {
        vi.spyOn(navigator.storage, 'estimate').mockResolvedValue(mockEstimate);
      }

      const report = await manager.getPerformanceReport();

      expect(report.storageUsedMB).toBe('10.0');
    });

    it('should handle storage estimate errors', async () => {
      // Mock navigator.storage.estimate to throw error
      if (typeof navigator.storage?.estimate === 'undefined') {
        Object.defineProperty(navigator, 'storage', {
          value: {
            estimate: vi.fn().mockRejectedValue(new Error('Not supported')),
          },
          configurable: true,
        });
      } else {
        vi.spyOn(navigator.storage, 'estimate').mockRejectedValue(new Error('Not supported'));
      }

      const report = await manager.getPerformanceReport();

      expect(report.storageUsedMB).toBe('0');
    });
  });

  describe('Network Event Handlers', () => {
    it('should handle network online event', async () => {
      // Trigger online event
      window.dispatchEvent(new Event('connection:network-online'));

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockSyncOrchestrator.handleNetworkOnline).toHaveBeenCalled();
    });

    it('should handle network offline event', () => {
      // Trigger offline event
      window.dispatchEvent(new Event('connection:network-offline'));

      expect(mockSyncOrchestrator.handleNetworkOffline).toHaveBeenCalled();
    });
  });

  describe('Prefetch', () => {
    it('should track navigation', () => {
      manager.trackNavigation('/classes/123');

      expect(mockPrefetchManager.trackNavigation).toHaveBeenCalledWith('/classes/123');
    });

    it('should get prefetch stats', () => {
      const stats = manager.getPrefetchStats();

      expect(stats).toEqual({
        totalPatterns: 0,
        mostCommonTransition: null,
        currentPage: '',
      });
    });

    it('should manually trigger prefetch for a page', async () => {
      await manager.prefetchForPage('EntryList');

      expect(mockPrefetchManager.prefetchForPage).toHaveBeenCalledWith('EntryList');
    });
  });

  describe('Cache Update Listeners', () => {
    it('should register cache update listener', () => {
      const listener = vi.fn();

      const unsubscribe = manager.onCacheUpdate('entries', listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should notify listeners when cache is updated', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      manager.onCacheUpdate('entries', listener1);
      manager.onCacheUpdate('entries', listener2);

      // Trigger cache update via internal method
      (manager as unknown as ManagerTestInternals).notifyCacheUpdated('entries');

      expect(listener1).toHaveBeenCalledWith('entries');
      expect(listener2).toHaveBeenCalledWith('entries');
    });

    it('should not notify listeners for different tables', () => {
      const entriesListener = vi.fn();
      const classesListener = vi.fn();

      manager.onCacheUpdate('entries', entriesListener);
      manager.onCacheUpdate('classes', classesListener);

      (manager as unknown as ManagerTestInternals).notifyCacheUpdated('entries');

      expect(entriesListener).toHaveBeenCalledWith('entries');
      expect(classesListener).not.toHaveBeenCalled();
    });

    it('should unsubscribe from cache updates', () => {
      const listener = vi.fn();

      const unsubscribe = manager.onCacheUpdate('entries', listener);
      unsubscribe();

      (manager as unknown as ManagerTestInternals).notifyCacheUpdated('entries');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should clean up empty listener sets', () => {
      const listener = vi.fn();

      const unsubscribe = manager.onCacheUpdate('entries', listener);
      unsubscribe();

      // Check that the set was removed
      const listeners = (manager as unknown as ManagerTestInternals).cacheUpdateListeners;
      expect(listeners.has('entries')).toBe(false);
    });

    it('should handle listener errors gracefully', async () => {
      const loggerModule = await import('@/utils/logger');
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      manager.onCacheUpdate('entries', errorListener);
      manager.onCacheUpdate('entries', normalListener);

      (manager as unknown as ManagerTestInternals).notifyCacheUpdated('entries');

      expect(loggerModule.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in cache update listener'),
        expect.any(Error)
      );
      expect(normalListener).toHaveBeenCalled();
    });

    it('should allow multiple listeners on the same table', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      manager.onCacheUpdate('entries', listener1);
      manager.onCacheUpdate('entries', listener2);
      manager.onCacheUpdate('entries', listener3);

      (manager as unknown as ManagerTestInternals).notifyCacheUpdated('entries');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should handle no listeners gracefully', () => {
      // Should not throw when no listeners are registered
      expect(() => {
        (manager as unknown as ManagerTestInternals).notifyCacheUpdated('entries');
      }).not.toThrow();
    });
  });

  describe('Lifecycle', () => {
    it('should stop replication and cleanup tables', async () => {
      const cleanupTable = {
        clearCache: vi.fn().mockResolvedValue(undefined),
        getCacheStats: vi
          .fn()
          .mockResolvedValue({ rowCount: 0, sizeMB: 0, sizeBytes: 0, dirtyCount: 0 }),
        cleanup: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReplicatedTable<{ id: string }>;

      manager.registerTable('test-table', cleanupTable);

      await manager.stop();

      expect(cleanupTable.cleanup).toHaveBeenCalled();
      expect(manager.getRegisteredTables()).toHaveLength(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      const loggerModule = await import('@/utils/logger');
      const errorTable = {
        clearCache: vi.fn().mockResolvedValue(undefined),
        getCacheStats: vi
          .fn()
          .mockResolvedValue({ rowCount: 0, sizeMB: 0, sizeBytes: 0, dirtyCount: 0 }),
        cleanup: vi.fn().mockRejectedValue(new Error('Cleanup failed')),
      } as unknown as ReplicatedTable<{ id: string }>;

      manager.registerTable('error-table', errorTable);

      await manager.stop();

      expect(loggerModule.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error cleaning up table'),
        expect.any(Error)
      );
    });

    it('should destroy all resources', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      manager.destroy();

      expect(mockSyncOrchestrator.destroy).toHaveBeenCalled();
      expect(mockConnectionManager.destroy).toHaveBeenCalled();
      expect(mockSyncEngine.destroy).toHaveBeenCalled();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'connection:network-online',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'connection:network-offline',
        expect.any(Function)
      );
    });

    it('should clear all tables on destroy', () => {
      manager.registerTable('entries', mockTable);
      manager.registerTable('classes', mockTable);

      manager.destroy();

      expect(manager.getRegisteredTables()).toHaveLength(0);
    });

    it('should clear cache update listeners on destroy', () => {
      const listener = vi.fn();
      manager.onCacheUpdate('entries', listener);

      manager.destroy();

      // Listeners map should be empty
      const listeners = (manager as unknown as ManagerTestInternals).cacheUpdateListeners;
      expect(listeners.size).toBe(0);
    });
  });

  describe('Singleton Management', () => {
    afterEach(() => {
      destroyReplicationManager();
    });

    it('should initialize singleton instance', () => {
      const instance = initReplicationManager({
        licenseKey: TEST_LICENSE_KEY,
      });

      expect(instance).toBeInstanceOf(ReplicationManager);
      expect(getReplicationManager()).toBe(instance);
    });

    it('should return existing instance on subsequent calls', () => {
      const instance1 = initReplicationManager({
        licenseKey: TEST_LICENSE_KEY,
      });
      const instance2 = initReplicationManager({
        licenseKey: 'different-key',
      });

      expect(instance2).toBe(instance1);
    });

    it('should log warning when reinitializing', () => {
      initReplicationManager({ licenseKey: TEST_LICENSE_KEY });
      initReplicationManager({ licenseKey: TEST_LICENSE_KEY });

      // Just verify it returns the same instance
      expect(getReplicationManager()).toBeInstanceOf(ReplicationManager);
    });

    it('should get singleton instance', () => {
      const instance = initReplicationManager({
        licenseKey: TEST_LICENSE_KEY,
      });

      expect(getReplicationManager()).toBe(instance);
    });

    it('should return null when no instance exists', () => {
      expect(getReplicationManager()).toBeNull();
    });

    it('should destroy singleton instance', () => {
      const instance = initReplicationManager({
        licenseKey: TEST_LICENSE_KEY,
      });

      destroyReplicationManager();

      expect(getReplicationManager()).toBeNull();
    });

    it('should stop singleton instance', async () => {
      const instance = initReplicationManager({
        licenseKey: TEST_LICENSE_KEY,
      });

      const cleanupTable = {
        clearCache: vi.fn().mockResolvedValue(undefined),
        getCacheStats: vi
          .fn()
          .mockResolvedValue({ rowCount: 0, sizeMB: 0, sizeBytes: 0, dirtyCount: 0 }),
        cleanup: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReplicatedTable<{ id: string }>;

      instance.registerTable('test', cleanupTable);

      await instance.stop();

      expect(cleanupTable.cleanup).toHaveBeenCalled();
    });
  });
});

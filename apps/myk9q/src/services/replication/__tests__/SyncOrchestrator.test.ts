/**
 * SyncOrchestrator Tests
 *
 * Validates sync coordination, queue management, and quota enforcement:
 * - Sync queue management (enqueueSyncRequest, processSyncQueue)
 * - Table sync coordination (syncTable, syncAll)
 * - Quota management (checkAndEnforceQuota)
 * - LRU eviction logic
 * - Sync throttling/debouncing
 * - Error handling and retries
 * - Cache statistics
 * - Full sync timing and persistence
 * - Auto-sync timer management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncOrchestrator, type SyncOrchestratorConfig, type CacheStatsResult } from '../SyncOrchestrator';
import { SyncEngine } from '../SyncEngine';
import type { ReplicatedTable, SyncResult } from '@myk9/replication';

// Mock dependencies
vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../ReplicationMonitor', () => ({
  getReplicationMonitor: vi.fn(() => ({
    recordSync: vi.fn(),
  })),
}));

// Mock window.dispatchEvent for event testing
const mockDispatchEvent = vi.fn();
Object.defineProperty(window, 'dispatchEvent', {
  value: mockDispatchEvent,
  writable: true,
});

describe('SyncOrchestrator', () => {
  let orchestrator: SyncOrchestrator;
  let mockSyncEngine: SyncEngine;
  let mockTables: Map<string, ReplicatedTable<any>>;
  let mockCacheStats: CacheStatsResult;

  const TEST_LICENSE_KEY = 'test-license-123';
  const DEFAULT_CONFIG: SyncOrchestratorConfig = {
    licenseKey: TEST_LICENSE_KEY,
    autoSyncInterval: 1000, // 1 second for tests
    autoSyncOnStartup: false,
    autoSyncOnReconnect: true,
    batchSize: 100,
    autoQuotaManagement: true,
    quotaSoftLimitMB: 4.5,
    quotaTargetMB: 5,
    forceFullSyncInterval: 24 * 60 * 60 * 1000, // 24 hours
  };

  // Helper to create a mock ReplicatedTable
  const createMockTable = (tableName: string, overrides = {}): ReplicatedTable<any> => ({
    sync: vi.fn().mockResolvedValue({
      tableName,
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 10,
      duration: 100,
    } as SyncResult),
    clearCache: vi.fn().mockResolvedValue(undefined),
    evictLRU: vi.fn().mockResolvedValue(5),
    getSyncMetadata: vi.fn().mockResolvedValue(null),
    updateSyncMetadata: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    batchSet: vi.fn().mockResolvedValue(undefined),
    batchDelete: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    refreshTimestamps: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatchEvent.mockClear();

    // Create mock tables
    mockTables = new Map([
      ['entries', createMockTable('entries')],
      ['classes', createMockTable('classes')],
      ['trials', createMockTable('trials')],
    ]);

    // Mock cache stats
    mockCacheStats = {
      totalRows: 100,
      totalSizeMB: 3.0,
      tableStats: [
        {
          tableName: 'entries',
          rowCount: 50,
          sizeMB: 1.5,
          sizeBytes: 1.5 * 1024 * 1024,
          dirtyCount: 0,
        },
        {
          tableName: 'classes',
          rowCount: 30,
          sizeMB: 1.0,
          sizeBytes: 1.0 * 1024 * 1024,
          dirtyCount: 0,
        },
        {
          tableName: 'trials',
          rowCount: 20,
          sizeMB: 0.5,
          sizeBytes: 0.5 * 1024 * 1024,
          dirtyCount: 0,
        },
      ],
    };

    // Create mock SyncEngine
    mockSyncEngine = {
      uploadPendingMutations: vi.fn().mockResolvedValue([]),
      fullSync: vi.fn().mockResolvedValue({
        tableName: 'test',
        success: true,
        operation: 'full-sync',
        rowsAffected: 10,
        duration: 100,
      } as SyncResult),
    } as any;

    // Create orchestrator
    orchestrator = new SyncOrchestrator(
      DEFAULT_CONFIG,
      mockSyncEngine,
      {
        getTable: (name) => mockTables.get(name) || null,
        getTableNames: () => Array.from(mockTables.keys()),
        notifyCacheUpdate: vi.fn(),
        getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
      }
    );
  });

  afterEach(() => {
    orchestrator.destroy();
  });

  describe('Initialization', () => {
    it('should initialize with provided config', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.isSyncInProgress()).toBe(false);
    });

    it('should initialize with default values for optional config', () => {
      const minimalConfig: SyncOrchestratorConfig = {
        licenseKey: TEST_LICENSE_KEY,
      };

      const minimalOrchestrator = new SyncOrchestrator(
        minimalConfig,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      expect(minimalOrchestrator).toBeDefined();
      minimalOrchestrator.destroy();
    });
  });

  describe('Sync State', () => {
    it('should track sync in progress state', async () => {
      expect(orchestrator.isSyncInProgress()).toBe(false);

      // Start sync without awaiting
      const syncPromise = orchestrator.syncAll();

      // Should be in progress
      expect(orchestrator.isSyncInProgress()).toBe(true);

      await syncPromise;

      // Should be complete
      expect(orchestrator.isSyncInProgress()).toBe(false);
    });

    it('should return sync history', async () => {
      await orchestrator.syncTable('entries');

      const history = orchestrator.getSyncHistory();
      expect(history).toHaveLength(1);
      expect(history[0].tableName).toBe('entries');
    });

    it('should limit sync history to specified size', async () => {
      // Sync multiple times
      for (let i = 0; i < 15; i++) {
        await orchestrator.syncTable('entries');
      }

      const history = orchestrator.getSyncHistory(5);
      expect(history).toHaveLength(5);
    });

    it('should truncate sync history to 100 entries', async () => {
      // Sync many times to exceed 100 entries
      for (let i = 0; i < 105; i++) {
        await orchestrator.syncTable('entries');
      }

      const history = orchestrator.getSyncHistory(200); // Request more than 100
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('syncTable', () => {
    it('should sync a single table successfully', async () => {
      const result = await orchestrator.syncTable('entries');

      expect(result.success).toBe(true);
      expect(result.tableName).toBe('entries');
      expect(mockTables.get('entries')?.sync).toHaveBeenCalled();
    });

    it('should return error for non-existent table', async () => {
      const result = await orchestrator.syncTable('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });

    it('should pass sync options to table', async () => {
      const options = { forceFullSync: true, batchSize: 50 };
      await orchestrator.syncTable('entries', options);

      const syncCall = (mockTables.get('entries')?.sync as any).mock.calls[0];
      expect(syncCall[1]).toMatchObject(options);
    });

    it('should force full sync after interval expires', async () => {
      // Override config for fast test
      const fastOrchestrator = new SyncOrchestrator(
        {
          ...DEFAULT_CONFIG,
          forceFullSyncInterval: 100, // 100ms
        },
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      // First sync
      await fastOrchestrator.syncTable('entries');
      const firstCall = (mockTables.get('entries')?.sync as any).mock.calls[0][1];
      expect(firstCall.forceFullSync).toBe(true); // First sync is always full

      // Wait for interval to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second sync should force full sync
      await fastOrchestrator.syncTable('entries');
      const secondCall = (mockTables.get('entries')?.sync as any).mock.calls[1][1];
      expect(secondCall.forceFullSync).toBe(true);

      fastOrchestrator.destroy();
    });

    it('should notify cache update on successful sync', async () => {
      const notifyCallback = vi.fn();
      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: notifyCallback,
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      await testOrchestrator.syncTable('entries');
      expect(notifyCallback).toHaveBeenCalledWith('entries');

      testOrchestrator.destroy();
    });

    it('should not notify cache update on failed sync', async () => {
      // Create table that fails to sync
      const failingTable = createMockTable('failing', {
        sync: vi.fn().mockResolvedValue({
          tableName: 'failing',
          success: false,
          operation: 'incremental-sync',
          rowsAffected: 0,
          duration: 100,
          error: 'Network error',
        } as SyncResult),
      });
      mockTables.set('failing', failingTable);

      const notifyCallback = vi.fn();
      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: notifyCallback,
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      await testOrchestrator.syncTable('failing');
      expect(notifyCallback).not.toHaveBeenCalled();

      testOrchestrator.destroy();
    });

    it('should track full sync timestamps', async () => {
      const table = mockTables.get('entries');

      // Mock successful full sync
      (table?.sync as any).mockResolvedValue({
        tableName: 'entries',
        success: true,
        operation: 'full-sync',
        rowsAffected: 10,
        duration: 100,
      } as SyncResult);

      await orchestrator.syncTable('entries', { forceFullSync: true });

      // Should persist full sync time
      expect(table?.updateSyncMetadata).toHaveBeenCalled();
    });
  });

  describe('syncAll', () => {
    it('should sync all registered tables', async () => {
      const results = await orchestrator.syncAll();

      expect(results.length).toBeGreaterThanOrEqual(3); // 3 tables + mutations
      expect(mockTables.get('entries')?.sync).toHaveBeenCalled();
      expect(mockTables.get('classes')?.sync).toHaveBeenCalled();
      expect(mockTables.get('trials')?.sync).toHaveBeenCalled();
    });

    it('should upload mutations before syncing tables', async () => {
      await orchestrator.syncAll();

      // Mutations should be uploaded first
      expect(mockSyncEngine.uploadPendingMutations).toHaveBeenCalled();
    });

    it('should dispatch success event when all syncs succeed', async () => {
      await orchestrator.syncAll();

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'replication:sync-success',
        })
      );
    });

    it('should dispatch failure event when any sync fails', async () => {
      // Make one table fail
      const failingTable = mockTables.get('entries');
      (failingTable?.sync as any).mockResolvedValue({
        tableName: 'entries',
        success: false,
        operation: 'incremental-sync',
        rowsAffected: 0,
        duration: 100,
        error: 'Network error',
      } as SyncResult);

      await orchestrator.syncAll();

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'replication:sync-failed',
        })
      );
    });

    it('should check quota after sync completes', async () => {
      const getCacheStats = vi.fn().mockResolvedValue(mockCacheStats);
      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats,
        }
      );

      await testOrchestrator.syncAll();

      expect(getCacheStats).toHaveBeenCalled();

      testOrchestrator.destroy();
    });

    it('should not check quota when autoQuotaManagement is disabled', async () => {
      const getCacheStats = vi.fn().mockResolvedValue(mockCacheStats);
      const testOrchestrator = new SyncOrchestrator(
        {
          ...DEFAULT_CONFIG,
          autoQuotaManagement: false,
        },
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats,
        }
      );

      await testOrchestrator.syncAll();

      expect(getCacheStats).not.toHaveBeenCalled();

      testOrchestrator.destroy();
    });

    it('should handle table sync errors gracefully', async () => {
      // Make one table throw an error
      const errorTable = mockTables.get('entries');
      (errorTable?.sync as any).mockRejectedValue(new Error('Database connection failed'));

      const results = await orchestrator.syncAll();

      // Should have result for the failed table
      const failedResult = results.find(r => r.tableName === 'entries');
      expect(failedResult?.success).toBe(false);
      expect(failedResult?.error).toContain('Database connection failed');
    });
  });

  describe('Sync Queue Management', () => {
    it('should queue sync requests when sync is in progress', async () => {
      // Start first sync (don't await)
      const firstSync = orchestrator.syncAll();

      // Try to start second sync while first is running
      const secondSyncPromise = orchestrator.syncAll();

      // Should dispatch queued event
      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'replication:sync-queued',
        })
      );

      // Wait for both to complete
      await firstSync;
      const secondResults = await secondSyncPromise;

      expect(secondResults.length).toBeGreaterThan(0);
    });

    it('should process queued syncs in order', async () => {
      const syncOrder: number[] = [];

      // Override table sync to track order
      const trackingTable = createMockTable('entries', {
        sync: vi.fn().mockImplementation(async () => {
          syncOrder.push(Date.now());
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            tableName: 'entries',
            success: true,
            operation: 'incremental-sync',
            rowsAffected: 10,
            duration: 50,
          } as SyncResult;
        }),
      });
      mockTables.set('entries', trackingTable);

      // Create new orchestrator with tracking table
      const trackingOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => ['entries'],
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      // Start multiple syncs
      const sync1 = trackingOrchestrator.syncAll();
      const sync2 = trackingOrchestrator.syncAll();
      const sync3 = trackingOrchestrator.syncAll();

      await Promise.all([sync1, sync2, sync3]);

      // Should have been called 3 times in order
      expect(syncOrder).toHaveLength(3);
      expect(syncOrder[1]).toBeGreaterThanOrEqual(syncOrder[0]);
      expect(syncOrder[2]).toBeGreaterThanOrEqual(syncOrder[1]);

      trackingOrchestrator.destroy();
    });
  });

  describe('fullSyncTable', () => {
    it('should force full sync for single table', async () => {
      const result = await orchestrator.fullSyncTable('entries');

      expect(result.success).toBe(true);
      expect(mockSyncEngine.fullSync).toHaveBeenCalled();
    });

    it('should return error for non-existent table', async () => {
      const result = await orchestrator.fullSyncTable('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });

    it('should pass options to sync engine', async () => {
      const options = { batchSize: 50 };
      await orchestrator.fullSyncTable('entries', options);

      const syncCall = (mockSyncEngine.fullSync as any).mock.calls[0][1];
      expect(syncCall).toMatchObject({
        licenseKey: TEST_LICENSE_KEY,
        forceFullSync: true,
        batchSize: 50,
      });
    });
  });

  describe('fullSyncAll', () => {
    it('should full sync all tables', async () => {
      const results = await orchestrator.fullSyncAll();

      expect(results).toHaveLength(3);
      expect(mockSyncEngine.fullSync).toHaveBeenCalledTimes(3);
    });

    it('should handle errors during full sync', async () => {
      (mockSyncEngine.fullSync as any).mockRejectedValueOnce(new Error('Sync failed'));

      const results = await orchestrator.fullSyncAll();

      const failedResult = results.find(r => !r.success);
      expect(failedResult).toBeDefined();
      expect(failedResult?.error).toContain('Sync failed');
    });
  });

  describe('refreshTable and refreshAll', () => {
    it('should refresh single table (alias for fullSyncTable)', async () => {
      const result = await orchestrator.refreshTable('entries');

      expect(result.success).toBe(true);
      expect(mockSyncEngine.fullSync).toHaveBeenCalled();
    });

    it('should refresh all tables (alias for fullSyncAll)', async () => {
      const results = await orchestrator.refreshAll();

      expect(results).toHaveLength(3);
      expect(mockSyncEngine.fullSync).toHaveBeenCalledTimes(3);
    });
  });

  describe('Auto-Sync Timer', () => {
    it('should start auto-sync timer', () => {
      orchestrator.startAutoSync();

      // Timer should be running (tested by checking it doesn't error)
      expect(() => orchestrator.stopAutoSync()).not.toThrow();
    });

    it('should not start multiple timers', () => {
      orchestrator.startAutoSync();
      orchestrator.startAutoSync(); // Should warn but not create second timer

      orchestrator.stopAutoSync();
    });

    it('should stop auto-sync timer', () => {
      orchestrator.startAutoSync();
      orchestrator.stopAutoSync();

      // Stopping again should be safe
      orchestrator.stopAutoSync();
    });

    it('should run initial sync when autoSyncOnStartup is enabled', async () => {
      const testOrchestrator = new SyncOrchestrator(
        {
          ...DEFAULT_CONFIG,
          autoSyncOnStartup: true,
        },
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      testOrchestrator.startAutoSync();

      // Wait for async sync to start
      await new Promise(resolve => setTimeout(resolve, 100));

      testOrchestrator.destroy();
    });

    it('should run periodic syncs', async () => {
      const testOrchestrator = new SyncOrchestrator(
        {
          ...DEFAULT_CONFIG,
          autoSyncInterval: 100, // 100ms for fast test
        },
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      testOrchestrator.startAutoSync();

      // Wait for at least one sync cycle
      await new Promise(resolve => setTimeout(resolve, 150));

      testOrchestrator.destroy();
    });

    it('should handle auto-sync errors gracefully', async () => {
      // Mock sync to fail
      (mockSyncEngine.uploadPendingMutations as any).mockRejectedValue(
        new Error('Auto-sync failed')
      );

      const testOrchestrator = new SyncOrchestrator(
        {
          ...DEFAULT_CONFIG,
          autoSyncInterval: 50, // 50ms for fast test
        },
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      testOrchestrator.startAutoSync();

      // Wait for sync to fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not crash the app
      testOrchestrator.destroy();
    });

    it('should handle initial sync errors gracefully', async () => {
      // Mock sync to fail
      (mockSyncEngine.uploadPendingMutations as any).mockRejectedValue(
        new Error('Initial sync failed')
      );

      const testOrchestrator = new SyncOrchestrator(
        {
          ...DEFAULT_CONFIG,
          autoSyncOnStartup: true,
        },
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      testOrchestrator.startAutoSync();

      // Wait for initial sync to fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not crash the app
      testOrchestrator.destroy();
    });
  });

  describe('Quota Management', () => {
    it('should not evict when cache is under soft limit', async () => {
      await orchestrator.checkQuotaAndEvict();

      // No tables should have evictLRU called
      for (const table of mockTables.values()) {
        expect(table.evictLRU).not.toHaveBeenCalled();
      }
    });

    it('should evict when cache exceeds soft limit', async () => {
      // Mock cache stats showing over limit
      const overLimitStats: CacheStatsResult = {
        totalRows: 1000,
        totalSizeMB: 6.0, // Over 4.5 MB soft limit
        tableStats: [
          {
            tableName: 'entries',
            rowCount: 500,
            sizeMB: 3.0,
            sizeBytes: 3.0 * 1024 * 1024,
            dirtyCount: 0,
          },
          {
            tableName: 'classes',
            rowCount: 300,
            sizeMB: 2.0,
            sizeBytes: 2.0 * 1024 * 1024,
            dirtyCount: 0,
          },
          {
            tableName: 'trials',
            rowCount: 200,
            sizeMB: 1.0,
            sizeBytes: 1.0 * 1024 * 1024,
            dirtyCount: 0,
          },
        ],
      };

      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(overLimitStats),
        }
      );

      await testOrchestrator.checkQuotaAndEvict();

      // At least one table should have been evicted
      const evictionCalls = Array.from(mockTables.values())
        .filter(table => (table.evictLRU as any).mock.calls.length > 0);

      expect(evictionCalls.length).toBeGreaterThan(0);

      testOrchestrator.destroy();
    });

    it('should handle quota check errors gracefully', async () => {
      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockRejectedValue(new Error('Storage error')),
        }
      );

      // Should not throw
      await expect(testOrchestrator.checkQuotaAndEvict()).resolves.not.toThrow();

      testOrchestrator.destroy();
    });
  });

  describe('evictLRU', () => {
    it('should not evict when already under target', async () => {
      const evicted = await orchestrator.evictLRU(50); // Target 50 MB (well above current 3 MB)

      expect(evicted).toBe(0);
      for (const table of mockTables.values()) {
        expect(table.evictLRU).not.toHaveBeenCalled();
      }
    });

    it('should evict rows to reach target size', async () => {
      // Mock cache stats showing need for eviction
      const largeStats: CacheStatsResult = {
        totalRows: 1000,
        totalSizeMB: 100, // 100 MB
        tableStats: [
          {
            tableName: 'entries',
            rowCount: 500,
            sizeMB: 50,
            sizeBytes: 50 * 1024 * 1024,
            dirtyCount: 0,
          },
          {
            tableName: 'classes',
            rowCount: 300,
            sizeMB: 30,
            sizeBytes: 30 * 1024 * 1024,
            dirtyCount: 0,
          },
          {
            tableName: 'trials',
            rowCount: 200,
            sizeMB: 20,
            sizeBytes: 20 * 1024 * 1024,
            dirtyCount: 0,
          },
        ],
      };

      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(largeStats),
        }
      );

      const evicted = await testOrchestrator.evictLRU(50); // Target 50 MB

      // Should have evicted from tables
      expect(evicted).toBeGreaterThan(0);

      testOrchestrator.destroy();
    });

    it('should evict proportionally from largest tables first', async () => {
      // Mock cache with uneven distribution
      const unevenStats: CacheStatsResult = {
        totalRows: 1000,
        totalSizeMB: 100,
        tableStats: [
          {
            tableName: 'entries',
            rowCount: 900,
            sizeMB: 90, // Largest table
            sizeBytes: 90 * 1024 * 1024,
            dirtyCount: 0,
          },
          {
            tableName: 'classes',
            rowCount: 50,
            sizeMB: 5,
            sizeBytes: 5 * 1024 * 1024,
            dirtyCount: 0,
          },
          {
            tableName: 'trials',
            rowCount: 50,
            sizeMB: 5,
            sizeBytes: 5 * 1024 * 1024,
            dirtyCount: 0,
          },
        ],
      };

      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(unevenStats),
        }
      );

      await testOrchestrator.evictLRU(50);

      // Entries (largest) should be evicted
      expect(mockTables.get('entries')?.evictLRU).toHaveBeenCalled();

      testOrchestrator.destroy();
    });
  });

  describe('Network Handlers', () => {
    it('should sync when network comes online', async () => {
      await orchestrator.handleNetworkOnline();

      // Should have triggered sync
      expect(mockSyncEngine.uploadPendingMutations).toHaveBeenCalled();
    });

    it('should handle offline event', () => {
      // Should not throw
      expect(() => orchestrator.handleNetworkOffline()).not.toThrow();
    });

    it('should not sync when already syncing on network online', async () => {
      // Start a sync
      const syncPromise = orchestrator.syncAll();

      // Try to sync on network online
      await orchestrator.handleNetworkOnline();

      await syncPromise;

      // Should only have one set of calls (the first sync)
      expect(mockSyncEngine.uploadPendingMutations).toHaveBeenCalledTimes(1);
    });

    it('should handle sync errors on network online gracefully', async () => {
      // Mock syncAll to fail
      (mockSyncEngine.uploadPendingMutations as any).mockRejectedValueOnce(
        new Error('Network sync failed')
      );

      // Should not throw
      await expect(orchestrator.handleNetworkOnline()).resolves.not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      orchestrator.startAutoSync();
      orchestrator.destroy();

      // Should be safe to call operations after destroy
      expect(orchestrator.isSyncInProgress()).toBe(false);
      expect(orchestrator.getSyncHistory()).toHaveLength(0);
    });

    it('should clear sync queue on destroy', async () => {
      // Queue multiple syncs
      const sync1 = orchestrator.syncAll();
      orchestrator.syncAll();
      orchestrator.syncAll();

      // Destroy while syncs are queued
      await sync1;
      orchestrator.destroy();

      // Queue should be empty
      expect(orchestrator.getSyncHistory()).toHaveLength(0);
    });

    it('should stop auto-sync timer on destroy', () => {
      orchestrator.startAutoSync();
      orchestrator.destroy();

      // Stopping again should be safe
      orchestrator.stopAutoSync();
    });
  });

  describe('Error Handling', () => {
    it('should handle sync metadata loading errors', async () => {
      const errorTable = createMockTable('error-table', {
        getSyncMetadata: vi.fn().mockRejectedValue(new Error('Metadata error')),
      });
      mockTables.set('error-table', errorTable);

      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      // Should not throw
      await expect(testOrchestrator.syncTable('error-table')).resolves.toBeDefined();

      testOrchestrator.destroy();
    });

    it('should handle sync metadata update errors', async () => {
      const errorTable = createMockTable('error-table', {
        updateSyncMetadata: vi.fn().mockRejectedValue(new Error('Update error')),
        sync: vi.fn().mockResolvedValue({
          tableName: 'error-table',
          success: true,
          operation: 'full-sync',
          rowsAffected: 10,
          duration: 100,
        } as SyncResult),
      });
      mockTables.set('error-table', errorTable);

      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      // Should not throw
      await expect(
        testOrchestrator.syncTable('error-table', { forceFullSync: true })
      ).resolves.toBeDefined();

      testOrchestrator.destroy();
    });

    it('should handle mutation upload errors', async () => {
      (mockSyncEngine.uploadPendingMutations as any).mockRejectedValue(
        new Error('Upload failed')
      );

      // Should not throw
      await expect(orchestrator.syncAll()).rejects.toThrow('Upload failed');
    });
  });

  describe('Full Sync Timing', () => {
    it('should load full sync times from metadata on first sync', async () => {
      const metadataTable = createMockTable('metadata-table', {
        getSyncMetadata: vi.fn().mockResolvedValue({
          tableName: 'metadata-table',
          lastFullSyncAt: Date.now() - 1000,
        }),
      });
      mockTables.set('metadata-table', metadataTable);

      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => ['metadata-table'],
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      await testOrchestrator.syncTable('metadata-table');

      expect(metadataTable.getSyncMetadata).toHaveBeenCalled();

      testOrchestrator.destroy();
    });

    it('should only load full sync times once', async () => {
      const metadataTable = createMockTable('metadata-table', {
        getSyncMetadata: vi.fn().mockResolvedValue({
          tableName: 'metadata-table',
          lastFullSyncAt: Date.now() - 1000,
        }),
      });
      mockTables.set('metadata-table', metadataTable);

      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => ['metadata-table'],
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      // Sync twice
      await testOrchestrator.syncTable('metadata-table');
      await testOrchestrator.syncTable('metadata-table');

      // Should only load once
      expect(metadataTable.getSyncMetadata).toHaveBeenCalledTimes(1);

      testOrchestrator.destroy();
    });

    it('should handle tables that return null when loading metadata', async () => {
      // Create table that returns null (no table found)
      const nullTable = createMockTable('null-table');
      mockTables.set('null-table', nullTable);

      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => name === 'null-table' ? null : mockTables.get(name) || null,
          getTableNames: () => ['null-table', 'entries'],
          notifyCacheUpdate: vi.fn(),
          getCacheStats: vi.fn().mockResolvedValue(mockCacheStats),
        }
      );

      // Should not throw when table returns null
      await expect(testOrchestrator.syncTable('entries')).resolves.toBeDefined();

      testOrchestrator.destroy();
    });
  });

  describe('Cache Statistics', () => {
    it('should get cache statistics', async () => {
      const getCacheStats = vi.fn().mockResolvedValue(mockCacheStats);
      const testOrchestrator = new SyncOrchestrator(
        DEFAULT_CONFIG,
        mockSyncEngine,
        {
          getTable: (name) => mockTables.get(name) || null,
          getTableNames: () => Array.from(mockTables.keys()),
          notifyCacheUpdate: vi.fn(),
          getCacheStats,
        }
      );

      await testOrchestrator.checkQuotaAndEvict();

      expect(getCacheStats).toHaveBeenCalled();

      testOrchestrator.destroy();
    });
  });
});

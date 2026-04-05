/**
 * MutationManager Tests
 *
 * Tests the shared MutationManager from @myk9/replication:
 * - Mutation queueing and processing
 * - Topological sorting for dependency ordering
 * - Retry logic with exponential backoff
 * - Queue persistence (localStorage backup)
 * - Error handling and user notifications
 *
 * Uses the shared MutationManager with dependency injection for
 * SupabaseClient and Logger.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MutationManager, type MutationManagerOptions } from '../MutationManager';
import type { PendingMutation, Logger } from '@myk9/replication';
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { openDB, type IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';

const TEST_DB_NAME = 'test-mutation-manager-db';

/**
 * Create a mock Supabase client for constructor injection.
 * The MutationManager uses `this.supabase.from(tableName).upsert(data).select('id')` and
 * `this.supabase.from(tableName).delete().eq('id', id)` for mutations.
 */
function createMockSupabaseClient() {
  const mockClient = {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [{ id: 'mock-id' }], error: null })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'mock-id' }], error: null })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  };
  return mockClient as unknown as SupabaseClient;
}

/**
 * Create a mock logger for constructor injection and assertion.
 */
function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('MutationManager', () => {
  let manager: MutationManager;
  let mockDb: IDBPDatabase;
  let mockSupabase: SupabaseClient;
  let mockLogger: Logger;
  let localStorageMock: Record<string, string>;

  beforeEach(async () => {
    // Setup IndexedDB
    mockDb = await openDB(TEST_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(REPLICATION_STORES.PENDING_MUTATIONS)) {
          db.createObjectStore(REPLICATION_STORES.PENDING_MUTATIONS, { keyPath: 'id' });
        }
      },
    });

    // Mock databaseManager.getDatabase to return our test DB
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);

    // Setup localStorage mock
    localStorageMock = {};
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] || null,
        setItem: (key: string, value: string) => {
          localStorageMock[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageMock[key];
        },
        clear: () => {
          localStorageMock = {};
        },
        length: 0,
        key: () => null,
      },
      writable: true,
      configurable: true,
    });

    // Setup window mock for custom events
    Object.defineProperty(global, 'window', {
      value: {
        dispatchEvent: vi.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Create mock dependencies
    mockSupabase = createMockSupabaseClient();
    mockLogger = createMockLogger();

    // Create manager instance with shared API
    const options: MutationManagerOptions = {
      maxRetries: 3,
      retryBackoffBase: 10, // Very fast for tests
      logger: mockLogger,
    };
    manager = new MutationManager(mockSupabase, options);
  });

  afterEach(async () => {
    manager.destroy();
    if (mockDb) {
      // Clear all data from IndexedDB
      try {
        const tx = mockDb.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
        await tx.store.clear();
        await tx.done;
      } catch {
        // Ignore errors during cleanup
      }
      mockDb.close();
    }
    // Clear localStorage
    localStorageMock = {};
    vi.restoreAllMocks();
  });

  describe('Mutation Upload', () => {
    it('should upload pending mutations successfully', async () => {
      const mutation: PendingMutation = {
        id: 'mut-1',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1', handler_name: 'John Doe' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      // Add mutation to queue
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.tableName).toBe('entries');
      expect(results[0]!.operation).toBe('UPDATE');

      // Verify mutation was removed from queue
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);
    });

    it('should return empty array when no pending mutations', async () => {
      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(0);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('No pending mutations to upload')
      );
    });

    it('should handle INSERT operation', async () => {
      const mutation: PendingMutation = {
        id: 'mut-2',
        tableName: 'classes',
        operation: 'INSERT',
        rowId: 'class-1',
        data: { id: 'class-1', class_name: 'Novice A' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(vi.mocked(mockSupabase.from)).toHaveBeenCalledWith('classes');
    });

    it('should handle DELETE operation', async () => {
      const mutation: PendingMutation = {
        id: 'mut-3',
        tableName: 'entries',
        operation: 'DELETE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(vi.mocked(mockSupabase.from)).toHaveBeenCalledWith('entries');
    });

    it.skip('should warn when mutation queue is large', { timeout: 10000 }, async () => {
      // Create 550 mutations (above warning threshold)
      // Skipped: Too slow for unit tests - should be integration test
      const mutations: PendingMutation[] = [];
      for (let i = 0; i < 550; i++) {
        mutations.push({
          id: `mut-${i}`,
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: `entry-${i}`,
          data: { id: `entry-${i}` },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        });
      }

      // Add all mutations
      const tx = mockDb.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
      for (const mutation of mutations) {
        await tx.store.put(mutation);
      }
      await tx.done;

      await manager.uploadPendingMutations();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Mutation queue is getting large')
      );
    });

    it.skip(
      'should dispatch overflow event when queue is at max capacity',
      { timeout: 10000 },
      async () => {
        // Create 1000 mutations (max capacity)
        // Skipped: Too slow for unit tests - should be integration test
        const mutations: PendingMutation[] = [];
        for (let i = 0; i < 1000; i++) {
          mutations.push({
            id: `mut-${i}`,
            tableName: 'entries',
            operation: 'UPDATE',
            rowId: `entry-${i}`,
            data: { id: `entry-${i}` },
            timestamp: Date.now(),
            retries: 0,
            status: 'pending',
          });
        }

        const tx = mockDb.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
        for (const mutation of mutations) {
          await tx.store.put(mutation);
        }
        await tx.done;

        await manager.uploadPendingMutations();

        expect(window.dispatchEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'replication:queue-overflow',
          })
        );
      }
    );
  });

  describe('Retry Logic', () => {
    it('should retry failed mutations with exponential backoff', async () => {
      const mutation: PendingMutation = {
        id: 'mut-retry',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      // Mock network error (retryable - contains 'network' and 'timeout')
      const mockError = new Error('Network timeout');
      vi.mocked(mockSupabase.from).mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(mockError)),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);

      // Verify mutation was updated with retry count
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-retry');
      expect(updated?.retries).toBe(1);
      expect(updated?.status).toBe('pending');
      expect(updated?.error).toBe('Network timeout');
    });

    it('should mark mutation as failed after max retries', async () => {
      const mutation: PendingMutation = {
        id: 'mut-max-retry',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 2, // Already at 2 retries
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      // Mock network error (retryable)
      const mockError = new Error('Network timeout');
      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(mockError)),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      // Mutation is deleted from queue after permanent failure (retries >= maxRetries)
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-max-retry');
      expect(updated).toBeUndefined();
    });

    it('should fail immediately for non-retryable errors', async () => {
      const mutation: PendingMutation = {
        id: 'mut-non-retry',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      // Mock validation error (non-retryable - doesn't contain network/timeout/connection)
      const mockError = new Error('Validation failed');
      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(mockError)),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      // Mutation is deleted from queue after permanent failure (non-retryable)
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-non-retry');
      expect(updated).toBeUndefined();
    });

    it('should notify user when mutations fail permanently', async () => {
      const mutation: PendingMutation = {
        id: 'mut-notify',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 2,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      const mockError = new Error('Permanent failure');
      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(mockError)),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      // Verify notification event was dispatched
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'replication:sync-failed',
        })
      );
    });
  });

  describe('Topological Sorting', () => {
    it('should sort mutations by dependencies', { timeout: 5000 }, async () => {
      const mutations: PendingMutation[] = [
        {
          id: 'mut-3',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-1',
          data: { id: 'entry-1', class_id: 'class-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
          dependsOn: ['mut-1', 'mut-2'], // Depends on class creation
        },
        {
          id: 'mut-2',
          tableName: 'classes',
          operation: 'UPDATE',
          rowId: 'class-1',
          data: { id: 'class-1', trial_id: 'trial-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
          dependsOn: ['mut-1'], // Depends on trial
        },
        {
          id: 'mut-1',
          tableName: 'trials',
          operation: 'INSERT',
          rowId: 'trial-1',
          data: { id: 'trial-1', show_id: 'show-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
      ];

      // Add mutations in wrong order
      for (const mutation of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      }

      const executionOrder: string[] = [];
      vi.mocked(mockSupabase.from).mockImplementation(
        () =>
          ({
            insert: vi.fn((data: Record<string, unknown>) => {
              executionOrder.push(data.id as string);
              return {
                select: vi.fn(() => Promise.resolve({ data: [{ id: data.id }], error: null })),
              };
            }),
            update: vi.fn((data: Record<string, unknown>) => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => {
                  executionOrder.push(data.id as string);
                  return Promise.resolve({ data: [{ id: data.id }], error: null });
                }),
              })),
            })),
          }) as unknown as ReturnType<typeof mockSupabase.from>
      );

      await manager.uploadPendingMutations();

      // Verify correct execution order
      expect(executionOrder).toEqual(['trial-1', 'class-1', 'entry-1']);
    });

    it('should handle mutations with no dependencies', { timeout: 5000 }, async () => {
      const mutations: PendingMutation[] = [
        {
          id: 'mut-a',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-a',
          data: { id: 'entry-a' },
          timestamp: Date.now() + 2,
          retries: 0,
          status: 'pending',
        },
        {
          id: 'mut-b',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-b',
          data: { id: 'entry-b' },
          timestamp: Date.now() + 1,
          retries: 0,
          status: 'pending',
        },
        {
          id: 'mut-c',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-c',
          data: { id: 'entry-c' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
      ];

      for (const mutation of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      }

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle circular dependencies gracefully', { timeout: 5000 }, async () => {
      const mutations: PendingMutation[] = [
        {
          id: 'mut-a',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-a',
          data: { id: 'entry-a' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
          dependsOn: ['mut-b'],
        },
        {
          id: 'mut-b',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-b',
          data: { id: 'entry-b' },
          timestamp: Date.now() + 1,
          retries: 0,
          status: 'pending',
          dependsOn: ['mut-a'],
        },
      ];

      for (const mutation of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      }

      await manager.uploadPendingMutations();

      // Should log warning about circular dependency
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency detected')
      );
    });

    it(
      'should use sequence numbers for circular dependency fallback',
      { timeout: 5000 },
      async () => {
        // When circular dependencies are detected, remaining mutations are sorted
        // by sequenceNumber (if available) rather than timestamp
        const now = Date.now();
        const mutations: PendingMutation[] = [
          {
            id: 'mut-3',
            tableName: 'entries',
            operation: 'UPDATE',
            rowId: 'entry-3',
            data: { id: 'entry-3' },
            timestamp: now,
            retries: 0,
            status: 'pending',
            sequenceNumber: 3,
            dependsOn: ['mut-1'], // Circular: mut-3 -> mut-1 -> mut-3
          },
          {
            id: 'mut-1',
            tableName: 'entries',
            operation: 'UPDATE',
            rowId: 'entry-1',
            data: { id: 'entry-1' },
            timestamp: now + 1,
            retries: 0,
            status: 'pending',
            sequenceNumber: 1,
            dependsOn: ['mut-3'], // Circular: mut-1 -> mut-3 -> mut-1
          },
          {
            id: 'mut-2',
            tableName: 'entries',
            operation: 'UPDATE',
            rowId: 'entry-2',
            data: { id: 'entry-2' },
            timestamp: now + 2,
            retries: 0,
            status: 'pending',
            sequenceNumber: 2,
            dependsOn: ['mut-3'], // Depends on mut-3 which is in a cycle
          },
        ];

        for (const mutation of mutations) {
          await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
        }

        const executionOrder: string[] = [];
        vi.mocked(mockSupabase.from).mockImplementation(
          () =>
            ({
              update: vi.fn((data: Record<string, unknown>) => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => {
                    executionOrder.push(data.id as string);
                    return Promise.resolve({ data: [{ id: data.id }], error: null });
                  }),
                })),
              })),
            }) as unknown as ReturnType<typeof mockSupabase.from>
        );

        await manager.uploadPendingMutations();

        // All mutations are in or blocked by a cycle, so they go through the
        // fallback path and are sorted by sequenceNumber
        expect(executionOrder).toEqual(['entry-1', 'entry-2', 'entry-3']);

        // Should log warning about circular dependency
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Circular dependency detected')
        );
      }
    );
  });

  describe('Backup and Restore', () => {
    it('should backup mutations to localStorage', { timeout: 5000 }, async () => {
      const mutations: PendingMutation[] = [
        {
          id: 'mut-backup-1',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-1',
          data: { id: 'entry-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
        {
          id: 'mut-backup-2',
          tableName: 'classes',
          operation: 'INSERT',
          rowId: 'class-1',
          data: { id: 'class-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
      ];

      for (const mutation of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      }

      const backupPromise = manager.backupMutationsToLocalStorage();

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 1100));

      await backupPromise;

      const backup = localStorageMock['replication_mutation_backup'];
      expect(backup).toBeDefined();

      const parsed = JSON.parse(backup);
      expect(parsed).toHaveLength(2);
      expect(parsed.map((m: PendingMutation) => m.id)).toEqual(['mut-backup-1', 'mut-backup-2']);
    });

    it('should remove backup when no mutations pending', { timeout: 5000 }, async () => {
      localStorageMock['replication_mutation_backup'] = JSON.stringify([
        { id: 'old-mut', tableName: 'entries' },
      ]);

      const backupPromise = manager.backupMutationsToLocalStorage();

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 1100));

      await backupPromise;

      expect(localStorageMock['replication_mutation_backup']).toBeUndefined();
    });

    it('should restore mutations from localStorage backup', { timeout: 5000 }, async () => {
      const backup: PendingMutation[] = [
        {
          id: 'mut-restore-1',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-1',
          data: { id: 'entry-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
        {
          id: 'mut-restore-2',
          tableName: 'classes',
          operation: 'INSERT',
          rowId: 'class-1',
          data: { id: 'class-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
      ];

      localStorageMock['replication_mutation_backup'] = JSON.stringify(backup);

      await manager.restoreMutationsFromLocalStorage();

      const restored = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(restored).toHaveLength(2);
      expect(restored.map((m: PendingMutation) => m.id)).toEqual([
        'mut-restore-1',
        'mut-restore-2',
      ]);
    });

    it('should not restore mutations that already exist', { timeout: 5000 }, async () => {
      // Add existing mutation to DB
      const existing: PendingMutation = {
        id: 'mut-existing',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, existing);

      // Backup includes existing + new mutation
      const backup: PendingMutation[] = [
        existing,
        {
          id: 'mut-new',
          tableName: 'classes',
          operation: 'INSERT',
          rowId: 'class-1',
          data: { id: 'class-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
      ];

      localStorageMock['replication_mutation_backup'] = JSON.stringify(backup);

      await manager.restoreMutationsFromLocalStorage();

      const all = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(all).toHaveLength(2); // Should have existing + new, not duplicate
    });

    it('should handle missing backup gracefully', async () => {
      await expect(manager.restoreMutationsFromLocalStorage()).resolves.not.toThrow();
    });

    it('should handle corrupted backup gracefully', async () => {
      localStorageMock['replication_mutation_backup'] = 'invalid json {{{';

      await expect(manager.restoreMutationsFromLocalStorage()).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restore mutations'),
        expect.any(Error)
      );
    });

    it('should debounce multiple backup calls', async () => {
      const mutation: PendingMutation = {
        id: 'mut-debounce',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      // Call backup multiple times rapidly
      manager.backupMutationsToLocalStorage();
      manager.backupMutationsToLocalStorage();
      manager.backupMutationsToLocalStorage();

      // Wait less than debounce time
      await new Promise(resolve => setTimeout(resolve, 500));

      // Backup should not have executed yet
      expect(localStorageMock['replication_mutation_backup']).toBeUndefined();

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 600));

      // Now backup should exist
      expect(localStorageMock['replication_mutation_backup']).toBeDefined();
    });

    it.skip('should prevent concurrent backup operations', { timeout: 10000 }, async () => {
      const mutations: PendingMutation[] = [
        {
          id: 'mut-concurrent',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-1',
          data: { id: 'entry-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
      ];

      for (const mutation of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      }

      // Trigger backup
      const backup1 = manager.backupMutationsToLocalStorage();

      // Immediately trigger another backup
      const backup2 = manager.backupMutationsToLocalStorage();

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 1100));

      await Promise.all([backup1, backup2]);

      // Should have logged about skipping duplicate
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Backup already in progress')
      );
    });
  });

  describe('Cleanup', () => {
    it('should clear all pending mutations', async () => {
      const mutations: PendingMutation[] = [
        {
          id: 'mut-clear-1',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-1',
          data: { id: 'entry-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
        {
          id: 'mut-clear-2',
          tableName: 'classes',
          operation: 'INSERT',
          rowId: 'class-1',
          data: { id: 'class-1' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
        },
      ];

      for (const mutation of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      }

      // Also set backup
      localStorageMock['replication_mutation_backup'] = JSON.stringify(mutations);

      await manager.clearAllMutations();

      // Verify IndexedDB cleared
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);

      // Verify localStorage cleared
      expect(localStorageMock['replication_mutation_backup']).toBeUndefined();
    });

    it('should handle empty queue gracefully', async () => {
      await expect(manager.clearAllMutations()).resolves.not.toThrow();
    });

    it('should clean up timers on destroy', () => {
      manager.destroy();

      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Destroyed'));
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Override databaseManager mock to throw
      vi.mocked(databaseManager.getDatabase).mockRejectedValueOnce(new Error('DB error'));

      const brokenManager = new MutationManager(mockSupabase, {
        maxRetries: 3,
        retryBackoffBase: 10,
        logger: mockLogger,
      });

      const results = await brokenManager.uploadPendingMutations();

      expect(results).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to upload mutations'),
        expect.any(Error)
      );
    });

    it('should handle unknown operation type', async () => {
      const mutation: PendingMutation = {
        id: 'mut-unknown',
        tableName: 'entries',
        operation: 'UNKNOWN_OP' as PendingMutation['operation'],
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('Unknown operation');
    });

    it('should handle supabase errors', { timeout: 5000 }, async () => {
      const mutation: PendingMutation = {
        id: 'mut-supabase-error',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      const supabaseError = { message: 'Database error', code: '500' };
      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: null, error: supabaseError })),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should respect custom max retries', async () => {
      const customManager = new MutationManager(mockSupabase, {
        maxRetries: 5,
        retryBackoffBase: 10,
        logger: mockLogger,
      });

      const mutation: PendingMutation = {
        id: 'mut-custom',
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 4,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      const mockError = new Error('Network error');
      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(mockError)),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await customManager.uploadPendingMutations();

      // Mutation is deleted from queue after permanent failure (retries >= maxRetries)
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-custom');
      expect(updated).toBeUndefined();
    });

    it('should use default config values', () => {
      const defaultManager = new MutationManager(mockSupabase);
      expect(defaultManager).toBeDefined();
    });
  });
});

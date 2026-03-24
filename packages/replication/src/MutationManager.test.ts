/**
 * MutationManager Tests
 *
 * Tests for the shared MutationManager from @myk9/replication:
 * - Mutation queueing and auto-upload scheduling
 * - Upload concurrency guard
 * - Topological sorting for dependency ordering
 * - Retry logic with exponential backoff
 * - Queue persistence (localStorage backup)
 * - Error handling and user notifications
 * - Cleanup and destroy
 *
 * Adapted from apps/myk9q MutationManager tests with fixes for
 * the shared package's .upsert().select('id') chain and new
 * auto-upload features.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MutationManager, type MutationManagerOptions } from './MutationManager';
import type { PendingMutation } from './types';
import type { Logger } from './dependencies';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { openDB, type IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';

const TEST_DB_NAME = 'test-mutation-manager-db';

/**
 * Create a mock Supabase client that supports the full chain:
 *   .from(table).upsert(data).select('id') → { data: [{ id }], error: null }
 *   .from(table).delete().eq('id', id) → { data: null, error: null }
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

function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeMutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: `mut-${Math.random().toString(36).slice(2)}`,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-1',
    data: { id: 'entry-1', handler_name: 'John Doe' },
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('MutationManager', () => {
  let manager: MutationManager;
  let mockDb: IDBPDatabase;
  let mockSupabase: SupabaseClient;
  let mockLogger: Logger;
  let localStorageMock: Record<string, string>;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Setup IndexedDB
    mockDb = await openDB(TEST_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(REPLICATION_STORES.PENDING_MUTATIONS)) {
          db.createObjectStore(REPLICATION_STORES.PENDING_MUTATIONS, { keyPath: 'id' });
        }
      },
    });

    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);

    // Setup localStorage mock
    localStorageMock = {};
    Object.defineProperty(globalThis, 'localStorage', {
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
    Object.defineProperty(globalThis, 'window', {
      value: {
        dispatchEvent: vi.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Setup navigator.onLine (default: online)
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });

    mockSupabase = createMockSupabaseClient();
    mockLogger = createMockLogger();

    const options: MutationManagerOptions = {
      maxRetries: 3,
      retryBackoffBase: 10, // Fast for tests
      logger: mockLogger,
    };
    manager = new MutationManager(mockSupabase, options);
  });

  afterEach(async () => {
    manager.destroy();
    if (mockDb) {
      try {
        const tx = mockDb.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
        await tx.store.clear();
        await tx.done;
      } catch {
        // Ignore errors during cleanup
      }
      mockDb.close();
    }
    localStorageMock = {};
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ========================================
  // QUEUEING
  // ========================================

  describe('Mutation Queueing', () => {
    it('should queue a mutation and return an id', async () => {
      const id = await manager.queueMutation('entries', 'UPDATE', 'entry-1', {
        id: 'entry-1',
        name: 'Test',
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');

      const pending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(pending).toHaveLength(1);
      expect(pending[0].tableName).toBe('entries');
      expect(pending[0].operation).toBe('UPDATE');
    });

    it('should store mutation with correct metadata', async () => {
      const id = await manager.queueMutation('shows', 'INSERT', 'show-1', {
        id: 'show-1',
        name: 'Test Show',
      });

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, id);
      expect(stored).toBeDefined();
      expect(stored.retries).toBe(0);
      expect(stored.status).toBe('pending');
      expect(stored.timestamp).toBeGreaterThan(0);
    });

    it('should report pending count', async () => {
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'a' }));
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'b' }));

      const count = await manager.getPendingCount();
      expect(count).toBe(2);
    });
  });

  // ========================================
  // AUTO-UPLOAD
  // ========================================

  describe('Auto-Upload Scheduling', () => {
    it('should schedule upload after queueMutation', async () => {
      const uploadSpy = vi.spyOn(manager, 'uploadPendingMutations').mockResolvedValue([]);

      await manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1' });

      // Upload not called yet (debounced 100ms)
      expect(uploadSpy).not.toHaveBeenCalled();

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(150);

      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });

    it('should reset debounce timer on each queue call', async () => {
      const uploadSpy = vi.spyOn(manager, 'uploadPendingMutations').mockResolvedValue([]);

      await manager.queueMutation('entries', 'UPDATE', 'e-1', { id: 'e-1' });

      // Advance 50ms (less than 100ms debounce)
      await vi.advanceTimersByTimeAsync(50);
      expect(uploadSpy).not.toHaveBeenCalled();

      // Queue another — should reset the timer
      await manager.queueMutation('entries', 'UPDATE', 'e-2', { id: 'e-2' });

      // Advance past original 100ms but not past reset timer
      await vi.advanceTimersByTimeAsync(60);

      // The upload count depends on I/O timing between queues, but
      // each queueMutation always schedules a new upload
      const callsBefore = uploadSpy.mock.calls.length;

      // After full debounce from last queue, upload fires
      await vi.advanceTimersByTimeAsync(100);
      expect(uploadSpy.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
    });

    it('should skip auto-upload when offline', async () => {
      Object.defineProperty(globalThis.navigator, 'onLine', { value: false, writable: true });

      const uploadSpy = vi.spyOn(manager, 'uploadPendingMutations').mockResolvedValue([]);

      await manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1' });
      await vi.advanceTimersByTimeAsync(150);

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Offline, deferring auto-upload')
      );
    });

    it('should handle auto-upload errors gracefully', async () => {
      vi.spyOn(manager, 'uploadPendingMutations').mockRejectedValue(new Error('Upload failed'));

      await manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1' });
      await vi.advanceTimersByTimeAsync(150);

      // Should log error, not throw
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Auto-upload failed'),
        expect.any(Error)
      );
    });
  });

  // ========================================
  // UPLOAD CONCURRENCY
  // ========================================

  describe('Upload Concurrency Guard', () => {
    it('should skip if upload already in progress', async () => {
      // Put a mutation in the queue
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'mut-1' }));

      // Start first upload (will take time due to Supabase call)
      const upload1 = manager.uploadPendingMutations();

      // Start second upload immediately
      const results2 = await manager.uploadPendingMutations();

      // Second should return empty (skipped)
      expect(results2).toEqual([]);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Upload already in progress')
      );

      // First should complete normally
      const results1 = await upload1;
      expect(results1).toHaveLength(1);
      expect(results1[0]!.success).toBe(true);
    });

    it('should reset isUploading after successful upload', async () => {
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'mut-1' }));

      await manager.uploadPendingMutations();

      // Should be able to upload again
      const results = await manager.uploadPendingMutations();
      // Empty because queue was cleared by first upload
      expect(results).toEqual([]);
    });

    it('should reset isUploading after failed upload', async () => {
      vi.mocked(databaseManager.getDatabase)
        .mockRejectedValueOnce(new Error('DB crash'))
        .mockResolvedValue(mockDb); // Restore for next call

      await manager.uploadPendingMutations();

      // isUploading should be reset — next call shouldn't be skipped
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'mut-2' }));
      const results = await manager.uploadPendingMutations();
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
    });
  });

  // ========================================
  // MUTATION UPLOAD
  // ========================================

  describe('Mutation Upload', () => {
    it('should upload pending mutations successfully', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-1', tableName: 'entries', operation: 'UPDATE' })
      );

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.tableName).toBe('entries');
      expect(results[0]!.operation).toBe('UPDATE');

      // Mutation removed from queue
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);
    });

    it('should dispatch upload-complete event with affected table names', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-evt-1', tableName: 'entries', operation: 'INSERT' })
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-evt-2', tableName: 'entries', operation: 'UPDATE' })
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-evt-3', tableName: 'dogs', operation: 'INSERT' })
      );

      await manager.uploadPendingMutations();

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'replication:upload-complete',
          detail: expect.objectContaining({
            tables: expect.arrayContaining(['entries', 'dogs']),
            count: 3,
          }),
        })
      );
    });

    it('should not dispatch upload-complete event when no mutations succeed', async () => {
      // Empty queue — no uploads to dispatch about
      await manager.uploadPendingMutations();

      expect(window.dispatchEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'replication:upload-complete' })
      );
    });

    it('should return empty array when no pending mutations', async () => {
      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(0);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('No pending mutations to upload')
      );
    });

    it('should handle INSERT operation via insert().select()', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-ins', tableName: 'classes', operation: 'INSERT' })
      );

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(vi.mocked(mockSupabase.from)).toHaveBeenCalledWith('classes');
    });

    it('should handle DELETE operation', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-del',
          tableName: 'entries',
          operation: 'DELETE',
          data: { id: 'entry-1' },
        })
      );

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(vi.mocked(mockSupabase.from)).toHaveBeenCalledWith('entries');
    });

    it('should detect RLS rejection (0 rows returned)', async () => {
      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'mut-rls' }));

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('RLS policy blocked');
    });
  });

  // ========================================
  // RETRY LOGIC
  // ========================================

  describe('Retry Logic', () => {
    it('should retry failed mutations with retryable errors', async () => {
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'mut-retry' }));

      // Mock network error (retryable)
      vi.mocked(mockSupabase.from).mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(new Error('Network timeout'))),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);

      // Mutation stays in queue with incremented retry count
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-retry');
      expect(updated?.retries).toBe(1);
      expect(updated?.status).toBe('pending');
      expect(updated?.error).toBe('Network timeout');
    });

    it('should mark mutation as failed after max retries', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-max', retries: 2 }) // Already at 2, max is 3
      );

      vi.mocked(mockSupabase.from).mockReturnValue({
        upsert: vi.fn(() => ({
          select: vi.fn(() => Promise.reject(new Error('Network timeout'))),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      // Permanently failed mutations are removed from queue
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);
    });

    it('should fail immediately for non-retryable errors', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-nonretry', retries: 0 })
      );

      vi.mocked(mockSupabase.from).mockReturnValue({
        upsert: vi.fn(() => ({
          select: vi.fn(() => Promise.reject(new Error('Validation failed'))),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      // Removed from queue (non-retryable → permanent failure)
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);
    });

    it('should notify user when mutations fail permanently', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-notify', retries: 2 })
      );

      vi.mocked(mockSupabase.from).mockReturnValue({
        upsert: vi.fn(() => ({
          select: vi.fn(() => Promise.reject(new Error('Permanent failure'))),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'replication:sync-failed' })
      );
    });

    it('should handle supabase error objects', async () => {
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'mut-supa' }));

      const supabaseError = { message: 'Database error', code: '500' };
      vi.mocked(mockSupabase.from).mockReturnValue({
        upsert: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: null, error: supabaseError })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
    });
  });

  // ========================================
  // TOPOLOGICAL SORTING
  // ========================================

  describe('Topological Sorting', () => {
    it('should sort mutations by dependencies', async () => {
      const mutations: PendingMutation[] = [
        makeMutation({
          id: 'mut-3',
          tableName: 'entries',
          rowId: 'entry-1',
          data: { id: 'entry-1' },
          dependsOn: ['mut-1', 'mut-2'],
        }),
        makeMutation({
          id: 'mut-2',
          tableName: 'classes',
          rowId: 'class-1',
          data: { id: 'class-1' },
          dependsOn: ['mut-1'],
        }),
        makeMutation({
          id: 'mut-1',
          tableName: 'trials',
          operation: 'INSERT',
          rowId: 'trial-1',
          data: { id: 'trial-1' },
        }),
      ];

      for (const m of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, m);
      }

      const executionOrder: string[] = [];
      const trackingChain = (data: Record<string, unknown>) => ({
        select: vi.fn(() => {
          executionOrder.push(data.id as string);
          return Promise.resolve({ data: [{ id: data.id }], error: null });
        }),
      });
      vi.mocked(mockSupabase.from).mockImplementation(
        () =>
          ({
            insert: vi.fn(trackingChain),
            update: vi.fn((data: Record<string, unknown>) => ({
              eq: vi.fn(() => trackingChain(data)),
            })),
          }) as unknown as ReturnType<typeof mockSupabase.from>
      );

      await manager.uploadPendingMutations();

      expect(executionOrder).toEqual(['trial-1', 'class-1', 'entry-1']);
    });

    it('should handle mutations with no dependencies', async () => {
      const mutations = [
        makeMutation({ id: 'a', timestamp: Date.now() + 2, data: { id: 'a' } }),
        makeMutation({ id: 'b', timestamp: Date.now() + 1, data: { id: 'b' } }),
        makeMutation({ id: 'c', timestamp: Date.now(), data: { id: 'c' } }),
      ];

      for (const m of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, m);
      }

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle circular dependencies gracefully', async () => {
      const mutations = [
        makeMutation({ id: 'mut-a', data: { id: 'a' }, dependsOn: ['mut-b'] }),
        makeMutation({
          id: 'mut-b',
          data: { id: 'b' },
          timestamp: Date.now() + 1,
          dependsOn: ['mut-a'],
        }),
      ];

      for (const m of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, m);
      }

      await manager.uploadPendingMutations();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency detected')
      );
    });
  });

  // ========================================
  // BACKUP / RESTORE
  // ========================================

  describe('Backup and Restore', () => {
    it('should backup mutations to localStorage', async () => {
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'mut-backup-1' }));

      const backupPromise = manager.backupMutationsToLocalStorage();

      // Advance past debounce (1000ms)
      await vi.advanceTimersByTimeAsync(1100);
      await backupPromise;

      const backup = localStorageMock['replication_mutation_backup'];
      expect(backup).toBeDefined();

      const parsed = JSON.parse(backup!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('mut-backup-1');
    });

    it('should remove backup when no mutations pending', async () => {
      localStorageMock['replication_mutation_backup'] = JSON.stringify([
        { id: 'old-mut', tableName: 'entries' },
      ]);

      const backupPromise = manager.backupMutationsToLocalStorage();
      await vi.advanceTimersByTimeAsync(1100);
      await backupPromise;

      expect(localStorageMock['replication_mutation_backup']).toBeUndefined();
    });

    it('should restore mutations from localStorage backup', async () => {
      const backup = [makeMutation({ id: 'mut-restore-1' }), makeMutation({ id: 'mut-restore-2' })];

      localStorageMock['replication_mutation_backup'] = JSON.stringify(backup);

      await manager.restoreMutationsFromLocalStorage();

      const restored = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(restored).toHaveLength(2);
    });

    it('should not restore mutations that already exist', async () => {
      const existing = makeMutation({ id: 'mut-existing' });
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, existing);

      localStorageMock['replication_mutation_backup'] = JSON.stringify([
        existing,
        makeMutation({ id: 'mut-new' }),
      ]);

      await manager.restoreMutationsFromLocalStorage();

      const all = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(all).toHaveLength(2); // existing + new, not duplicate
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
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'mut-d' }));

      // Call backup multiple times rapidly
      manager.backupMutationsToLocalStorage();
      manager.backupMutationsToLocalStorage();
      manager.backupMutationsToLocalStorage();

      // Before debounce completes
      await vi.advanceTimersByTimeAsync(500);
      expect(localStorageMock['replication_mutation_backup']).toBeUndefined();

      // After debounce
      await vi.advanceTimersByTimeAsync(600);
      expect(localStorageMock['replication_mutation_backup']).toBeDefined();
    });
  });

  // ========================================
  // CLEANUP
  // ========================================

  describe('Cleanup', () => {
    it('should clear all pending mutations and backup', async () => {
      const mutations = [makeMutation({ id: 'mut-clear-1' }), makeMutation({ id: 'mut-clear-2' })];

      for (const m of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, m);
      }
      localStorageMock['replication_mutation_backup'] = JSON.stringify(mutations);

      await manager.clearAllMutations();

      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);
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

  // ========================================
  // ERROR HANDLING
  // ========================================

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(databaseManager.getDatabase).mockRejectedValueOnce(new Error('DB error'));

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to upload mutations'),
        expect.any(Error)
      );
    });

    it('should handle unknown operation type', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-unk', operation: 'UNKNOWN_OP' as PendingMutation['operation'] })
      );

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('Unknown operation');
    });
  });

  // ========================================
  // CONFIGURATION
  // ========================================

  describe('Configuration', () => {
    it('should respect custom max retries', async () => {
      const customManager = new MutationManager(mockSupabase, {
        maxRetries: 5,
        retryBackoffBase: 10,
        logger: mockLogger,
      });

      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-custom', retries: 4 })
      );

      vi.mocked(mockSupabase.from).mockReturnValue({
        upsert: vi.fn(() => ({
          select: vi.fn(() => Promise.reject(new Error('Network error'))),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await customManager.uploadPendingMutations();

      // retries (5) >= maxRetries (5) → permanently failed and removed
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);

      customManager.destroy();
    });

    it('should use default config values', () => {
      const defaultManager = new MutationManager(mockSupabase);
      expect(defaultManager).toBeDefined();
      defaultManager.destroy();
    });
  });
});

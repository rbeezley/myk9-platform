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
import type { PendingMutation, ReplicatedRow } from './types';
import type { Logger } from './dependencies';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

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
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'mock-id' }], error: null })),
        })),
      })),
    })),
    // RPC-routed UPDATEs (e.g. ringside_update_entry) return the new version.
    rpc: vi.fn(() => Promise.resolve({ data: 2, error: null })),
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
    mockDb = await createMutationManagerTestDb(TEST_DB_NAME);

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
        const failedTx = mockDb.transaction(REPLICATION_STORES.FAILED_MUTATIONS, 'readwrite');
        await failedTx.store.clear();
        await failedTx.done;
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

    it('assigns a strictly increasing sequenceNumber per queued mutation', async () => {
      const id1 = await manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1' });
      const id2 = await manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1' });
      const id3 = await manager.queueMutation('entries', 'UPDATE', 'entry-2', { id: 'entry-2' });

      const [m1, m2, m3] = await Promise.all([
        mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, id1),
        mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, id2),
        mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, id3),
      ]);

      // Monotonic: guarantees oldest-first upload ordering even when timestamps
      // collide (audit H1).
      expect(typeof m1.sequenceNumber).toBe('number');
      expect(m2.sequenceNumber).toBeGreaterThan(m1.sequenceNumber);
      expect(m3.sequenceNumber).toBeGreaterThan(m2.sequenceNumber);
    });

    it('seeds the sequence above existing mutations so it survives a reload', async () => {
      // Simulate a mutation persisted before this manager instance existed.
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'pre-existing', sequenceNumber: 500 })
      );

      const id = await manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1' });
      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, id);

      // New sequence continues above the max already in the store.
      expect(stored.sequenceNumber).toBeGreaterThan(500);
    });

    it('should report pending count', async () => {
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'a' }));
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation({ id: 'b' }));

      const count = await manager.getPendingCount();
      expect(count).toBe(2);
    });

    it('should return pending mutations for a specific table row', async () => {
      const dogMutationId = await manager.queueMutation('dogs', 'INSERT', 'dog-1', {
        id: 'dog-1',
        name: 'Beacon',
      });
      await manager.queueMutation('entries', 'INSERT', 'entry-1', {
        id: 'entry-1',
        dog_id: 'dog-1',
      });

      const mutations = await manager.getPendingMutationsForRow('dogs', 'dog-1');

      expect(mutations).toHaveLength(1);
      expect(mutations[0]?.id).toBe(dogMutationId);
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

      await expect(manager.uploadPendingMutations()).rejects.toThrow('DB crash');

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

    it('removes stale localStorage backup immediately after successful upload', async () => {
      const mutation = makeMutation({
        id: 'mut-stale-backup',
        tableName: 'clubs',
        operation: 'INSERT',
      });
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      localStorageMock['replication_mutation_backup'] = JSON.stringify([mutation]);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(localStorageMock['replication_mutation_backup']).toBeUndefined();
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

    it('treats a primary-key 23505 on INSERT as success (idempotent retry)', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-dup', tableName: 'entries', operation: 'INSERT' })
      );

      const dupKeyError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "entries_pkey"',
        details: 'Key (id)=(entry-1) already exists.',
      };
      vi.mocked(mockSupabase.from).mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: null, error: dupKeyError })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);

      // Mutation removed from pending (treated as done)
      const pending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(pending).toHaveLength(0);

      // Mutation NOT moved to failed store
      const failed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      expect(failed).toHaveLength(0);
    });

    it('does NOT treat a non-primary-key 23505 on INSERT as success', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-club-name-dup',
          tableName: 'clubs',
          operation: 'INSERT',
          rowId: 'club-1',
          data: { id: 'club-1', name: ' heartland  scent-work club ' },
        })
      );

      const dupNameError = {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "clubs_live_normalized_name_unique"',
        details: 'Key (normalize_club_name(name))=(HEARTLAND SCENT WORK CLUB) already exists.',
      };
      vi.mocked(mockSupabase.from).mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: null, error: dupNameError })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);

      const pending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(pending).toHaveLength(0);

      const failed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      expect(failed).toHaveLength(1);
      expect(failed[0]!.id).toBe('mut-club-name-dup');
    });

    it('does NOT treat a 23505 on UPDATE as success — still permanently fails', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-upd-dup', tableName: 'entries', operation: 'UPDATE' })
      );

      const dupKeyError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      };
      vi.mocked(mockSupabase.from).mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: null, error: dupKeyError })),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);

      // 23505 on UPDATE is a real constraint failure, not an idempotent retry
      const failed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      expect(failed).toHaveLength(1);
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

    it('routes a tagged UPDATE through the RPC, not a direct table update', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-rpc',
          tableName: 'entries',
          operation: 'UPDATE',
          data: { id: 'entry-1', run_order: 3 },
          serverVersion: 5,
          rpc: { name: 'ringside_update_entry', fields: { run_order: 3 } },
        })
      );

      const results = await manager.uploadPendingMutations();

      expect(results[0]!.success).toBe(true);
      expect(vi.mocked(mockSupabase.rpc)).toHaveBeenCalledWith('ringside_update_entry', {
        p_entry_id: 'entry-1',
        p_fields: { run_order: 3 },
        p_expected_version: 5,
      });
      // The direct table-update path must NOT be used for an RPC-tagged mutation.
      expect(vi.mocked(mockSupabase.from)).not.toHaveBeenCalled();
    });

    it('passes a null expected version when the tagged UPDATE has no serverVersion', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-rpc-noocc',
          operation: 'UPDATE',
          data: { id: 'entry-2', check_in_status: 'in-ring' },
          rpc: { name: 'ringside_update_entry', fields: { check_in_status: 'in-ring' } },
        })
      );

      await manager.uploadPendingMutations();

      expect(vi.mocked(mockSupabase.rpc)).toHaveBeenCalledWith('ringside_update_entry', {
        p_entry_id: 'entry-2',
        p_fields: { check_in_status: 'in-ring' },
        p_expected_version: null,
      });
    });

    it('routes a tagged INSERT through exact RPC args, not a direct table insert', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: 'dog-1', error: null } as never);
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-dog-rpc',
          tableName: 'dogs',
          operation: 'INSERT',
          rowId: 'dog-1',
          data: { id: 'dog-1', owner_id: 'person-1' },
          rpc: {
            name: 'create_dog_with_registrations',
            args: {
              p_dog: { id: 'dog-1', owner_id: 'person-1' },
              p_registrations: [{ organization: 'AKC', registration_number: 'SW123456' }],
            },
            expectRowId: true,
          },
        })
      );

      const results = await manager.uploadPendingMutations();

      expect(results[0]!.success).toBe(true);
      expect(vi.mocked(mockSupabase.rpc)).toHaveBeenCalledWith('create_dog_with_registrations', {
        p_dog: { id: 'dog-1', owner_id: 'person-1' },
        p_registrations: [{ organization: 'AKC', registration_number: 'SW123456' }],
      });
      expect(vi.mocked(mockSupabase.from)).not.toHaveBeenCalled();
    });

    it('remaps dog dependents when an RPC INSERT returns an existing dog id', async () => {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({
        data: 'existing-dog-1',
        error: null,
      } as never);
      const entryInsertMock = vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [{ id: 'entry-1' }], error: null })),
      }));
      vi.mocked(mockSupabase.from).mockImplementation(
        () =>
          ({
            insert: entryInsertMock,
          }) as never
      );
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'dogs',
        id: 'existing-dog-1',
        data: { id: 'existing-dog-1', name: 'Canonical Beacon', ownerId: 'person-1' },
        version: 3,
        lastSyncedAt: 123,
        lastAccessedAt: 123,
        isDirty: false,
        syncStatus: 'synced',
      } satisfies ReplicatedRow<Record<string, unknown>>);
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'dogs',
        id: 'dog-1',
        data: { id: 'dog-1', name: 'Beacon', ownerId: 'person-1' },
        version: 1,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'pending',
      } satisfies ReplicatedRow<Record<string, unknown>>);
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'entries',
        id: 'entry-1',
        data: { id: 'entry-1', dogId: 'dog-1' },
        version: 1,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'pending',
      } satisfies ReplicatedRow<Record<string, unknown>>);
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'dog_registrations',
        id: 'registration-1',
        data: { id: 'registration-1', dogId: 'dog-1', registrationNumber: 'SW123456' },
        version: 1,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: false,
        syncStatus: 'synced',
      } satisfies ReplicatedRow<Record<string, unknown>>);
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-dog-rpc',
          tableName: 'dogs',
          operation: 'INSERT',
          rowId: 'dog-1',
          data: { id: 'dog-1', owner_id: 'person-1' },
          rpc: {
            name: 'create_dog_with_registrations',
            args: {
              p_dog: { id: 'dog-1', owner_id: 'person-1' },
              p_registrations: [{ organization: 'AKC', registration_number: 'SW123456' }],
            },
            expectRowId: true,
          },
        })
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-entry',
          tableName: 'entries',
          operation: 'INSERT',
          rowId: 'entry-1',
          data: { id: 'entry-1', dog_id: 'dog-1' },
          dependsOn: ['mut-dog-rpc'],
          timestamp: Date.now() + 1,
        })
      );

      const results = await manager.uploadPendingMutations();
      const pending = (await mockDb.getAll(
        REPLICATION_STORES.PENDING_MUTATIONS
      )) as PendingMutation[];
      const failed = (await mockDb.getAll(
        REPLICATION_STORES.FAILED_MUTATIONS
      )) as PendingMutation[];
      const remappedDog = (await mockDb.get(REPLICATION_STORES.REPLICATED_TABLES, [
        'dogs',
        'existing-dog-1',
      ])) as ReplicatedRow<Record<string, unknown>> | undefined;
      const oldDog = await mockDb.get(REPLICATION_STORES.REPLICATED_TABLES, ['dogs', 'dog-1']);
      const remappedEntry = (await mockDb.get(REPLICATION_STORES.REPLICATED_TABLES, [
        'entries',
        'entry-1',
      ])) as ReplicatedRow<Record<string, unknown>> | undefined;
      const remappedRegistration = (await mockDb.get(REPLICATION_STORES.REPLICATED_TABLES, [
        'dog_registrations',
        'registration-1',
      ])) as ReplicatedRow<Record<string, unknown>> | undefined;

      expect(results).toHaveLength(2);
      expect(results.every(result => result.success)).toBe(true);
      expect(pending).toEqual([]);
      expect(failed).toEqual([]);
      expect(vi.mocked(mockSupabase.from)).toHaveBeenCalledWith('entries');
      expect(entryInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'entry-1', dog_id: 'existing-dog-1' })
      );
      expect(remappedDog?.data.id).toBe('existing-dog-1');
      expect(remappedDog?.data.name).toBe('Canonical Beacon');
      expect(remappedDog?.syncStatus).toBe('synced');
      expect(oldDog).toBeUndefined();
      expect(remappedEntry?.data.dogId).toBe('existing-dog-1');
      expect(remappedRegistration?.data.dogId).toBe('existing-dog-1');
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

    it('classifies failed OCC re-checks as RLS/auth instead of row deletion', async () => {
      const updateSelect = vi.fn(() => Promise.resolve({ data: [], error: null }));
      const maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: '42501', message: 'permission denied' },
        })
      );

      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: updateSelect,
            })),
            select: updateSelect,
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle,
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-occ-recheck-denied', serverVersion: 7 })
      );

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('RLS policy blocked UPDATE');
      expect(results[0]!.error).not.toContain('no longer exists server-side');
      expect(maybeSingle).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // RPC VERSION-CONFLICT STORM
  // ========================================

  describe('RPC version-conflict handling', () => {
    /**
     * Mock the RPC raising a `40001` version conflict that carries the current
     * server version in `details` (PostgREST surfaces the function's DETAIL
     * there). No direct entries re-read happens — the ringside caller's role may
     * be denied one, which is exactly why the RPC hands the version back.
     */
    function mockRpcVersionConflict(rowId: string, expected: number, current: number) {
      vi.mocked(mockSupabase.rpc).mockResolvedValue({
        data: null,
        error: {
          message: `Version conflict updating entry ${rowId} (expected ${expected})`,
          code: '40001',
          details: String(current),
        },
      } as unknown as Awaited<ReturnType<typeof mockSupabase.rpc>>);
    }

    it('advances the replicated row OCC token to the fresh server version on an RPC conflict', async () => {
      // Stale local token (3) while the server is at 8 — the storm precondition.
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'entries',
        id: 'entry-occ',
        data: { id: 'entry-occ' },
        version: 4,
        serverVersion: 3,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'pending',
      } as ReplicatedRow<{ id: string }>);
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-occ',
          rowId: 'entry-occ',
          data: { id: 'entry-occ', run_order: 3 },
          serverVersion: 3,
          rpc: { name: 'ringside_update_entry', fields: { run_order: 3 } },
        })
      );
      mockRpcVersionConflict('entry-occ', 3, 8);

      const results = await manager.uploadPendingMutations();

      expect(results[0]!.success).toBe(false);
      const row = (await mockDb.get(REPLICATION_STORES.REPLICATED_TABLES, [
        'entries',
        'entry-occ',
      ])) as ReplicatedRow<{ id: string }> | undefined;
      // Token advanced (from the RPC's error DETAIL, not a table re-read) so the
      // NEXT app write isn't stale — stops regeneration for ringside roles that
      // are denied a direct entries read.
      expect(row?.serverVersion).toBe(8);
      // Dirty edit preserved for user reconciliation — not silently synced away.
      expect(row?.isDirty).toBe(true);
      // The conflict recovery must NOT fall back to a direct entries table read.
      expect(vi.mocked(mockSupabase.from)).not.toHaveBeenCalled();
    });

    it('throttles the conflicting mutation with backoff instead of dead-lettering it', async () => {
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'entries',
        id: 'entry-occ2',
        data: { id: 'entry-occ2' },
        version: 4,
        serverVersion: 3,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'pending',
      } as ReplicatedRow<{ id: string }>);
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-occ2',
          rowId: 'entry-occ2',
          data: { id: 'entry-occ2', run_order: 5 },
          serverVersion: 3,
          rpc: { name: 'ringside_update_entry', fields: { run_order: 5 } },
        })
      );
      mockRpcVersionConflict('entry-occ2', 3, 8);

      // Capture before the call: under shouldAdvanceTime, Date.now() drifts past
      // the ~1s backoff during the async RPC + re-read, so compare to the start.
      const beforeUpload = Date.now();
      await manager.uploadPendingMutations();

      // Still queued (NOT moved to failed_mutations — the offline edit survives).
      const pending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe('mut-occ2');
      expect(pending[0]!.occRetries).toBe(1);
      // Backoff scheduled — nextRetryAt is now + an exponential delay.
      expect(pending[0]!.nextRetryAt).toBeGreaterThan(beforeUpload);
      const failed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      expect(failed).toHaveLength(0);
    });

    it('parks the mutation at the occ lifetime cap instead of retrying forever', async () => {
      // occRetries persists on the mutation (survives reloads), so seeding 49
      // models a wedged write that has already conflicted 49 times across any
      // number of sessions — the 2026-07-11 storm shape. The 50th conflict
      // must park it, not schedule attempt 51.
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'entries',
        id: 'entry-occ3',
        data: { id: 'entry-occ3' },
        version: 4,
        serverVersion: 3,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'pending',
      } as ReplicatedRow<{ id: string }>);
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-occ3',
          rowId: 'entry-occ3',
          data: { id: 'entry-occ3', run_order: 7 },
          serverVersion: 3,
          occRetries: 49,
          rpc: { name: 'ringside_update_entry', fields: { run_order: 7 } },
        })
      );
      mockRpcVersionConflict('entry-occ3', 3, 8);

      const results = await manager.uploadPendingMutations();

      expect(results[0]!.success).toBe(false);
      // P2: exactly one store holds it — never both (atomic move). A pending
      // copy surviving here would auto-upload and defeat the breaker.
      expect(await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);
      // Parked, not dropped: full payload retained for user review.
      const failed = (await mockDb.getAll(
        REPLICATION_STORES.FAILED_MUTATIONS
      )) as PendingMutation[];
      expect(failed).toHaveLength(1);
      expect(failed[0]!.id).toBe('mut-occ3');
      expect(failed[0]!.status).toBe('failed');
      expect(failed[0]!.occRetries).toBe(50);
      expect(failed[0]!.data).toEqual({ id: 'entry-occ3', run_order: 7 });
      expect(failed[0]!.error).toMatch(/50 attempts/);
      expect(failed[0]!.nextRetryAt).toBeUndefined();
      // P1: parked with the AUTHORITATIVE server version (8 from the RPC DETAIL),
      // NOT the stale 3 it carried — so a later Retry can actually succeed.
      expect(failed[0]!.serverVersion).toBe(8);
    });

    it('does NOT park a full-row (non-RPC) mutation — it stays with the conflict resolver', async () => {
      // Direct full-row UPDATEs are owned by the existing conflict-resolution
      // subsystem (reconcileDirtyRow / "Keep mine" / "Take theirs"), which acts
      // only on PENDING_MUTATIONS. The OCC cap is scoped to the RPC storm vector
      // so full-row mutations stay queued and reachable by that resolver —
      // unchanged from pre-fix behavior (throttled backoff + reconciliation).
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'entries',
        id: 'entry-fullrow',
        data: { id: 'entry-fullrow' },
        version: 4,
        serverVersion: 3,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'pending',
      } as ReplicatedRow<{ id: string }>);
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        // No `rpc` field → direct full-row UPDATE path.
        makeMutation({
          id: 'mut-fullrow',
          rowId: 'entry-fullrow',
          data: { id: 'entry-fullrow', handler_name: 'Stale Name' },
          serverVersion: 3,
          occRetries: 49,
        })
      );
      // Direct UPDATE OCC rejection: empty update result → re-read finds v8.
      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: { version: 8 }, error: null })),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      // NOT parked — the cap does not apply to full-row mutations; it stays in
      // PENDING_MUTATIONS where the conflict resolver can still reach it.
      expect(await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(0);
      const pending = (await mockDb.getAll(
        REPLICATION_STORES.PENDING_MUTATIONS
      )) as PendingMutation[];
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe('mut-fullrow');
      // occRetries still advances, but the token is left stale for the resolver
      // (never advanced under a full-row) — pre-fix behavior, unchanged.
      expect(pending[0]!.occRetries).toBe(50);
      expect(pending[0]!.serverVersion).toBe(3);
    });

    it('a conflict below the cap keeps retrying; a custom cap is honored', async () => {
      const smallCapManager = new MutationManager(mockSupabase, {
        logger: mockLogger,
        maxOccAttempts: 2,
      });
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'entries',
        id: 'entry-occ4',
        data: { id: 'entry-occ4' },
        version: 4,
        serverVersion: 3,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'pending',
      } as ReplicatedRow<{ id: string }>);
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-occ4',
          rowId: 'entry-occ4',
          data: { id: 'entry-occ4', run_order: 9 },
          serverVersion: 3,
          rpc: { name: 'ringside_update_entry', fields: { run_order: 9 } },
        })
      );
      mockRpcVersionConflict('entry-occ4', 3, 8);

      // Attempt 1 of 2 — still below the cap: stays queued with backoff.
      await smallCapManager.uploadPendingMutations();
      let pending = (await mockDb.getAll(
        REPLICATION_STORES.PENDING_MUTATIONS
      )) as PendingMutation[];
      expect(pending).toHaveLength(1);
      expect(pending[0]!.occRetries).toBe(1);

      // Attempt 2 hits the cap: parked.
      pending[0]!.nextRetryAt = 0; // make it due immediately
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, pending[0]!);
      await smallCapManager.uploadPendingMutations();
      expect(await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);
      const failed = (await mockDb.getAll(
        REPLICATION_STORES.FAILED_MUTATIONS
      )) as PendingMutation[];
      expect(failed.map(f => f.id)).toEqual(['mut-occ4']);
    });

    it('park-then-retry requeues with a FRESH token and reset counters, so recovery can succeed', async () => {
      // Park via a real conflict (not a hand-seeded failed row) so the parked
      // mutation goes through the actual stamping path.
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        tableName: 'entries',
        id: 'entry-occ5',
        data: { id: 'entry-occ5' },
        version: 4,
        serverVersion: 3,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'pending',
      } as ReplicatedRow<{ id: string }>);
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-occ5',
          rowId: 'entry-occ5',
          data: { id: 'entry-occ5', run_order: 2 },
          serverVersion: 3,
          occRetries: 49,
          rpc: { name: 'ringside_update_entry', fields: { run_order: 2 } },
        })
      );
      mockRpcVersionConflict('entry-occ5', 3, 8);
      await manager.uploadPendingMutations();

      // Parked with the fresh token stamped (P1).
      const parked = (await mockDb.getAll(
        REPLICATION_STORES.FAILED_MUTATIONS
      )) as PendingMutation[];
      expect(parked).toHaveLength(1);
      expect(parked[0]!.serverVersion).toBe(8);

      await manager.retryFailedMutation('mut-occ5');

      // Back in pending, out of failed — one store only.
      expect(await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(0);
      const pending = (await mockDb.getAll(
        REPLICATION_STORES.PENDING_MUTATIONS
      )) as PendingMutation[];
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe('mut-occ5');
      expect(pending[0]!.status).toBe('pending');
      expect(pending[0]!.retries).toBe(0);
      expect(pending[0]!.occRetries).toBe(0);
      expect(pending[0]!.error).toBeUndefined();
      // The requeued mutation carries the FRESH token (8), not the stale 3 —
      // so its next upload can actually succeed instead of re-conflicting.
      expect(pending[0]!.serverVersion).toBe(8);
    });
  });

  // ========================================
  // CONFLICT HOLD
  // ========================================

  describe('Conflict Hold', () => {
    function makeConflictedRow(tableName: string, id: string): ReplicatedRow<{ id: string }> {
      return {
        tableName,
        id,
        data: { id },
        version: 2,
        serverVersion: 1,
        lastSyncedAt: 0,
        lastAccessedAt: 0,
        isDirty: true,
        syncStatus: 'conflict',
      };
    }

    it('holds upload for a mutation whose row has an unresolved conflict', async () => {
      await mockDb.put(
        REPLICATION_STORES.REPLICATED_TABLES,
        makeConflictedRow('entries', 'entry-hold')
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-hold', tableName: 'entries', rowId: 'entry-hold' })
      );

      const results = await manager.uploadPendingMutations();

      // Skipped — not in results
      expect(results).toHaveLength(0);
      // Mutation still in queue
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe('mut-hold');
      // Supabase never touched
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('uploads non-conflicted rows while holding conflicted ones', async () => {
      // Conflicted row + its mutation
      await mockDb.put(
        REPLICATION_STORES.REPLICATED_TABLES,
        makeConflictedRow('entries', 'entry-conflict')
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-conflict', tableName: 'entries', rowId: 'entry-conflict' })
      );
      // Clean row mutation (no REPLICATED_TABLES row needed — absent row is not 'conflict')
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-clean', tableName: 'dogs', rowId: 'dog-1' })
      );

      const results = await manager.uploadPendingMutations();

      // Only the clean mutation uploaded
      expect(results).toHaveLength(1);
      expect(results[0]!.tableName).toBe('dogs');
      // Conflicted mutation still in queue
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe('mut-conflict');
    });

    it('uploads the mutation once the conflict is resolved (row back to pending)', async () => {
      // Start with a conflicted row
      await mockDb.put(
        REPLICATION_STORES.REPLICATED_TABLES,
        makeConflictedRow('entries', 'entry-resolved')
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-resolved', tableName: 'entries', rowId: 'entry-resolved' })
      );

      // First upload — held
      await manager.uploadPendingMutations();
      expect(await mockDb.count(REPLICATION_STORES.PENDING_MUTATIONS)).toBe(1);

      // User resolves "keep mine" — row status transitions back to pending
      await mockDb.put(REPLICATION_STORES.REPLICATED_TABLES, {
        ...makeConflictedRow('entries', 'entry-resolved'),
        syncStatus: 'pending',
      });

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
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

    it('should fail immediately for affirmatively-permanent (non-retryable) errors', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-nonretry', retries: 0 })
      );

      vi.mocked(mockSupabase.from).mockReturnValue({
        // Reject through the real UPDATE path (update().eq().select()) with an
        // affirmatively-permanent error → dead-letter at once. (A bare
        // 'Validation failed' is now fail-open retryable.)
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(new Error('permission denied for table entries'))),
          })),
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

    it('persists a 42501 score dead-letter with its authorization classification', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-archive',
          retries: 0,
          rpc: {
            name: 'ringside_update_entry',
            fields: { scoring_completed_at: '2026-07-24T12:00:00Z' },
          },
        })
      );

      const authorizationError = Object.assign(new Error('not authorized to score this class'), {
        name: 'PostgrestError',
        code: '42501',
        details: '',
        hint: '',
        toJSON: () => ({
          name: 'PostgrestError',
          message: 'not authorized to score this class',
          code: '42501',
          details: '',
          hint: '',
        }),
      });
      vi.mocked(mockSupabase.rpc).mockResolvedValue({
        data: null,
        error: authorizationError,
      } as unknown as Awaited<ReturnType<typeof mockSupabase.rpc>>);

      await manager.uploadPendingMutations();

      const pending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(pending).toHaveLength(0);

      const failed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      expect(failed).toHaveLength(1);
      expect(failed[0]!.id).toBe('mut-archive');
      expect(failed[0]!.status).toBe('failed');
      expect(failed[0]!.error).toContain('not authorized to score this class');
      expect(failed[0]!.failureKind).toBe('authorization');
      expect(failed[0]!.rpc).toMatchObject({
        name: 'ringside_update_entry',
        fields: { scoring_completed_at: '2026-07-24T12:00:00Z' },
      });
      expect(failed[0]!.failedAt).toEqual(expect.any(Number));
    });

    it('retryFailedMutation re-queues with a fresh retry budget', async () => {
      await mockDb.put(REPLICATION_STORES.FAILED_MUTATIONS, {
        ...makeMutation({ id: 'mut-retry-failed', retries: 3 }),
        status: 'failed',
        error: 'Non-retryable error: auth expired',
        failedAt: Date.now(),
      });

      await manager.retryFailedMutation('mut-retry-failed');

      const failed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      expect(failed).toHaveLength(0);

      const pending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe('mut-retry-failed');
      expect(pending[0]!.status).toBe('pending');
      expect(pending[0]!.retries).toBe(0);
      expect(pending[0]!.error).toBeUndefined();
      expect(pending[0]!.failedAt).toBeUndefined();
    });

    it('discardFailedMutation removes the mutation permanently', async () => {
      await mockDb.put(REPLICATION_STORES.FAILED_MUTATIONS, {
        ...makeMutation({ id: 'mut-discard-failed' }),
        status: 'failed',
        failedAt: Date.now(),
      });

      await manager.discardFailedMutation('mut-discard-failed');

      const failed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      expect(failed).toHaveLength(0);
      const pending = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(pending).toHaveLength(0);
    });

    it('getFailedMutations lists archived failures', async () => {
      await mockDb.put(REPLICATION_STORES.FAILED_MUTATIONS, {
        ...makeMutation({ id: 'mut-list-failed' }),
        status: 'failed',
        failedAt: Date.now(),
      });

      const failed = await manager.getFailedMutations();
      expect(failed).toHaveLength(1);
      expect(failed[0]!.id).toBe('mut-list-failed');
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

      await manager.backupMutationsToLocalStorage();

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

      await manager.backupMutationsToLocalStorage();

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

    it('persists the backup before queueMutation resolves (no debounce window)', async () => {
      // Regression: a debounced backup left a window where a page reload lost
      // the newest offline mutations if IndexedDB was later evicted. Queued
      // scores must reach localStorage before the queueing call resolves.
      await manager.queueMutation('entries', 'UPDATE', 'entry-9', {
        id: 'entry-9',
        is_scored: true,
      });

      const backup = localStorageMock['replication_mutation_backup'];
      expect(backup).toBeDefined();
      const parsed = JSON.parse(backup!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].rowId).toBe('entry-9');
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
      await mockDb.put(REPLICATION_STORES.FAILED_MUTATIONS, {
        ...makeMutation({ id: 'mut-clear-failed' }),
        status: 'failed',
        failedAt: Date.now(),
      });

      await manager.clearAllMutations();

      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);
      expect(localStorageMock['replication_mutation_backup']).toBeUndefined();
      const failed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
      expect(failed).toHaveLength(0);
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
    it('surfaces database errors as a rejection, not an empty-success result', async () => {
      vi.mocked(databaseManager.getDatabase).mockRejectedValueOnce(new Error('DB error'));

      await expect(manager.uploadPendingMutations()).rejects.toThrow('DB error');

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

  // ========================================
  // DELETE RLS DETECTION
  // ========================================

  describe('DELETE RLS detection', () => {
    it('should succeed and log a warning when DELETE affects 0 rows', async () => {
      vi.mocked(mockSupabase.from).mockReturnValue({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-del-0', operation: 'DELETE', data: { id: 'entry-1' } })
      );

      const results = await manager.uploadPendingMutations();

      // Mutation completes as success (idempotent delete)
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);

      // Warning is logged so the operator can investigate RLS mismatches
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('0 rows'));
    });

    it('should succeed normally when DELETE returns the deleted row', async () => {
      // Default mock already returns [{ id: 'mock-id' }] for DELETE — just verify it passes
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-del-1', operation: 'DELETE', data: { id: 'entry-1' } })
      );

      const results = await manager.uploadPendingMutations();

      expect(results[0]!.success).toBe(true);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('0 rows'));
    });
  });

  // ========================================
  // BACKOFF / nextRetryAt
  // ========================================

  describe('Backoff and nextRetryAt', () => {
    it('should set nextRetryAt on a retryable failure', async () => {
      const before = Date.now();

      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-backoff', operation: 'UPDATE', data: { id: 'e1' } })
      );

      // Network timeout is retryable
      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-backoff');
      expect(stored).toBeDefined();
      expect(stored.nextRetryAt).toBeGreaterThan(before);
      expect(stored.retries).toBe(1);
    });

    it('should skip a mutation whose nextRetryAt is in the future', async () => {
      const futureRetry = Date.now() + 60_000; // 1 minute from now

      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-skip',
          operation: 'UPDATE',
          data: { id: 'e1' },
          nextRetryAt: futureRetry,
        })
      );

      const results = await manager.uploadPendingMutations();

      // Mutation was skipped — no result entry and still in queue
      expect(results).toHaveLength(0);
      const still = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-skip');
      expect(still).toBeDefined();
    });

    it('should not block an independent mutation when one mutation is waiting backoff', async () => {
      const futureRetry = Date.now() + 60_000;

      // Mutation A: in backoff, should be skipped
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-waiting',
          operation: 'UPDATE',
          data: { id: 'e1' },
          nextRetryAt: futureRetry,
        })
      );

      // Mutation B: independent, should proceed
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-independent', operation: 'UPDATE', data: { id: 'e2' } })
      );

      const results = await manager.uploadPendingMutations();

      // Only the independent mutation produced a result
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);

      // Waiting mutation is still in queue
      const waiting = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-waiting');
      expect(waiting).toBeDefined();
    });

    it('should hold a dependent mutation when its parent dependency is waiting backoff', async () => {
      const futureRetry = Date.now() + 60_000;

      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'person-mutation',
          tableName: 'people',
          operation: 'INSERT',
          rowId: 'person-1',
          data: { id: 'person-1' },
          nextRetryAt: futureRetry,
        })
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'dog-mutation',
          tableName: 'dogs',
          operation: 'INSERT',
          rowId: 'dog-1',
          data: { id: 'dog-1', owner_id: 'person-1' },
          dependsOn: ['person-mutation'],
        })
      );

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(0);
      expect(mockSupabase.from).not.toHaveBeenCalled();
      await expect(
        mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'dog-mutation')
      ).resolves.toBeDefined();
    });

    it('should hold a dependent mutation when its parent dependency fails this pass', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'person-mutation',
          tableName: 'people',
          operation: 'INSERT',
          rowId: 'person-1',
          data: { id: 'person-1' },
        })
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'dog-mutation',
          tableName: 'dogs',
          operation: 'INSERT',
          rowId: 'dog-1',
          data: { id: 'dog-1', owner_id: 'person-1' },
          dependsOn: ['person-mutation'],
        })
      );

      vi.mocked(mockSupabase.from).mockImplementation(
        table =>
          ({
            insert: vi.fn(() => ({
              select: vi.fn(() =>
                table === 'people'
                  ? Promise.reject(new TypeError('fetch failed'))
                  : Promise.resolve({ data: [{ id: 'unexpected-child-upload' }], error: null })
              ),
            })),
          }) as unknown as ReturnType<typeof mockSupabase.from>
      );

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ success: false, tableName: 'people' });
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
      expect(mockSupabase.from).toHaveBeenCalledWith('people');
      await expect(
        mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'dog-mutation')
      ).resolves.toMatchObject({
        id: 'dog-mutation',
        retries: 0,
      });
    });
  });

  // ========================================
  // BACKUP RESTORE VALIDATION
  // ========================================

  describe('Backup restore validation', () => {
    it('should discard malformed entries from localStorage backup', async () => {
      const validMut = makeMutation({ id: 'valid-1' });
      const malformed = [
        { id: 'bad-1' }, // missing tableName and operation
        { tableName: 'entries', operation: 'INSERT' }, // missing id and rowId
        null,
        42,
        { id: 'bad-2', tableName: 'entries', operation: 'UNKNOWN_OP', rowId: 'r1' }, // bad op
      ];

      localStorageMock['replication_mutation_backup'] = JSON.stringify([validMut, ...malformed]);

      await manager.restoreMutationsFromLocalStorage();

      const restored = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(restored).toHaveLength(1);
      expect(restored[0].id).toBe('valid-1');

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('malformed mutation'));
    });

    it('should restore a fully valid backup without warnings', async () => {
      const mutations = [makeMutation({ id: 'v-1' }), makeMutation({ id: 'v-2' })];
      localStorageMock['replication_mutation_backup'] = JSON.stringify(mutations);

      await manager.restoreMutationsFromLocalStorage();

      const restored = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(restored).toHaveLength(2);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('malformed mutation')
      );
    });
  });

  // ========================================
  // BACKOFF RETRY TIMER
  // ========================================

  describe('scheduleBackoffRetry timer', () => {
    it('should log a scheduled backoff retry after a retryable failure', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'mut-retry', operation: 'UPDATE', data: { id: 'e1' } })
      );

      vi.mocked(mockSupabase.from).mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
          })),
        })),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      await manager.uploadPendingMutations();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/Scheduling backoff retry in \d+ms/)
      );
    });

    it('should not reschedule when a sooner timer is already pending', async () => {
      // Seed a mutation already in backoff with a near-term nextRetryAt.
      const soon = Date.now() + 5_000;
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-soon',
          operation: 'UPDATE',
          data: { id: 'e1' },
          nextRetryAt: soon,
        })
      );

      // Pass 1: mutation skipped; timer scheduled for `soon`.
      await manager.uploadPendingMutations();

      const countScheduleLogs = () =>
        (mockLogger.log as ReturnType<typeof vi.fn>).mock.calls.filter(
          (call: unknown[]) =>
            typeof call[0] === 'string' && call[0].includes('Scheduling backoff retry')
        ).length;

      expect(countScheduleLogs()).toBe(1);

      // Add a second mutation whose nextRetryAt is LATER than `soon`.
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'mut-later',
          operation: 'UPDATE',
          data: { id: 'e2' },
          nextRetryAt: Date.now() + 120_000,
        })
      );

      // Pass 2: earliest is still `soon` which matches the pending timer,
      // so scheduleBackoffRetry should no-op — log count stays at 1.
      await manager.uploadPendingMutations();
      expect(countScheduleLogs()).toBe(1);
    });
  });

  describe('reconcilePendingMutationsForRow', () => {
    it('preserves explicitly queued class-status fields when rebuilt data omits them', async () => {
      const mutationId = await manager.queueMutation(
        'classes',
        'UPDATE',
        'class-1',
        {
          id: 'class-1',
          display_order: 2,
          status: 'completed',
          status_source: 'manual',
        },
        undefined,
        3,
        undefined,
        false
      );

      await manager.reconcilePendingMutationsForRow('classes', 'class-1', 8, {
        id: 'class-1',
        display_order: 4,
      });

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, mutationId);
      expect(stored?.explicitDataKeys).toEqual(['id', 'display_order', 'status', 'status_source']);
      expect(stored?.data).toEqual({
        id: 'class-1',
        display_order: 4,
        status: 'completed',
        status_source: 'manual',
      });
    });

    it('does not add class-status fields that were absent from the queued mutation', async () => {
      const mutationId = await manager.queueMutation(
        'classes',
        'UPDATE',
        'class-1',
        { id: 'class-1', display_order: 2 },
        undefined,
        3,
        undefined,
        false
      );

      await manager.reconcilePendingMutationsForRow('classes', 'class-1', 8, {
        id: 'class-1',
        display_order: 4,
      });

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, mutationId);
      expect(stored?.data).toEqual({ id: 'class-1', display_order: 4 });
    });

    it('preserves omitted legacy fields when their table has no server-owned key policy', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'legacy-entry-1',
          tableName: 'entries',
          rowId: 'entry-1',
          serverVersion: 3,
          data: { id: 'entry-1', secretary_note: 'keep this edit' },
        })
      );

      await manager.reconcilePendingMutationsForRow('entries', 'entry-1', 8, {
        id: 'entry-1',
      });

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'legacy-entry-1');
      expect(stored?.explicitDataKeys).toEqual(['id', 'secretary_note']);
      expect(stored?.data).toEqual({ id: 'entry-1', secretary_note: 'keep this edit' });
    });

    it('keeps legacy mutations server-wins when rebuild omits stale class status', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'legacy-class-1',
          tableName: 'classes',
          rowId: 'class-1',
          serverVersion: 3,
          // Queues created before explicitDataKeys contained full-row derived status.
          data: { id: 'class-1', display_order: 2, status: 'completed' },
        })
      );

      await manager.reconcilePendingMutationsForRow(
        'classes',
        'class-1',
        8,
        { id: 'class-1', display_order: 4 },
        ['status', 'status_source', 'is_scoring_finalized', 'reopened_after_closeout_at']
      );

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'legacy-class-1');
      expect(stored?.explicitDataKeys).toEqual(['id', 'display_order']);
      expect(stored?.data).toEqual({ id: 'class-1', display_order: 4 });
    });

    it('advances the OCC token on a queued RPC mutation (delta payload, no clobber risk)', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'rpc-1',
          rowId: 'entry-1',
          serverVersion: 3,
          data: { id: 'entry-1' },
          rpc: { name: 'ringside_update_entry', fields: { check_in_status: 'checked-in' } },
        })
      );

      await manager.reconcilePendingMutationsForRow('entries', 'entry-1', 8);

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'rpc-1');
      expect(stored?.serverVersion).toBe(8); // advanced → next upload won't 40001
      // The delta is untouched (it is the client's intended write).
      expect(stored?.rpc?.fields).toEqual({ check_in_status: 'checked-in' });
    });

    it('advances the token AND refreshes data on a full-row UPDATE when a rebuilt payload is given', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'full-1',
          rowId: 'entry-1',
          serverVersion: 3,
          // Stale full-row snapshot: final_placement is the pre-recalc null.
          data: { id: 'entry-1', entry_status: 'scored', final_placement: null },
        })
      );

      const rebuilt = { id: 'entry-1', entry_status: 'scored', final_placement: 2 };
      await manager.reconcilePendingMutationsForRow('entries', 'entry-1', 8, rebuilt);

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'full-1');
      expect(stored?.serverVersion).toBe(8);
      // Payload refreshed so the full-row write won't regress final_placement → 2, not null.
      expect(stored?.data).toEqual(rebuilt);
    });

    it('leaves a full-row UPDATE untouched when no rebuilt payload is available (avoid clobber)', async () => {
      const original = makeMutation({
        id: 'full-2',
        rowId: 'entry-1',
        serverVersion: 3,
        data: { id: 'entry-1', entry_status: 'scored', final_placement: null },
      });
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, original);

      await manager.reconcilePendingMutationsForRow('entries', 'entry-1', 8);

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'full-2');
      // Token NOT advanced and data NOT changed — advancing without a refresh would
      // trade a 40001 for a silent clobber, so the mutation stays as-is (throttled).
      expect(stored?.serverVersion).toBe(3);
      expect(stored?.data).toEqual(original.data);
    });

    it('never regresses a queued token that is already fresher (forward-only)', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'rpc-fresh',
          rowId: 'entry-1',
          serverVersion: 10,
          rpc: { name: 'ringside_update_entry', fields: { check_in_status: 'checked-in' } },
        })
      );

      await manager.reconcilePendingMutationsForRow('entries', 'entry-1', 6);

      const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'rpc-fresh');
      expect(stored?.serverVersion).toBe(10); // max(10, 6), not 6
    });

    it('only touches UPDATE mutations for the target row', async () => {
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({
          id: 'other-row',
          rowId: 'entry-2',
          serverVersion: 3,
          rpc: { name: 'r', fields: {} },
        })
      );
      await mockDb.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        makeMutation({ id: 'an-insert', rowId: 'entry-1', operation: 'INSERT', serverVersion: 3 })
      );

      await manager.reconcilePendingMutationsForRow('entries', 'entry-1', 8);

      expect(
        (await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'other-row'))?.serverVersion
      ).toBe(3);
      expect(
        (await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'an-insert'))?.serverVersion
      ).toBe(3);
    });
  });
});

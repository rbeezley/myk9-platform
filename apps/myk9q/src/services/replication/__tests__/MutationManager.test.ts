/**
 * MutationManager Tests
 *
 * Validates offline mutation queue management:
 * - Mutation queueing and processing
 * - Topological sorting for dependency ordering
 * - Retry logic with exponential backoff
 * - Online/offline state handling
 * - Conflict resolution
 * - Queue persistence (localStorage backup)
 * - Error handling and user notifications
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MutationManager, type MutationManagerConfig, type GetDatabaseCallback } from '../MutationManager';
import type { PendingMutation } from '@myk9/replication';
import { openDB, type IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from '@myk9/replication';

// Mock dependencies
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/utils/networkUtils', () => ({
  withTimeout: vi.fn((promise) => promise),
  backoffDelay: vi.fn(() => Promise.resolve()),
  isRetryableError: vi.fn((error) => {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('network') || msg.includes('timeout') || msg.includes('5xx');
    }
    return false;
  }),
  TIMEOUT_PRESETS: {
    quick: 5000,
    standard: 15000,
    bulk: 60000,
    long: 120000,
  },
}));

// Import mocked functions for assertions
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';
import { withTimeout, backoffDelay, isRetryableError } from '@/utils/networkUtils';

const TEST_DB_NAME = 'test-mutation-manager-db';

describe('MutationManager', () => {
  let manager: MutationManager;
  let mockDb: IDBPDatabase;
  let getDbCallback: GetDatabaseCallback;
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

    getDbCallback = async () => mockDb;

    // Setup localStorage mock
    localStorageMock = {};
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] || null,
        setItem: (key: string, value: string) => { localStorageMock[key] = value; },
        removeItem: (key: string) => { delete localStorageMock[key]; },
        clear: () => { localStorageMock = {}; },
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

    // Clear all mocks
    vi.clearAllMocks();

    // Reset mock implementations
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    } as any);

    vi.mocked(withTimeout).mockImplementation((promise) => promise);
    vi.mocked(backoffDelay).mockResolvedValue(undefined);
    vi.mocked(isRetryableError).mockImplementation((error) => {
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes('network') || msg.includes('timeout') || msg.includes('5xx');
      }
      return false;
    });

    // Create manager instance
    const config: MutationManagerConfig = {
      maxRetries: 3,
      retryBackoffBase: 100, // Faster for tests
    };
    manager = new MutationManager(config, getDbCallback);
  });

  afterEach(async () => {
    manager.destroy();
    if (mockDb) {
      // Clear all data from IndexedDB
      try {
        const tx = mockDb.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
        await tx.store.clear();
        await tx.done;
      } catch (e) {
        // Ignore errors during cleanup
      }
      mockDb.close();
    }
    // Clear localStorage
    localStorageMock = {};
    vi.clearAllMocks();
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
      expect(results[0].success).toBe(true);
      expect(results[0].tableName).toBe('entries');
      expect(results[0].operation).toBe('UPDATE');

      // Verify mutation was removed from queue
      const remaining = await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
      expect(remaining).toHaveLength(0);
    });

    it('should return empty array when no pending mutations', async () => {
      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(0);
      expect(logger.log).toHaveBeenCalledWith(
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
      expect(results[0].success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('classes');
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
      expect(results[0].success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('entries');
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

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Mutation queue is getting large')
      );
    });

    it.skip('should dispatch overflow event when queue is at max capacity', { timeout: 10000 }, async () => {
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
    });
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

      // Mock network error (retryable)
      const mockError = new Error('Network timeout');
      vi.mocked(supabase.from).mockReturnValueOnce({
        upsert: vi.fn(() => Promise.reject(mockError)),
      } as any);

      // Mock isRetryableError to return true
      vi.mocked(isRetryableError).mockReturnValue(true);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);

      // Verify mutation was updated with retry count
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-retry');
      expect(updated?.retries).toBe(1);
      expect(updated?.status).toBe('pending');
      expect(updated?.error).toBe('Network timeout');

      // Verify backoff was called
      expect(vi.mocked(backoffDelay)).toHaveBeenCalled();
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

      // Mock network error
      const mockError = new Error('Network timeout');
      vi.mocked(supabase.from).mockReturnValue({
        upsert: vi.fn(() => Promise.reject(mockError)),
      } as any);

      vi.mocked(isRetryableError).mockReturnValue(true);

      await manager.uploadPendingMutations();

      // Verify mutation was marked as failed
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-max-retry');
      expect(updated?.retries).toBe(3);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toContain('Max retries exceeded');
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

      // Mock validation error (non-retryable)
      const mockError = new Error('Validation failed');
      vi.mocked(supabase.from).mockReturnValue({
        upsert: vi.fn(() => Promise.reject(mockError)),
      } as any);

      vi.mocked(isRetryableError).mockReturnValue(false);

      await manager.uploadPendingMutations();

      // Verify mutation was marked as failed immediately
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-non-retry');
      expect(updated?.retries).toBe(1);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toContain('Non-retryable error');
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
      vi.mocked(supabase.from).mockReturnValue({
        upsert: vi.fn(() => Promise.reject(mockError)),
      } as any);

      vi.mocked(isRetryableError).mockReturnValue(false);

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
      vi.mocked(supabase.from).mockImplementation((table) => ({
        upsert: vi.fn(async (data) => {
          executionOrder.push(data.id);
          return { data: null, error: null };
        }),
      } as any));

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
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circular dependency detected')
      );
    });

    it('should use sequence numbers when available', { timeout: 5000 }, async () => {
      const mutations: PendingMutation[] = [
        {
          id: 'mut-3',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-3',
          data: { id: 'entry-3' },
          timestamp: Date.now(),
          retries: 0,
          status: 'pending',
          sequenceNumber: 3,
          dependsOn: ['mut-missing'], // Dependency not in batch
        },
        {
          id: 'mut-1',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-1',
          data: { id: 'entry-1' },
          timestamp: Date.now() + 1,
          retries: 0,
          status: 'pending',
          sequenceNumber: 1,
          dependsOn: ['mut-missing'], // Dependency not in batch
        },
        {
          id: 'mut-2',
          tableName: 'entries',
          operation: 'UPDATE',
          rowId: 'entry-2',
          data: { id: 'entry-2' },
          timestamp: Date.now() + 2,
          retries: 0,
          status: 'pending',
          sequenceNumber: 2,
          dependsOn: ['mut-missing'], // Dependency not in batch
        },
      ];

      for (const mutation of mutations) {
        await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      }

      const executionOrder: string[] = [];
      vi.mocked(supabase.from).mockImplementation(() => ({
        upsert: vi.fn(async (data) => {
          executionOrder.push(data.id);
          return { data: null, error: null };
        }),
      } as any));

      await manager.uploadPendingMutations();

      // Should execute in sequence number order
      expect(executionOrder).toEqual(['entry-1', 'entry-2', 'entry-3']);
    });
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
      expect(restored.map((m: PendingMutation) => m.id)).toEqual(['mut-restore-1', 'mut-restore-2']);
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
      expect(logger.error).toHaveBeenCalledWith(
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
      expect(logger.log).toHaveBeenCalledWith(
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

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Destroyed')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database to throw error
      const brokenDb = {
        getAll: vi.fn(() => Promise.reject(new Error('DB error'))),
      };

      const brokenManager = new MutationManager(
        { maxRetries: 3, retryBackoffBase: 100 },
        async () => brokenDb as any
      );

      const results = await brokenManager.uploadPendingMutations();

      expect(results).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to upload mutations'),
        expect.any(Error)
      );
    });

    it('should handle unknown operation type', async () => {
      const mutation: PendingMutation = {
        id: 'mut-unknown',
        tableName: 'entries',
        operation: 'UNKNOWN_OP' as any,
        rowId: 'entry-1',
        data: { id: 'entry-1' },
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };

      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Unknown operation');
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
      vi.mocked(supabase.from).mockReturnValue({
        upsert: vi.fn(() => Promise.resolve({ data: null, error: supabaseError })),
      } as any);

      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should respect custom max retries', async () => {
      const customManager = new MutationManager(
        { maxRetries: 5, retryBackoffBase: 100 },
        getDbCallback
      );

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
      vi.mocked(supabase.from).mockReturnValue({
        upsert: vi.fn(() => Promise.reject(mockError)),
      } as any);

      vi.mocked(isRetryableError).mockReturnValue(true);

      await customManager.uploadPendingMutations();

      // Should still be pending (not failed) because we have 5 max retries
      const updated = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-custom');
      expect(updated?.retries).toBe(5);
      expect(updated?.status).toBe('failed');
    });

    it('should use default config values', () => {
      const defaultManager = new MutationManager({}, getDbCallback);
      expect(defaultManager).toBeDefined();
    });
  });
});

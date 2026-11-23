/**
 * MYK9-2345: every upload the runner starts on its own (backoff retry,
 * follow-up pass) must go through MutationManager.uploadPendingMutations(), so
 * a restore can never race an active upload, and a permanently failed mutation
 * must move to the failed store atomically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { MutationManager } from './MutationManager';
import { MutationBackupStore } from './MutationBackupStore';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { moveMutationToFailed } from './mutation-failed-move';
import type { PendingMutation } from './types';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

const TEST_DB_NAME = 'test-mutation-manager-upload-coordination-db';
const AUTH_USER_ID = 'test-user';

function makeMutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: 'mut-coordination-1',
    authUserId: AUTH_USER_ID,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-1',
    data: { id: 'entry-1', is_scored: true },
    timestamp: Date.now() - 5_000,
    retries: 0,
    status: 'pending',
    rpc: { name: 'ringside_update_entry', fields: { is_scored: true } },
    ...overrides,
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  expect(condition()).toBe(true);
}

describe('MutationManager upload coordination (MYK9-2345)', () => {
  let mockDb: IDBPDatabase;

  beforeEach(async () => {
    mockDb = await createMutationManagerTestDb(TEST_DB_NAME);
    await mockDb.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await mockDb.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);

    let stored: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => stored[key] || null,
        setItem: (key: string, value: string) => {
          stored[key] = value;
        },
        removeItem: (key: string) => {
          delete stored[key];
        },
        clear: () => {
          stored = {};
        },
        length: 0,
        key: () => null,
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent: vi.fn() },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    mockDb.close();
    vi.restoreAllMocks();
  });

  function createManager(rpc: ReturnType<typeof vi.fn>): MutationManager {
    const client = { from: vi.fn(), rpc } as unknown as SupabaseClient;
    return new MutationManager(client, {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => ({ authUserId: AUTH_USER_ID, supabaseClient: client }),
    });
  }

  it('a restore waits for a backoff-retry upload instead of racing it', async () => {
    await mockDb.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      makeMutation({ nextRetryAt: Date.now() + 60 })
    );

    let releaseRpc!: () => void;
    const rpcGate = new Promise<void>(resolve => {
      releaseRpc = resolve;
    });
    const rpc = vi.fn(async () => {
      await rpcGate;
      return { data: 8, error: null };
    });
    const restoreSpy = vi.spyOn(MutationBackupStore.prototype, 'restore');

    const manager = createManager(rpc);
    try {
      // First pass skips the mutation (backoff) and self-schedules the retry.
      await manager.uploadPendingMutations();
      expect(rpc).not.toHaveBeenCalled();

      // The backoff timer fires and the retry is now in flight.
      await waitFor(() => rpc.mock.calls.length === 1);

      const restore = manager.restoreMutationsFromLocalStorage();
      await new Promise(resolve => setTimeout(resolve, 30));
      // Restore must not read the backup while the retry is still uploading.
      expect(restoreSpy).not.toHaveBeenCalled();

      releaseRpc();
      await restore;
      expect(restoreSpy).toHaveBeenCalledTimes(1);
      await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(0);
    } finally {
      manager.destroy();
    }
  });

  it('a backoff retry waits for an in-flight restore before uploading', async () => {
    await mockDb.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      makeMutation({ nextRetryAt: Date.now() + 60 })
    );

    let releaseRestore!: () => void;
    const restoreGate = new Promise<void>(resolve => {
      releaseRestore = resolve;
    });
    const restoreSpy = vi
      .spyOn(MutationBackupStore.prototype, 'restore')
      .mockImplementation(() => restoreGate);
    const rpc = vi.fn(async () => ({ data: 8, error: null }));

    const manager = createManager(rpc);
    try {
      await manager.uploadPendingMutations();
      const restore = manager.restoreMutationsFromLocalStorage();
      await waitFor(() => restoreSpy.mock.calls.length === 1);

      // Well past the backoff time: the retry must still be parked behind restore.
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(rpc).not.toHaveBeenCalled();

      releaseRestore();
      await restore;
      // The parked retry resumes on its own once the restore settles.
      await waitFor(() => rpc.mock.calls.length === 1);
    } finally {
      manager.destroy();
    }
  });

  describe('permanent failure move', () => {
    it('moves a permanently failed mutation to the failed store and clears pending', async () => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { code: '42501', message: 'permission denied', details: '', hint: '' },
      }));
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation());
      const transactionSpy = vi.spyOn(mockDb, 'transaction');
      const putSpy = vi.spyOn(mockDb, 'put');
      const deleteSpy = vi.spyOn(mockDb, 'delete');

      const manager = createManager(rpc);
      try {
        await manager.uploadPendingMutations();
        await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(0);
        await expect(mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).resolves.toHaveLength(1);

        // One transaction over both stores, never two standalone writes.
        expect(transactionSpy).toHaveBeenCalledWith(
          [REPLICATION_STORES.FAILED_MUTATIONS, REPLICATION_STORES.PENDING_MUTATIONS],
          'readwrite'
        );
        expect(putSpy).not.toHaveBeenCalledWith(
          REPLICATION_STORES.FAILED_MUTATIONS,
          expect.anything()
        );
        expect(deleteSpy).not.toHaveBeenCalledWith(
          REPLICATION_STORES.PENDING_MUTATIONS,
          expect.anything()
        );
      } finally {
        manager.destroy();
      }
    });

    it('a failed write inside the move leaves the mutation in pending only', async () => {
      const mutation = makeMutation();
      await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);

      // A record IndexedDB cannot clone makes the failed-store write throw; the
      // pending row must not be deleted on its own.
      const unwritable = { ...mutation, data: { id: 'entry-1', bad: () => 1 } };
      await expect(moveMutationToFailed(mockDb, unwritable)).rejects.toBeDefined();

      await expect(mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).resolves.toEqual([]);
      await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(1);
    });
  });
});

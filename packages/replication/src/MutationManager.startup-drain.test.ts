import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { MutationManager, type MutationManagerOptions } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import type { PendingMutation } from './types';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

const TEST_DB_NAME = 'test-mutation-manager-startup-drain-db';
const BACKUP_KEY = 'replication_mutation_backup';

/**
 * Mock supabase client supporting the full UPDATE chain used by
 * executeMutation, including the OCC precondition variant:
 *   from(t).update(data).eq('id', x)[.eq('version', v)].select('id, version')
 */
function createMockSupabaseClient() {
  const select = vi.fn(() => Promise.resolve({ data: [{ id: 'row-1', version: 8 }], error: null }));
  const rpc = vi.fn(() => Promise.resolve({ data: 8, error: null }));
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.select = select;
  const mockClient = {
    from: vi.fn(() => ({
      update: vi.fn(() => chain),
    })),
    rpc,
  };
  return { client: mockClient as unknown as SupabaseClient, select, rpc };
}

function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Shape of a real reload-restored entries UPDATE (the MYK9-47 undo repro):
 * status 'pending', retries 0, no nextRetryAt, OCC serverVersion captured at
 * queue time, sequenceNumber assigned.
 */
function makeRestoredMutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: 'mut-undo-1',
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-1',
    data: { id: 'entry-1', entry_status: 'pending' },
    timestamp: Date.now() - 5_000,
    retries: 0,
    status: 'pending',
    serverVersion: 7,
    sequenceNumber: 3,
    ...overrides,
  };
}

describe('MutationManager startup drain (reload-restored queue)', () => {
  let mockDb: IDBPDatabase;
  let localStorageMock: Record<string, string>;
  let logger: Logger;

  function createManager(supabase: SupabaseClient): MutationManager {
    const options: MutationManagerOptions = {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger,
    };
    return new MutationManager(supabase, options);
  }

  beforeEach(async () => {
    mockDb = await createMutationManagerTestDb(TEST_DB_NAME);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);
    logger = createMockLogger();

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

  it('drains a mutation already durable in IndexedDB when a fresh manager boots (no restore step)', async () => {
    // Simulates the reload case: the queue row survived in IDB; nothing was in
    // flight; a brand-new MutationManager (new page load) must upload it.
    await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeRestoredMutation());

    const { client, select } = createMockSupabaseClient();
    const manager = createManager(client);
    try {
      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(select).toHaveBeenCalledTimes(1);
      await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(0);
    } finally {
      manager.destroy();
    }
  });

  it('serializes upload behind an in-flight restore so restore cannot resurrect a completed row', async () => {
    const mutation = makeRestoredMutation({
      rpc: { name: 'ringside_update_entry', fields: { is_scored: true } },
    });
    localStorageMock[BACKUP_KEY] = JSON.stringify([mutation]);

    let releaseRestorePut!: () => void;
    const restorePutGate = new Promise<void>(resolve => {
      releaseRestorePut = resolve;
    });
    let restorePutEntered!: () => void;
    const restorePutStarted = new Promise<void>(resolve => {
      restorePutEntered = resolve;
    });
    const originalPut = mockDb.put.bind(mockDb);
    const putSpy = vi.spyOn(mockDb, 'put');
    putSpy.mockImplementation(async (...args) => {
      const [storeName, value] = args as [string, PendingMutation];
      if (storeName === REPLICATION_STORES.PENDING_MUTATIONS && value.id === mutation.id) {
        restorePutEntered();
        await restorePutGate;
      }
      return originalPut(...args);
    });

    const { client, rpc } = createMockSupabaseClient();
    const manager = createManager(client);
    try {
      const restorePromise = manager.restoreMutationsFromLocalStorage();
      await restorePutStarted;

      const uploadPromise = manager.uploadPendingMutations();
      await Promise.resolve();
      expect(rpc).not.toHaveBeenCalled();

      releaseRestorePut();
      await restorePromise;
      const results = await uploadPromise;

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(rpc).toHaveBeenCalledTimes(1);
      await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(0);
    } finally {
      manager.destroy();
    }
  });

  it('drains the queue across a simulated reload: queue → destroy → new manager → restore → upload', async () => {
    const { client: firstClient } = createMockSupabaseClient();
    const firstManager = createManager(firstClient);
    // Queue without letting the debounced auto-upload fire (reload interrupts it).
    await firstManager.queueMutation('entries', 'UPDATE', 'entry-1', {
      id: 'entry-1',
      entry_status: 'pending',
    });
    firstManager.destroy();

    expect(localStorageMock[BACKUP_KEY]).toBeDefined();
    await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(1);

    const { client, select } = createMockSupabaseClient();
    const secondManager = createManager(client);
    try {
      await secondManager.restoreMutationsFromLocalStorage();
      const results = await secondManager.uploadPendingMutations();

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(select).toHaveBeenCalledTimes(1);
      await expect(mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toHaveLength(0);
      expect(localStorageMock[BACKUP_KEY]).toBeUndefined();
    } finally {
      secondManager.destroy();
    }
  });

  it('rejects (not empty-success) when the upload pass itself fails', async () => {
    await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeRestoredMutation());
    const dbFailure = new Error('IndexedDB unavailable');
    (databaseManager.getDatabase as ReturnType<typeof vi.fn>).mockRejectedValue(dbFailure);

    const { client } = createMockSupabaseClient();
    const manager = createManager(client);
    try {
      await expect(manager.uploadPendingMutations()).rejects.toThrow('IndexedDB unavailable');
      expect(logger.error).toHaveBeenCalled();
    } finally {
      manager.destroy();
    }
  });

  it('warns loudly when a pass skips every pending mutation (nothing uploaded, nothing failed)', async () => {
    // A mutation in backoff is the easiest all-skip case; the warn must fire so
    // a stalled queue is visible in the console (debug logs are filtered out in
    // the app), with the skip reason in the message.
    await mockDb.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      makeRestoredMutation({ nextRetryAt: Date.now() + 60_000 })
    );

    const { client, select } = createMockSupabaseClient();
    const manager = createManager(client);
    try {
      const results = await manager.uploadPendingMutations();

      expect(results).toHaveLength(0);
      expect(select).not.toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.map(call =>
        String(call[0])
      );
      expect(warnCalls.some(msg => msg.includes('skipped') && msg.includes('backoff'))).toBe(true);
    } finally {
      manager.destroy();
    }
  });
});

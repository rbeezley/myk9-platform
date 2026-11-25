/**
 * MYK9-2360: a restore must read the localStorage backup only under the
 * cross-tab upload lock, so a tab opened during another tab's flush cannot
 * replay a backup the flushing tab has not rewritten yet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { MutationManager } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { UPLOAD_LOCK_NAME } from './upload-lock';
import { MUTATION_BACKUP_STORAGE_KEY as BACKUP_KEY } from './mutation-backup';
import type { PendingMutation } from './types';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

const AUTH_USER_ID = 'test-user';

function makeMutation(id: string): PendingMutation {
  return {
    id,
    authUserId: AUTH_USER_ID,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-' + id,
    data: { id: 'entry-' + id },
    timestamp: Date.now() - 5_000,
    retries: 0,
    status: 'pending',
  };
}

/** A minimal cross-tab Web Locks stand-in: one exclusive FIFO queue by name. */
function installSharedLocks(): void {
  const tails = new Map<string, Promise<unknown>>();
  const request = (name: string, ...rest: unknown[]) => {
    const callback = rest[rest.length - 1] as () => Promise<unknown>;
    const prev = tails.get(name) ?? Promise.resolve();
    const run = prev.then(callback, callback);
    tails.set(
      name,
      run.catch(() => undefined)
    );
    return run;
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true, locks: { request } },
    writable: true,
    configurable: true,
  });
}

describe('MutationManager restore under the upload lock (MYK9-2360)', () => {
  let mockDb: IDBPDatabase;
  let manager: MutationManager;
  let stored: Record<string, string>;

  beforeEach(async () => {
    mockDb = await createMutationManagerTestDb('test-mutation-manager-restore-lock-db');
    await mockDb.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await mockDb.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);
    stored = {};
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
    installSharedLocks();
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    manager = new MutationManager({} as SupabaseClient, {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger,
      getCurrentUserId: async () => AUTH_USER_ID,
    });
  });

  afterEach(() => {
    manager.destroy();
    mockDb.close();
    vi.restoreAllMocks();
  });

  it('defers a restore while another tab holds the upload lock and reads the post-flush backup', async () => {
    // The flushing tab already uploaded mut-1 (queue empty) but has not yet
    // rewritten the backup, which still lists it.
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-1')]);

    let releaseOtherTab!: () => void;
    const otherTabHoldsLock = new Promise<void>(resolve => {
      void navigator.locks.request(UPLOAD_LOCK_NAME, () => {
        resolve();
        return new Promise<void>(done => {
          releaseOtherTab = done;
        });
      });
    });
    await otherTabHoldsLock;

    let restored = false;
    const restore = manager.restoreMutationsFromLocalStorage().then(() => {
      restored = true;
    });
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(restored).toBe(false);
    expect(await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);

    // The flushing tab rewrites its backup (now empty), then releases the lock.
    stored[BACKUP_KEY] = JSON.stringify([]);
    releaseOtherTab();
    await restore;

    expect(restored).toBe(true);
    expect(await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);
  });

  it('restores normally when no tab holds the lock', async () => {
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-2')]);

    await manager.restoreMutationsFromLocalStorage();

    const pending = (await mockDb.getAll(
      REPLICATION_STORES.PENDING_MUTATIONS
    )) as PendingMutation[];
    expect(pending.map(m => m.id)).toEqual(['mut-2']);
  });
});

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
import { MutationBackupStore } from './MutationBackupStore';
import type { MutationUploadRunner } from './MutationUploadRunner';
import { RESTORE_LOCK_TIMEOUT_MS } from './constants';
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

type LockCallback = () => Promise<unknown>;

/** A minimal cross-tab Web Locks stand-in: one exclusive FIFO queue by name, abortable while waiting. */
function installSharedLocks(): void {
  const tails = new Map<string, Promise<unknown>>();
  const request = (name: string, ...rest: unknown[]) => {
    const callback = rest[rest.length - 1] as LockCallback;
    const signal = (rest.length > 1 ? (rest[0] as { signal?: AbortSignal }) : {}).signal;
    const prev = tails.get(name) ?? Promise.resolve();
    let abortWaiting!: (reason: unknown) => void;
    const aborted = new Promise<never>((_, reject) => {
      abortWaiting = reject;
    });
    let gaveUp = false;
    signal?.addEventListener('abort', () => {
      gaveUp = true;
      abortWaiting(new DOMException('Aborted', 'AbortError'));
    });
    const turn = prev.then(() => (gaveUp ? undefined : callback()));
    tails.set(
      name,
      turn.catch(() => undefined)
    );
    return Promise.race([turn, aborted]);
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true, locks: { request } },
    writable: true,
    configurable: true,
  });
}

function installNoWebLocks(): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    writable: true,
    configurable: true,
  });
}

/** Another tab (or a hung pass) takes the lock; the returned function frees it. */
async function holdLock(): Promise<() => void> {
  let release!: () => void;
  await new Promise<void>(held => {
    void navigator.locks.request(UPLOAD_LOCK_NAME, () => {
      held();
      return new Promise<void>(done => {
        release = done;
      });
    });
  });
  return release;
}

describe('MutationManager restore under the upload lock (MYK9-2360)', () => {
  let mockDb: IDBPDatabase;
  let manager: MutationManager;
  let stored: Record<string, string>;
  let identityGate: Promise<void> | null;

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
    identityGate = null;
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = { from: vi.fn(), rpc: vi.fn() } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger,
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => {
        if (identityGate) await identityGate;
        return { authUserId: AUTH_USER_ID, supabaseClient: client };
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    manager.destroy();
    mockDb.close();
    vi.restoreAllMocks();
  });

  it('defers a restore while another tab holds the upload lock and reads the post-flush backup', async () => {
    // The flushing tab already uploaded mut-1 (queue empty) but has not yet
    // rewritten the backup, which still lists it.
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-1')]);

    const releaseOtherTab = await holdLock();

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

  it('times out while another tab holds the lock: resolves, does not restore, and an upload is not blocked', async () => {
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-stale')]);
    const releaseOtherTab = await holdLock();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const restore = manager.restoreMutationsFromLocalStorage();
    await vi.advanceTimersByTimeAsync(RESTORE_LOCK_TIMEOUT_MS);
    await restore;
    vi.useRealTimers();

    expect(await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);

    // restoreInFlight is cleared, so the next upload reaches the runner.
    const runnerUpload = vi.spyOn(
      (manager as unknown as { uploadRunner: MutationUploadRunner }).uploadRunner,
      'uploadPendingMutations'
    );
    void manager.uploadPendingMutations();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(runnerUpload).toHaveBeenCalledTimes(1);

    // The timed-out request must not run the restore once the lock frees.
    releaseOtherTab();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);
  });

  it("recovery restore does not wedge restoreInFlight when this tab's own pass is hung", async () => {
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-recover')]);
    let ungate!: () => void;
    identityGate = new Promise<void>(resolve => {
      ungate = resolve;
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const hungPass = manager.uploadPendingMutations();
    await vi.advanceTimersByTimeAsync(0);

    const restore = manager.restoreMutationsFromLocalStorage();
    await vi.advanceTimersByTimeAsync(RESTORE_LOCK_TIMEOUT_MS);
    await restore;
    vi.useRealTimers();
    expect(await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);

    // A later trigger restores once the pass has ended.
    ungate();
    await hungPass;
    await manager.restoreMutationsFromLocalStorage();
    const pending = (await mockDb.getAll(
      REPLICATION_STORES.PENDING_MUTATIONS
    )) as PendingMutation[];
    expect(pending.map(m => m.id)).toEqual(['mut-recover']);
  });

  it('without Web Locks, a restore waits for the running pass then reads the post-flush backup', async () => {
    installNoWebLocks();
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-flushed')]);
    let ungate!: () => void;
    identityGate = new Promise<void>(resolve => {
      ungate = resolve;
    });
    const pass = manager.uploadPendingMutations();
    await new Promise(resolve => setTimeout(resolve, 10));

    let restored = false;
    const restore = manager.restoreMutationsFromLocalStorage().then(() => {
      restored = true;
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(restored).toBe(false);

    // The pass finishes and rewrites the backup (empty) before the lock frees.
    stored[BACKUP_KEY] = JSON.stringify([]);
    ungate();
    await pass;
    await restore;

    expect(restored).toBe(true);
    expect(await mockDb.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);
  });

  it('an upload requested while a restore waits on the lock runs after the restore', async () => {
    const order: string[] = [];
    vi.spyOn(MutationBackupStore.prototype, 'restore').mockImplementation(async () => {
      order.push('restore');
    });
    vi.spyOn(
      (manager as unknown as { uploadRunner: MutationUploadRunner }).uploadRunner,
      'uploadPendingMutations'
    ).mockImplementation(async () => {
      order.push('upload');
      return [];
    });
    const releaseOtherTab = await holdLock();

    const restore = manager.restoreMutationsFromLocalStorage();
    const upload = manager.uploadPendingMutations();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(order).toEqual([]);

    releaseOtherTab();
    await Promise.all([restore, upload]);
    expect(order).toEqual(['restore', 'upload']);
  });
});

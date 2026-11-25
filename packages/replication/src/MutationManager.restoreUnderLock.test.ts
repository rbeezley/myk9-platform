/**
 * MYK9-2360: a restore must read the localStorage backup only under the
 * cross-tab upload lock, so a tab opened during another tab's flush cannot
 * replay a backup the flushing tab has not rewritten yet. A restore that times
 * out stays owed: nothing outside the lock may replace the backup, and the next
 * upload pass restores it under the lock before it reads the queue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { MutationManager } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { MutationBackupStore } from './MutationBackupStore';
import type { MutationUploadRunner } from './MutationUploadRunner';
import { RESTORE_LOCK_TIMEOUT_MS, RESTORE_RETRY_DELAY_MS } from './constants';
import { UPLOAD_LOCK_NAME } from './upload-lock';
import { MUTATION_BACKUP_STORAGE_KEY as BACKUP_KEY, readMutationJournal } from './mutation-backup';
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
        get length() {
          return Object.keys(stored).length;
        },
        key: (index: number) => Object.keys(stored)[index] ?? null,
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

  /** Live journal ids, sorted (the legacy snapshot counts until it is migrated). */
  function backupIds(): string[] {
    const journal = readMutationJournal(localStorage);
    return [...journal.mutations, ...journal.failedMutations].map(m => m.id).sort();
  }

  async function queuedIds(): Promise<string[]> {
    const pending = (await mockDb.getAll(
      REPLICATION_STORES.PENDING_MUTATIONS
    )) as PendingMutation[];
    const failed = (await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[];
    return [...pending, ...failed].map(m => m.id);
  }

  async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error('waitFor timed out');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

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

  it('times out while another tab holds the lock: resolves, keeps the backup, and retries on its own', async () => {
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-stale')]);
    const releaseOtherTab = await holdLock();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const restore = manager.restoreMutationsFromLocalStorage();
    await vi.advanceTimersByTimeAsync(RESTORE_LOCK_TIMEOUT_MS);
    await restore;

    // Nothing was read outside the lock, and the backup is untouched.
    expect(await queuedIds()).toEqual([]);
    expect(backupIds()).toEqual(['mut-stale']);

    // restoreInFlight is cleared, so an upload is not blocked behind it.
    const runnerUpload = vi.spyOn(
      (manager as unknown as { uploadRunner: MutationUploadRunner }).uploadRunner,
      'uploadPendingMutations'
    );
    void manager.uploadPendingMutations();
    await vi.advanceTimersByTimeAsync(10);
    expect(runnerUpload).toHaveBeenCalledTimes(1);

    // Once the lock frees, the scheduled retry restores, with no network needed.
    releaseOtherTab();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    await vi.advanceTimersByTimeAsync(RESTORE_RETRY_DELAY_MS);
    vi.useRealTimers();
    await waitFor(async () => (await queuedIds()).includes('mut-stale'));
  });

  it('a score queued after a timed-out restore is backed up beside the older ones, which recover on their own', async () => {
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-old')]);
    const releaseOtherTab = await holdLock();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const restore = manager.restoreMutationsFromLocalStorage();
    await vi.advanceTimersByTimeAsync(RESTORE_LOCK_TIMEOUT_MS);
    await restore;

    // A judge records another score while the restore still waits.
    await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation('mut-new'));
    await manager.announceQueued('entry-mut-new');
    expect(backupIds()).toEqual(['mut-new', 'mut-old']);

    // No manual restore: the retry runs once the lock frees.
    releaseOtherTab();
    await vi.advanceTimersByTimeAsync(RESTORE_RETRY_DELAY_MS);
    vi.useRealTimers();
    await waitFor(async () => (await queuedIds()).includes('mut-old'));
    expect((await queuedIds()).sort()).toEqual(['mut-new', 'mut-old']);
    expect(backupIds()).toEqual(['mut-new', 'mut-old']);
  });

  it('a mutation discarded while a restore is owed is not brought back by the restore', async () => {
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-kept'), makeMutation('mut-gone')]);
    await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation('mut-gone'));
    const releaseOtherTab = await holdLock();

    const restore = manager.restoreMutationsFromLocalStorage();
    await new Promise(resolve => setTimeout(resolve, 10));
    // "Take theirs" on the row while the restore waits for the lock.
    await manager.discardPendingMutationsForRow('entries', 'entry-mut-gone');
    // The discard is durable at once, before any restore runs.
    expect(backupIds()).toEqual(['mut-kept']);

    releaseOtherTab();
    await restore;
    expect(await queuedIds()).toEqual(['mut-kept']);
    expect(backupIds()).toEqual(['mut-kept']);
  });

  it('mutations cleared while a restore is owed stay cleared after the restore', async () => {
    stored[BACKUP_KEY] = JSON.stringify([makeMutation('mut-a'), makeMutation('mut-b')]);
    await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation('mut-a'));
    await mockDb.put(REPLICATION_STORES.PENDING_MUTATIONS, makeMutation('mut-b'));
    const releaseOtherTab = await holdLock();

    const restore = manager.restoreMutationsFromLocalStorage();
    await new Promise(resolve => setTimeout(resolve, 10));
    await manager.clearAllMutations();

    releaseOtherTab();
    await restore;
    expect(await queuedIds()).toEqual([]);
    expect(backupIds()).toEqual([]);
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
    vi.spyOn(MutationBackupStore.prototype, 'restoreUnderLock').mockImplementation(async () => {
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

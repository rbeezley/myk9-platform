/**
 * Recovery-durability tests: a circuit-breaker DB wipe must not destroy
 * unsynced (pending) OR dead-lettered (failed) scores.
 *
 * Before the fix, the localStorage backup excluded failed mutations, so a
 * deleteDB() in DatabaseManager.recover() permanently lost dead-lettered
 * scores despite the "never deleted automatically" contract. These tests pin
 * the round-trip: back up both stores, wipe, restore both into the correct
 * stores.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { MutationManager, type MutationManagerOptions } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import type { PendingMutation } from './types';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

const TEST_DB_NAME = 'test-mutation-manager-recovery-backup-db';
const BACKUP_KEY = 'replication_mutation_backup';

function createMockSupabaseClient() {
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'mock-id' }], error: null })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

function createMockLogger(): Logger {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function makeMutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: `mut-${overrides.id ?? 'x'}`,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-1',
    data: { id: 'entry-1', is_scored: true },
    timestamp: 1,
    retries: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('MutationManager recovery backup (pending + failed durability)', () => {
  let manager: MutationManager;
  let mockDb: IDBPDatabase;
  let localStorageMock: Record<string, string>;

  beforeEach(async () => {
    mockDb = await createMutationManagerTestDb(TEST_DB_NAME);
    // fake-indexeddb persists the named DB across opens in-process; start each
    // test from empty stores so cross-test state can't mask a dedup bug.
    await mockDb.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await mockDb.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(mockDb);

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

    const options: MutationManagerOptions = {
      maxRetries: 3,
      retryBackoffBase: 10,
      logger: createMockLogger(),
    };
    manager = new MutationManager(createMockSupabaseClient(), options);
  });

  afterEach(async () => {
    manager.destroy();
    mockDb.close();
    localStorageMock = {};
    vi.restoreAllMocks();
  });

  it('restores a dead-lettered mutation into the FAILED store (not the active queue) after a wipe', async () => {
    // Backup as written by writeCurrentMutationsBackup: pending + failed together.
    const pending = makeMutation({ id: 'pending-1', rowId: 'entry-pending' });
    const failed = makeMutation({
      id: 'failed-1',
      rowId: 'entry-failed',
      status: 'failed',
      error: 'RLS denied',
      failedAt: 1,
    });
    localStorageMock[BACKUP_KEY] = JSON.stringify([pending, failed]);

    // Simulate a fresh DB after recover(): both stores empty.
    await manager.restoreMutationsFromLocalStorage();

    const restoredPending = (await mockDb.getAll(
      REPLICATION_STORES.PENDING_MUTATIONS
    )) as PendingMutation[];
    const restoredFailed = (await mockDb.getAll(
      REPLICATION_STORES.FAILED_MUTATIONS
    )) as PendingMutation[];

    // Pending score is back in the active queue.
    expect(restoredPending.map(m => m.id)).toEqual(['pending-1']);
    // Dead-lettered score survived the wipe and is in the failed store — NOT
    // re-queued for auto-retry.
    expect(restoredFailed.map(m => m.id)).toEqual(['failed-1']);
    expect(restoredPending.some(m => m.status === 'failed')).toBe(false);
  });

  it('is idempotent: restoring twice does not duplicate failed mutations', async () => {
    const failed = makeMutation({
      id: 'failed-dup',
      status: 'failed',
      error: 'timeout',
      failedAt: 1,
    });
    localStorageMock[BACKUP_KEY] = JSON.stringify([failed]);

    await manager.restoreMutationsFromLocalStorage();
    await manager.restoreMutationsFromLocalStorage();

    const restoredFailed = await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS);
    expect(restoredFailed).toHaveLength(1);
  });

  it('removes a discarded failed mutation from the localStorage backup', async () => {
    // Failed mutations are included in the backup, so discarding one must rewrite
    // the backup — otherwise a recovery/restore resurrects the discarded mutation.
    const failed = makeMutation({
      id: 'failed-discard',
      status: 'failed',
      error: 'permission denied',
      failedAt: 1,
    });
    await mockDb.put(REPLICATION_STORES.FAILED_MUTATIONS, failed);
    // Seed the backup as writeCurrentMutationsBackup would (includes failed).
    localStorageMock[BACKUP_KEY] = JSON.stringify([failed]);

    await manager.discardFailedMutation('failed-discard');

    // Gone from the failed store AND from the backup.
    expect(await mockDb.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).toHaveLength(0);
    const backup = localStorageMock[BACKUP_KEY];
    expect(backup === undefined || !backup.includes('failed-discard')).toBe(true);
  });

  it('keeps the score durably queued when the localStorage backup write throws', async () => {
    // Simulate localStorage full: setItem throws (Safari private mode / large
    // queue). The IDB queue write already succeeded, so queueMutation must NOT
    // reject (audit M2).
    (globalThis.localStorage.setItem as unknown) = () => {
      throw new Error('QuotaExceededError: localStorage is full');
    };

    const id = await manager.queueMutation('entries', 'UPDATE', 'entry-1', { id: 'entry-1' });

    expect(typeof id).toBe('string');
    const stored = await mockDb.get(REPLICATION_STORES.PENDING_MUTATIONS, id);
    expect(stored).toBeDefined();
    expect(stored!.status).toBe('pending');
  });
});

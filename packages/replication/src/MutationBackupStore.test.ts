import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { MutationBackupStore } from './MutationBackupStore';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';
import { createMemoryStorage, journalIds, seedJournal } from './test-utils/memoryStorage';
import type { PendingMutation } from './types';

/**
 * MYK9-2360: a journal entry is removed only for a row this code saw leave the
 * SAME database. A database recreated mid-operation (recover(), eviction) is
 * empty, and must not read as "every row was removed".
 */
const mutation = (id: string): PendingMutation => ({
  id,
  authUserId: 'judge-1',
  tableName: 'entries',
  operation: 'UPDATE',
  rowId: 'entry-' + id,
  data: { id: 'entry-' + id },
  timestamp: 1,
  retries: 0,
  status: 'pending',
});

const logger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('MutationBackupStore removals (MYK9-2360)', () => {
  let stored: Record<string, string>;
  let original: IDBPDatabase;
  let recreated: IDBPDatabase;
  let current: IDBPDatabase;
  let store: MutationBackupStore;

  beforeEach(async () => {
    stored = {};
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(stored),
    });
    original = await createMutationManagerTestDb(`backup-store-a-${Math.random()}`);
    recreated = await createMutationManagerTestDb(`backup-store-b-${Math.random()}`);
    current = original;
    vi.spyOn(databaseManager, 'getDatabase').mockImplementation(async () => current);
    store = new MutationBackupStore(logger);
    await original.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation('kept'));
    seedJournal(stored, [mutation('kept')]);
  });

  afterEach(() => {
    original.close();
    recreated.close();
    vi.restoreAllMocks();
  });

  it('keeps every entry when the database is replaced during a tracked removal', async () => {
    await store.trackRemovals(
      async () => {
        current = recreated;
      },
      () => true
    );

    expect(journalIds(stored)).toEqual(['kept']);
  });

  it('keeps every entry when the database is replaced during an upload pass', async () => {
    store.beginPass(original, ['kept']);
    current = recreated;

    await store.checkpointUnderLock();

    expect(journalIds(stored)).toEqual(['kept']);
  });

  it('removes the entry of a row that left the same database', async () => {
    await store.trackRemovals(
      () => original.delete(REPLICATION_STORES.PENDING_MUTATIONS, 'kept'),
      () => true
    );

    expect(journalIds(stored)).toEqual([]);
  });

  it("removes one owner's entries, including ones IndexedDB lost, and keeps another's", async () => {
    seedJournal(stored, [mutation('lost'), { ...mutation('theirs'), authUserId: 'judge-2' }]);

    store.removeOwnedEntries('judge-1');

    expect(journalIds(stored)).toEqual(['theirs']);
  });
});

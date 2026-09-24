/**
 * MYK9-616: the v7 -> v8 upgrade drops the four unread compound `data.*`
 * indexes on `replicated_tables` and must not touch a single record. A device
 * can carry dirty rows and queued mutations (offline ringside scores) across
 * the upgrade; losing them would lose show-day work.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import {
  DatabaseManager,
  REPLICATION_STORES,
  RETIRED_REPLICATED_TABLE_INDEXES,
} from './DatabaseManager';
import { DB_VERSION } from '../constants';

const PREVIOUS_VERSION = 7;

const DIRTY_ROW = {
  tableName: 'entries',
  id: 'entry-1',
  data: { id: 'entry-1', class_id: 'class-1', show_id: 'show-1', armband_number: 12 },
  isDirty: true,
  lastSyncedAt: 0,
};

const PENDING_MUTATION = {
  id: 'mutation-1',
  status: 'pending',
  tableName: 'entries',
  rowId: 'entry-1',
};

/** The `replicated_tables` / `pending_mutations` schema a v7 device holds. */
async function seedPreviousVersion(dbName: string): Promise<void> {
  const db = await openDB(dbName, PREVIOUS_VERSION, {
    upgrade(upgradeDb) {
      const store = upgradeDb.createObjectStore(REPLICATION_STORES.REPLICATED_TABLES, {
        keyPath: ['tableName', 'id'],
      });
      store.createIndex('tableName', 'tableName', { unique: false });
      store.createIndex('tableName_lastSyncedAt', ['tableName', 'lastSyncedAt'], {
        unique: false,
      });
      store.createIndex('isDirty', 'isDirty', { unique: false });
      for (const indexName of RETIRED_REPLICATED_TABLE_INDEXES) {
        const field = indexName.replace('tableName_', '');
        store.createIndex(indexName, ['tableName', field], { unique: false });
      }
      const mutations = upgradeDb.createObjectStore(REPLICATION_STORES.PENDING_MUTATIONS, {
        keyPath: 'id',
      });
      mutations.createIndex('status', 'status', { unique: false });
      mutations.createIndex('tableName', 'tableName', { unique: false });
      mutations.createIndex('tableName_rowId', ['tableName', 'rowId'], { unique: false });
      upgradeDb.createObjectStore(REPLICATION_STORES.SYNC_METADATA, { keyPath: 'tableName' });
    },
  });
  await db.put(REPLICATION_STORES.REPLICATED_TABLES, DIRTY_ROW);
  await db.put(REPLICATION_STORES.PENDING_MUTATIONS, PENDING_MUTATION);
  db.close();
}

function replicatedTableIndexNames(db: Awaited<ReturnType<DatabaseManager['getDatabase']>>) {
  return Array.from(db.transaction(REPLICATION_STORES.REPLICATED_TABLES).store.indexNames);
}

describe('DatabaseManager v7 -> v8 upgrade (MYK9-616)', () => {
  let dbName: string;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();
    dbName = `upgrade-test-${Date.now()}-${Math.random()}`;
    dbManager = new DatabaseManager({}, dbName, DB_VERSION);
  });

  afterEach(async () => {
    await dbManager.reset();
  });

  it('bumps the schema version past the one that carried the indexes', () => {
    expect(DB_VERSION).toBe(PREVIOUS_VERSION + 1);
  });

  it('drops the retired indexes and keeps every read-path index', async () => {
    await seedPreviousVersion(dbName);
    const db = await dbManager.getDatabase('entries');

    expect(db.version).toBe(DB_VERSION);
    const indexNames = replicatedTableIndexNames(db);
    for (const retired of RETIRED_REPLICATED_TABLE_INDEXES) {
      expect(indexNames).not.toContain(retired);
    }
    expect(indexNames).toEqual(
      expect.arrayContaining(['tableName', 'tableName_lastSyncedAt', 'isDirty'])
    );
  });

  it('preserves a dirty row and its queued mutation across the upgrade', async () => {
    await seedPreviousVersion(dbName);
    const db = await dbManager.getDatabase('entries');

    await expect(
      db.get(REPLICATION_STORES.REPLICATED_TABLES, ['entries', 'entry-1'])
    ).resolves.toEqual(DIRTY_ROW);
    await expect(
      db.getAllFromIndex(REPLICATION_STORES.REPLICATED_TABLES, 'tableName', 'entries')
    ).resolves.toEqual([DIRTY_ROW]);
    await expect(db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).resolves.toEqual([
      PENDING_MUTATION,
    ]);
  });

  it('never creates the retired indexes on a fresh database', async () => {
    const db = await dbManager.getDatabase('entries');
    const indexNames = replicatedTableIndexNames(db);
    for (const retired of RETIRED_REPLICATED_TABLE_INDEXES) {
      expect(indexNames).not.toContain(retired);
    }
  });
});

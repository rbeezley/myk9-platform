import { openDB, type IDBPDatabase } from 'idb';
import { REPLICATION_STORES } from '../core/DatabaseManager';

export async function createMutationManagerTestDb(dbName: string): Promise<IDBPDatabase> {
  return openDB(dbName, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(REPLICATION_STORES.REPLICATED_TABLES)) {
        const store = db.createObjectStore(REPLICATION_STORES.REPLICATED_TABLES, {
          keyPath: ['tableName', 'id'],
        });
        store.createIndex('tableName', 'tableName', { unique: false });
        store.createIndex('tableName_lastSyncedAt', ['tableName', 'lastSyncedAt'], {
          unique: false,
        });
        store.createIndex('isDirty', 'isDirty', { unique: false });
      }

      if (!db.objectStoreNames.contains(REPLICATION_STORES.PENDING_MUTATIONS)) {
        const store = db.createObjectStore(REPLICATION_STORES.PENDING_MUTATIONS, {
          keyPath: 'id',
        });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('tableName', 'tableName', { unique: false });
      }

      if (!db.objectStoreNames.contains(REPLICATION_STORES.FAILED_MUTATIONS)) {
        const store = db.createObjectStore(REPLICATION_STORES.FAILED_MUTATIONS, {
          keyPath: 'id',
        });
        store.createIndex('tableName', 'tableName', { unique: false });
        store.createIndex('failedAt', 'failedAt', { unique: false });
      }
    },
  });
}

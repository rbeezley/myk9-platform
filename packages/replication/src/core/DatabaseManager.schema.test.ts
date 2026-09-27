/**
 * MYK9-793: the scoring e2e spec seeds `myK9_Replication` by opening it itself
 * rather than importing `DatabaseManager`'s upgrade logic, so it reuses
 * `REPLICATION_SCHEMA` instead. If a future edit to `createObjectStores`
 * diverges from that export, the app and the e2e seed would silently disagree
 * on the schema again. This proves the export is not just decorative — it
 * matches every store and index a fresh database actually gets.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { DatabaseManager, REPLICATION_SCHEMA } from './DatabaseManager';
import { DB_VERSION } from '../constants';

describe('REPLICATION_SCHEMA matches what DatabaseManager creates on a fresh database', () => {
  let dbName: string;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();
    dbName = `schema-test-${Date.now()}-${Math.random()}`;
    dbManager = new DatabaseManager({}, dbName, DB_VERSION);
  });

  afterEach(async () => {
    await dbManager.reset();
  });

  it('creates exactly the stores REPLICATION_SCHEMA declares', async () => {
    const db = await dbManager.getDatabase('entries');

    expect(Array.from(db.objectStoreNames).sort()).toEqual(
      REPLICATION_SCHEMA.map(store => store.name).sort()
    );
  });

  it('creates every store with the keyPath and indexes REPLICATION_SCHEMA declares', async () => {
    const db = await dbManager.getDatabase('entries');
    const tx = db.transaction(Array.from(db.objectStoreNames), 'readonly');

    for (const storeDef of REPLICATION_SCHEMA) {
      const store = tx.objectStore(storeDef.name);
      expect(store.keyPath).toEqual(storeDef.keyPath);
      expect(Array.from(store.indexNames).sort()).toEqual(
        storeDef.indexes.map(index => index.name).sort()
      );

      for (const indexDef of storeDef.indexes) {
        const index = store.index(indexDef.name);
        expect(index.keyPath).toEqual(indexDef.keyPath);
        expect(index.unique).toBe(indexDef.unique);
      }
    }
  });
});

/**
 * MYK9-1663: a build older than the device's database must report a stale
 * schema (not crash, not delete the data), and a tab told to close its
 * connection by a newer build must report it too.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { DatabaseManager, REPLICATION_STORES } from './DatabaseManager';
import { onStaleSchema, getStaleSchemaLatch, type StaleSchemaReason } from './staleSchema';

const DB_NAME = 'test-stale-schema-db';
const NEWER = 9;
const OLDER = 7;

function collect(): { reasons: StaleSchemaReason[]; stop: () => void } {
  const reasons: StaleSchemaReason[] = [];
  const stop = onStaleSchema(reason => reasons.push(reason));
  return { reasons, stop };
}

describe('DatabaseManager stale schema', () => {
  let manager: DatabaseManager | undefined;

  beforeEach(() => {
    indexedDB.deleteDatabase(DB_NAME);
  });

  afterEach(async () => {
    await manager?.reset();
    manager = undefined;
    indexedDB.deleteDatabase(DB_NAME);
  });

  it('signals version-error, rejects the open, and keeps the newer data', async () => {
    const newer = await openDB(DB_NAME, NEWER, {
      upgrade(db) {
        db.createObjectStore(REPLICATION_STORES.PENDING_MUTATIONS, { keyPath: 'id' });
      },
    });
    await newer.put(REPLICATION_STORES.PENDING_MUTATIONS, { id: 'queued-score' });
    newer.close();

    const { reasons, stop } = collect();
    manager = new DatabaseManager({}, DB_NAME, OLDER);

    await expect(manager.getDatabase('entries')).rejects.toMatchObject({ name: 'VersionError' });
    expect(reasons).toEqual(['version-error']);
    stop();

    const reopened = await openDB(DB_NAME, NEWER);
    expect(await reopened.get(REPLICATION_STORES.PENDING_MUTATIONS, 'queued-score')).toEqual({
      id: 'queued-score',
    });
    reopened.close();
  });

  it('signals version-change and closes the connection when a newer build upgrades', async () => {
    const { reasons, stop } = collect();
    manager = new DatabaseManager({}, DB_NAME, OLDER);
    const db = await manager.getDatabase('entries');
    const closeSpy = vi.spyOn(db, 'close');

    const upgraded = await openDB(DB_NAME, NEWER);

    expect(closeSpy).toHaveBeenCalled();
    expect(reasons).toEqual(['version-change']);
    expect(manager.isInitialized()).toBe(false);
    stop();
    upgraded.close();
  });

  it('does not latch when another tab deletes the database, and reconnects', async () => {
    const { reasons, stop } = collect();
    manager = new DatabaseManager({}, DB_NAME, OLDER);
    const db = await manager.getDatabase('entries');
    const closeSpy = vi.spyOn(db, 'close');

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    expect(closeSpy).toHaveBeenCalled();
    expect(reasons).toEqual([]);
    expect(getStaleSchemaLatch()).toBeNull();
    expect(manager.isInitialized()).toBe(false);
    const again = await manager.getDatabase('entries');
    expect(again).toBeDefined();
    stop();
  });

  it('keeps notifying other listeners when one throws, and stops after unsubscribe', async () => {
    const good: StaleSchemaReason[] = [];
    const stopBad = onStaleSchema(() => {
      throw new Error('boom');
    });
    const stopGood = onStaleSchema(reason => good.push(reason));

    manager = new DatabaseManager({}, DB_NAME, OLDER);
    const db = await manager.getDatabase('entries');
    expect(db).toBeDefined();
    const upgraded = await openDB(DB_NAME, NEWER);
    expect(good).toEqual(['version-change']);

    stopBad();
    stopGood();
    upgraded.close();
  });

  it('never deletes the newer database when reads keep failing after a VersionError', async () => {
    const newer = await openDB(DB_NAME, NEWER, {
      upgrade(db) {
        db.createObjectStore(REPLICATION_STORES.PENDING_MUTATIONS, { keyPath: 'id' });
      },
    });
    await newer.put(REPLICATION_STORES.PENDING_MUTATIONS, { id: 'queued-score' });
    newer.close();

    const { reasons, stop } = collect();
    manager = new DatabaseManager({}, DB_NAME, OLDER);
    const openSpy = vi.spyOn(indexedDB, 'open');
    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase');

    await expect(manager.getDatabase('entries')).rejects.toMatchObject({ name: 'VersionError' });
    const opensAfterFirst = openSpy.mock.calls.length;

    // The real read path: each failed read calls recordFailure(); 3 trips the breaker.
    for (let i = 0; i < 5; i++) {
      await expect(manager.getDatabase('entries')).rejects.toMatchObject({
        name: 'StaleSchemaError',
      });
      manager.recordFailure();
    }
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(openSpy.mock.calls.length).toBe(opensAfterFirst);
    expect(manager.isCircuitOpen()).toBe(false);
    expect(reasons).toEqual(['version-error']);
    stop();
    openSpy.mockRestore();
    deleteSpy.mockRestore();

    const reopened = await openDB(DB_NAME, NEWER);
    expect(await reopened.get(REPLICATION_STORES.PENDING_MUTATIONS, 'queued-score')).toEqual({
      id: 'queued-score',
    });
    reopened.close();
  });

  it('refuses to recover after a versionchange, even when failures trip the breaker', async () => {
    const { reasons, stop } = collect();
    manager = new DatabaseManager({}, DB_NAME, OLDER);
    await manager.getDatabase('entries');
    const upgraded = await openDB(DB_NAME, NEWER);
    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase');

    for (let i = 0; i < 4; i++) manager.recordFailure();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(reasons).toEqual(['version-change']);
    stop();
    deleteSpy.mockRestore();
    upgraded.close();
  });

  it('recover() itself refuses to delete while stale, whoever calls it', async () => {
    manager = new DatabaseManager({}, DB_NAME, OLDER);
    await manager.getDatabase('entries');
    const upgraded = await openDB(DB_NAME, NEWER);
    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase');

    await (manager as unknown as { recover: () => Promise<void> }).recover();

    expect(deleteSpy).not.toHaveBeenCalled();
    deleteSpy.mockRestore();
    upgraded.close();
  });
});

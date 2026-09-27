import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { markReplicatedRowSynced } from './mutation-row-sync';
import type { PendingMutation, ReplicatedRow } from './types';

describe('markReplicatedRowSynced', () => {
  beforeEach(async () => {
    await databaseManager.reset();
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  it('keeps the row dirty when a later mutation for the same row remains queued', async () => {
    const db = await databaseManager.getDatabase('row-sync-test');
    const row: ReplicatedRow<{ id: string; name: string }> = {
      tableName: 'dogs',
      id: 'dog-1',
      data: { id: 'dog-1', name: 'Rex' },
      version: 2,
      lastSyncedAt: 1,
      lastAccessedAt: 1,
      isDirty: true,
      syncStatus: 'pending',
    };
    const currentMutation: PendingMutation = {
      id: 'mutation-1',
      tableName: 'dogs',
      operation: 'UPDATE',
      rowId: 'dog-1',
      data: { id: 'dog-1', name: 'Rex' },
      timestamp: 1,
      sequenceNumber: 1,
      retries: 0,
      status: 'pending',
      authUserId: 'user-1',
    };
    const laterMutation: PendingMutation = {
      ...currentMutation,
      id: 'mutation-2',
      data: { id: 'dog-1', name: 'Rex updated again' },
      timestamp: 2,
      sequenceNumber: 2,
    };
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, currentMutation);
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, laterMutation);

    await markReplicatedRowSynced(db, currentMutation, 3);

    await expect(
      db.get(REPLICATION_STORES.REPLICATED_TABLES, ['dogs', 'dog-1'])
    ).resolves.toMatchObject({
      isDirty: true,
      syncStatus: 'pending',
      serverVersion: 3,
    });
  });

  it('keeps a clean row clean while applying a newer server version', async () => {
    const db = await databaseManager.getDatabase('row-sync-clean-test');
    const row: ReplicatedRow<{ id: string }> = {
      tableName: 'dogs',
      id: 'dog-1',
      data: { id: 'dog-1' },
      version: 2,
      serverVersion: 2,
      lastSyncedAt: 1,
      lastAccessedAt: 1,
      isDirty: false,
      syncStatus: 'synced',
    };
    const mutation: PendingMutation = {
      id: 'mutation-1',
      tableName: 'dogs',
      operation: 'UPDATE',
      rowId: 'dog-1',
      data: { id: 'dog-1' },
      timestamp: 1,
      sequenceNumber: 1,
      retries: 0,
      status: 'pending',
      authUserId: 'user-1',
    };
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);

    await markReplicatedRowSynced(db, mutation, 3);

    await expect(
      db.get(REPLICATION_STORES.REPLICATED_TABLES, ['dogs', 'dog-1'])
    ).resolves.toMatchObject({
      isDirty: false,
      syncStatus: 'synced',
      serverVersion: 3,
    });
  });
});

describe('markReplicatedRowSynced — own upload step (MYK9-770)', () => {
  beforeEach(async () => {
    await databaseManager.reset();
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  const baseRow: ReplicatedRow<{ id: string }> = {
    tableName: 'entries',
    id: 'entry-1',
    data: { id: 'entry-1' },
    version: 2,
    lastSyncedAt: 1,
    lastAccessedAt: 1,
    isDirty: true,
    syncStatus: 'pending',
    serverVersion: 1,
  };
  const upload: PendingMutation = {
    id: 'armband',
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-1',
    data: { id: 'entry-1' },
    timestamp: 1,
    sequenceNumber: 1,
    retries: 0,
    status: 'pending',
    authUserId: 'user-1',
    serverVersion: 1,
  };

  it('records the step an OCC-guarded upload moved the token through', async () => {
    const db = await databaseManager.getDatabase('row-sync-step-test');
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, baseRow);
    await markReplicatedRowSynced(db, upload, 2);
    const stored = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
      'entries',
      'entry-1',
    ])) as ReplicatedRow<unknown>;
    expect(stored.serverVersion).toBe(2);
    expect(stored.lastOwnUpload).toEqual({ from: 1, to: 2 });
  });

  it('records nothing for an upload that carried no precondition', async () => {
    const db = await databaseManager.getDatabase('row-sync-step-test');
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, baseRow);
    const unguarded: PendingMutation = { ...upload };
    delete unguarded.serverVersion;
    await markReplicatedRowSynced(db, unguarded, 2);
    const stored = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
      'entries',
      'entry-1',
    ])) as ReplicatedRow<unknown>;
    expect(stored.lastOwnUpload).toBeUndefined();
  });
});

describe('markReplicatedRowSynced — an uploaded create is server-backed (MYK9-775)', () => {
  beforeEach(async () => {
    await databaseManager.reset();
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  const created: ReplicatedRow<{ id: string; _localOnly?: boolean }> = {
    tableName: 'judge_assignments',
    id: 'ja-1',
    data: { id: 'ja-1', _localOnly: true },
    version: 1,
    lastSyncedAt: 1,
    lastAccessedAt: 1,
    isDirty: true,
    syncStatus: 'pending',
  };
  const mutation = (operation: PendingMutation['operation']): PendingMutation => ({
    id: `m-${operation}`,
    tableName: 'judge_assignments',
    operation,
    rowId: 'ja-1',
    data: { id: 'ja-1' },
    timestamp: 1,
    sequenceNumber: 1,
    retries: 0,
    status: 'pending',
    authUserId: 'user-1',
  });

  async function stored() {
    const db = await databaseManager.getDatabase('row-sync-local-only');
    return (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [
      'judge_assignments',
      'ja-1',
    ])) as ReplicatedRow<{ _localOnly?: boolean }>;
  }

  it('clears _localOnly once the INSERT uploads', async () => {
    const db = await databaseManager.getDatabase('row-sync-local-only');
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, created);
    await markReplicatedRowSynced(db, mutation('INSERT'));
    expect((await stored()).data._localOnly).toBeUndefined();
    expect((await stored()).isDirty).toBe(false);
  });

  it('leaves the data alone for an UPDATE', async () => {
    const db = await databaseManager.getDatabase('row-sync-local-only');
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, created);
    await markReplicatedRowSynced(db, mutation('UPDATE'));
    expect((await stored()).data._localOnly).toBe(true);
  });
});

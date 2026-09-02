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

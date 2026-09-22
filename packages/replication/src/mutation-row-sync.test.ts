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

  it('advances the accepted style baseline when an earlier style succeeds and a later one failed', async () => {
    const db = await databaseManager.getDatabase('style-row-sync-accepted-baseline');
    const row: ReplicatedRow<{ id: string; style: string; name: string }> = {
      tableName: 'shows',
      id: 'show-style-baseline',
      data: { id: 'show-style-baseline', style: 'poster', name: 'Local edit' },
      baseData: { id: 'show-style-baseline', style: 'monogram', name: 'Server name' },
      baseVersion: 2,
      version: 4,
      lastSyncedAt: 1,
      lastAccessedAt: 1,
      isDirty: true,
      syncStatus: 'pending',
    };
    const accepted: PendingMutation = {
      id: 'style-baseline-a',
      tableName: 'shows',
      operation: 'UPDATE',
      rowId: 'show-style-baseline',
      data: { id: 'show-style-baseline' },
      rpc: { name: 'update_show_style', args: { p_style: 'premium' } },
      timestamp: 1,
      sequenceNumber: 1,
      retries: 0,
      status: 'pending',
      authUserId: 'user-1',
    };
    const laterFailure: PendingMutation = {
      ...accepted,
      id: 'style-baseline-b',
      rpc: { name: 'update_show_style', args: { p_style: 'poster' } },
      timestamp: 2,
      sequenceNumber: 2,
      status: 'failed',
    };
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, laterFailure);

    await markReplicatedRowSynced(db, accepted, 3);

    await expect(
      db.get(REPLICATION_STORES.REPLICATED_TABLES, ['shows', 'show-style-baseline'])
    ).resolves.toMatchObject({
      data: { style: 'poster', name: 'Local edit' },
      baseData: { style: 'premium', name: 'Server name' },
      isDirty: true,
      serverVersion: 3,
    });
  });

  it('supersedes earlier failed style intent when a newer style succeeds', async () => {
    const db = await databaseManager.getDatabase('style-row-sync-newer-success');
    const row: ReplicatedRow<{ id: string; style: string }> = {
      tableName: 'shows',
      id: 'show-style-success',
      data: { id: 'show-style-success', style: 'poster' },
      baseData: { id: 'show-style-success', style: 'monogram' },
      baseVersion: 2,
      version: 3,
      lastSyncedAt: 1,
      lastAccessedAt: 1,
      isDirty: true,
      syncStatus: 'pending',
    };
    const earlierFailure: PendingMutation = {
      id: 'style-success-a',
      tableName: 'shows',
      operation: 'UPDATE',
      rowId: 'show-style-success',
      data: { id: 'show-style-success' },
      rpc: { name: 'update_show_style', args: { p_style: 'premium' } },
      timestamp: 1,
      sequenceNumber: 1,
      retries: 0,
      status: 'failed',
      authUserId: 'user-1',
    };
    const accepted: PendingMutation = {
      ...earlierFailure,
      id: 'style-success-b',
      rowId: 'show-style-success',
      data: { id: 'show-style-success' },
      rpc: { name: 'update_show_style', args: { p_style: 'poster' } },
      timestamp: 2,
      sequenceNumber: 2,
      status: 'pending',
    };
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, earlierFailure);
    expect(
      await db
        .transaction(REPLICATION_STORES.PENDING_MUTATIONS)
        .store.index('tableName_rowId')
        .getAll(['shows', 'show-style-success'])
    ).toHaveLength(0);
    expect(await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).toContainEqual(
      expect.objectContaining({ id: 'style-success-a' })
    );

    await markReplicatedRowSynced(db, accepted, 3);

    await expect(
      db.get(REPLICATION_STORES.REPLICATED_TABLES, ['shows', 'show-style-success'])
    ).resolves.toMatchObject({
      data: { style: 'poster' },
      isDirty: false,
      syncStatus: 'synced',
      serverVersion: 3,
    });
    await expect(
      db.get(REPLICATION_STORES.FAILED_MUTATIONS, earlierFailure.id)
    ).resolves.toBeUndefined();
  });
});

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { markReplicatedRowSynced } from './mutation-row-sync';
import { ScoreTable, type ScoreRow } from './test-utils/ackRebaseFixtures';
import type { PendingMutation, ReplicatedRow } from './types';

/**
 * MYK9-1327: a mutation that parked (moved to FAILED_MUTATIONS) is still
 * recoverable through Retry or Discard, so it keeps its row dirty when an
 * unrelated mutation for the same row acknowledges. Otherwise a pull restores
 * the server's old value over the parked edit.
 */
describe('markReplicatedRowSynced with a parked sibling (MYK9-1327)', () => {
  const OWNER = 'user-1';
  let tableName: string;

  beforeEach(async () => {
    await databaseManager.reset();
    tableName = `scores_${crypto.randomUUID()}`;
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  function mutation(id: string, extra: Partial<PendingMutation> = {}): PendingMutation {
    return {
      id,
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1' },
      timestamp: 1,
      retries: 0,
      status: 'pending',
      authUserId: OWNER,
      ...extra,
    };
  }

  const dirtyRow = (): ReplicatedRow<ScoreRow> => ({
    tableName,
    id: '1',
    data: { id: '1', result: 'q', reason: 'parked edit', placement: null, endedAt: null },
    version: 2,
    serverVersion: 3,
    lastSyncedAt: 1,
    lastAccessedAt: 1,
    isDirty: true,
    syncStatus: 'pending',
  });

  async function setup(failed: PendingMutation[]) {
    const db = await databaseManager.getDatabase('parked-test');
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, dirtyRow());
    for (const m of failed) await db.put(REPLICATION_STORES.FAILED_MUTATIONS, m);
    return db;
  }

  it('an unrelated ack leaves the row dirty and a pull does not overwrite the parked field', async () => {
    const db = await setup([mutation('parked', { status: 'failed' })]);

    await markReplicatedRowSynced(db, mutation('acked'), 4);

    expect(await db.get(REPLICATION_STORES.REPLICATED_TABLES, [tableName, '1'])).toMatchObject({
      isDirty: true,
      syncStatus: 'pending',
      serverVersion: 4,
    });

    const table = new ScoreTable(tableName);
    await table.batchSet(
      [{ id: '1', result: 'nq', reason: 'server old', placement: null, endedAt: null }],
      new Map([['1', 5]])
    );
    const after = await table.getReplicatedRow('1');
    expect(after?.data).toMatchObject({ reason: 'parked edit' });
    expect(after?.isDirty).toBe(true);
  });

  it('control: with nothing parked the same ack cleans the row', async () => {
    const db = await setup([]);

    await markReplicatedRowSynced(db, mutation('acked'), 4);

    expect(await db.get(REPLICATION_STORES.REPLICATED_TABLES, [tableName, '1'])).toMatchObject({
      isDirty: false,
      syncStatus: 'synced',
    });
  });

  it('ignores parked mutations of another row, another table or another owner', async () => {
    const db = await setup([
      mutation('other-row', { rowId: '2' }),
      mutation('other-table', { tableName: `${tableName}_x` }),
      mutation('other-owner', { authUserId: 'user-2' }),
    ]);

    await markReplicatedRowSynced(db, mutation('acked'), 4);

    expect(await db.get(REPLICATION_STORES.REPLICATED_TABLES, [tableName, '1'])).toMatchObject({
      isDirty: false,
      syncStatus: 'synced',
    });
  });
});

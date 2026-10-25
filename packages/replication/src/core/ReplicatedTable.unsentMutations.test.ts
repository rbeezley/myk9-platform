import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MutationManager } from '../MutationManager';
import { databaseManager, REPLICATION_STORES } from './DatabaseManager';
import {
  AUTH_USER_ID,
  makeServer,
  PlainEntriesTable,
  resetForStaleRowTest,
  startStaleRowManager,
  teardownStaleRowTest,
} from '../test-utils/staleRowRefetchFixtures';
import type { PendingMutation } from '../types';

/** The queue reader a table exposes for "what has this device not delivered yet". */
describe('ReplicatedTable.getUnsentMutationsForTable', () => {
  let manager: MutationManager | undefined;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });
  afterEach(() => teardownStaleRowTest(manager));

  const mutation = (id: string, table: string, status: 'pending' | 'failed'): PendingMutation => ({
    id,
    authUserId: AUTH_USER_ID,
    tableName: table,
    operation: 'DELETE',
    rowId: id,
    data: { id, class_id: 'class-1' },
    timestamp: Date.now(),
    retries: 0,
    status,
    nextRetryAt: Date.now() + 3_600_000,
  });

  it("names this table's pending and failed mutations, and no other table's or account's", async () => {
    const table = new PlainEntriesTable(tableName);
    manager = startStaleRowManager(
      table,
      makeServer({ status: 's', final_placement: null, version: 1 }).supabase
    ).manager;
    const db = await databaseManager.getDatabase('test');
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('pending-mine', tableName, 'pending')
    );
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, mutation('failed-mine', tableName, 'failed'));
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('pending-other-table', 'other_table', 'pending')
    );
    await db.put(
      REPLICATION_STORES.FAILED_MUTATIONS,
      mutation('failed-other-table', 'other_table', 'failed')
    );
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      ...mutation('pending-other-account', tableName, 'pending'),
      authUserId: 'someone-else',
    });

    const unsent = await table.getUnsentMutationsForTable();

    expect(unsent.map(m => m.id).sort()).toEqual(['failed-mine', 'pending-mine']);
  });

  it('is empty without a mutation manager', async () => {
    expect(await new PlainEntriesTable(tableName).getUnsentMutationsForTable()).toEqual([]);
  });
});

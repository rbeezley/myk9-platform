import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { markReplicatedRowSynced } from './mutation-row-sync';
import type { PendingMutation, ReplicatedRow } from './types';

type Show = {
  id: string;
  uses_device_scoring?: boolean;
  uses_paper_packet?: boolean;
  uses_volunteers?: boolean;
};

const KEY = ['shows', 'show-1'];

function mutation(
  id: string,
  sequenceNumber: number,
  data: Partial<Show>,
  authUserId = 'user-1'
): PendingMutation {
  const payload = { id: 'show-1', ...data };
  return {
    id,
    tableName: 'shows',
    operation: 'UPDATE',
    rowId: 'show-1',
    data: payload,
    explicitDataKeys: Object.keys(payload),
    timestamp: sequenceNumber,
    sequenceNumber,
    retries: 0,
    status: 'pending',
    authUserId,
    serverVersion: 3,
  };
}

async function seed(queued: PendingMutation[]) {
  const db = await databaseManager.getDatabase('row-sync-supersede');
  await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
  await db.clear(REPLICATION_STORES.REPLICATED_TABLES);
  const row: ReplicatedRow<Show> = {
    tableName: 'shows',
    id: 'show-1',
    data: { id: 'show-1', uses_volunteers: true, uses_paper_packet: true },
    version: 9,
    serverVersion: 6,
    lastSyncedAt: 1,
    lastAccessedAt: 1,
    isDirty: true,
    syncStatus: 'pending',
  };
  await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);
  for (const m of queued) await db.put(REPLICATION_STORES.PENDING_MUTATIONS, m);
  return db;
}

async function queue(db: Awaited<ReturnType<typeof seed>>) {
  const all = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
  return Object.fromEntries(all.map(m => [m.id, m]));
}

/**
 * MYK9-1721 round 8: an UPDATE the server rejected as stale waits in OCC backoff while the user
 * sets the same field again. The newer write uploads first, and its acknowledgement used to
 * restamp EVERY queued write for the row onto the new token, the stale one included, which then
 * uploaded and overwrote the newer value ("volunteers off" sent at version=eq.7 after "on").
 * The acknowledgement now supersedes: an older queued write loses every column the newer one set.
 */
describe('markReplicatedRowSynced — an acknowledged write supersedes older queued ones', () => {
  beforeEach(async () => {
    await databaseManager.reset();
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  it('drops an older queued write of the same field, and the row is clean', async () => {
    const staleOff = mutation('m-off', 1, { uses_volunteers: false });
    const on = mutation('m-on', 4, { uses_volunteers: true });
    const db = await seed([staleOff, on]);

    await markReplicatedRowSynced(db, on, 7);

    expect(Object.keys(await queue(db))).toEqual(['m-on']);
    const stored = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, KEY)) as ReplicatedRow<Show>;
    expect({ isDirty: stored.isDirty, syncStatus: stored.syncStatus }).toEqual({
      isDirty: false,
      syncStatus: 'synced',
    });
  });

  it('keeps the columns the newer write did not set, and the row stays dirty', async () => {
    const older = mutation('m-older', 1, { uses_volunteers: false, uses_paper_packet: true });
    const on = mutation('m-on', 4, { uses_volunteers: true });
    const db = await seed([older, on]);

    await markReplicatedRowSynced(db, on, 7);

    const remaining = (await queue(db))['m-older'];
    expect({ data: remaining?.data, explicitDataKeys: remaining?.explicitDataKeys }).toEqual({
      data: { id: 'show-1', uses_paper_packet: true },
      explicitDataKeys: ['id', 'uses_paper_packet'],
    });
    const stored = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, KEY)) as ReplicatedRow<Show>;
    expect({ isDirty: stored.isDirty, syncStatus: stored.syncStatus }).toEqual({
      isDirty: true,
      syncStatus: 'pending',
    });
  });

  it('leaves a NEWER queued write of the same field alone', async () => {
    const first = mutation('m-first', 1, { uses_volunteers: false });
    const later = mutation('m-later', 4, { uses_volunteers: true });
    const db = await seed([first, later]);

    await markReplicatedRowSynced(db, first, 4);

    expect((await queue(db))['m-later']?.data).toEqual({ id: 'show-1', uses_volunteers: true });
  });

  it("leaves another owner's queued write alone", async () => {
    const theirs = mutation('m-theirs', 1, { uses_volunteers: false }, 'user-2');
    const on = mutation('m-on', 4, { uses_volunteers: true });
    const db = await seed([theirs, on]);

    await markReplicatedRowSynced(db, on, 7);

    expect((await queue(db))['m-theirs']?.data).toEqual({ id: 'show-1', uses_volunteers: false });
  });
});

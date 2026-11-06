import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { markReplicatedRowSynced } from './mutation-row-sync';
import type { PendingMutation, ReplicatedRow } from './types';

type Show = { id: string; usesDeviceScoring: boolean; usesPaperPacket: boolean };

const KEY = ['shows', 'show-1'];

function mutation(id: string, sequenceNumber: number, data: Partial<Show>): PendingMutation {
  return {
    id,
    tableName: 'shows',
    operation: 'UPDATE',
    rowId: 'show-1',
    data: { id: 'show-1', ...data },
    timestamp: sequenceNumber,
    sequenceNumber,
    retries: 0,
    status: 'pending',
    authUserId: 'user-1',
    serverVersion: 3 + sequenceNumber,
  };
}

/**
 * MYK9-1721: an upload's acknowledgement and the next local write race on the same row. The
 * isolated proof caught it: the device-scoring ack read the row, the paper-packet toggle then
 * wrote paper=on and queued its upload, and the ack wrote back its pre-toggle copy marked
 * clean. The server ended paper=on, the tab paper=off at the same version, so no download
 * ever corrected it.
 */
describe('markReplicatedRowSynced — a local write during the acknowledgement (MYK9-1721)', () => {
  beforeEach(async () => {
    await databaseManager.reset();
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  it('keeps a local write that lands between the ack reading the row and writing it', async () => {
    const db = await databaseManager.getDatabase('row-sync-local-write-race');
    const deviceOn = mutation('m-device', 1, { usesDeviceScoring: true });
    const row: ReplicatedRow<Show> = {
      tableName: 'shows',
      id: 'show-1',
      data: { id: 'show-1', usesDeviceScoring: true, usesPaperPacket: false },
      version: 5,
      serverVersion: 4,
      lastSyncedAt: 1,
      lastAccessedAt: 1,
      isDirty: true,
      syncStatus: 'pending',
    };
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row);
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, deviceOn);

    // Not awaited: the paper toggle is issued while the acknowledgement is in flight, the way
    // the UI's next click lands while the previous upload's ack is being applied.
    const ack = markReplicatedRowSynced(db, deviceOn, 5);
    const paperOn = mutation('m-paper', 2, { usesPaperPacket: true });
    const toggle = (async () => {
      const tx = db.transaction(
        [REPLICATION_STORES.REPLICATED_TABLES, REPLICATION_STORES.PENDING_MUTATIONS],
        'readwrite'
      );
      const rows = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
      const current = (await rows.get(KEY)) as ReplicatedRow<Show>;
      await rows.put({
        ...current,
        data: { ...current.data, usesPaperPacket: true },
        version: current.version + 1,
        isDirty: true,
        syncStatus: 'pending',
      });
      await tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).put(paperOn);
      await tx.done;
    })();
    await Promise.all([ack, toggle]);

    const stored = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, KEY)) as ReplicatedRow<Show>;
    expect({
      data: stored.data,
      isDirty: stored.isDirty,
      syncStatus: stored.syncStatus,
    }).toEqual({
      data: { id: 'show-1', usesDeviceScoring: true, usesPaperPacket: true },
      isDirty: true,
      syncStatus: 'pending',
    });
  });
});

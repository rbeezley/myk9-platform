import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationManager } from '../MutationManager';
import { MutationQueueStore } from '../MutationQueueStore';
import { QUEUE_MAX_SIZE } from '../mutation-queue-capacity';
import {
  AUTH_USER_ID,
  PlainEntriesTable,
  pendingFor,
  resetForStaleRowTest,
  startStaleRowManager,
  teardownStaleRowTest,
} from '../test-utils/staleRowRefetchFixtures';
import type { PendingMutation } from '../types';
import { databaseManager, REPLICATION_STORES } from './DatabaseManager';

/**
 * MYK9-1471: a write method's local dirty write and its queued mutation succeed
 * or fail together. A failed enqueue leaves the row untouched; a failed local
 * write leaves no mutation behind.
 */

class WritingTable extends PlainEntriesTable {
  async edit(id: string, status: string) {
    return this.writeAndQueue(
      id,
      { id, status, finalPlacement: null },
      { operation: 'UPDATE', payload: { id, status } }
    );
  }
}

class RevertingWritingTable extends WritingTable {
  protected override readonly revertsOnDiscard = true;
}

function refusingServer(): SupabaseClient {
  const refused = { data: null, error: { code: '42501', message: 'permission denied' } };
  const builder = { eq: () => builder, select: async () => refused };
  return { from: () => ({ update: () => builder }) } as unknown as SupabaseClient;
}

/** The row fields a write owns; reads bump access bookkeeping, which is not a write. */
async function snapshot(table: WritingTable) {
  const row = await table.getReplicatedRow('1');
  return {
    data: row?.data,
    isDirty: row?.isDirty,
    syncStatus: row?.syncStatus,
    serverVersion: row?.serverVersion,
    version: row?.version,
    baseData: row?.baseData,
  };
}

/** Nothing may be waiting on the row: no revision, deferred count or lock. */
function expectNoDanglingState(table: WritingTable) {
  const internals = table as unknown as Record<string, Map<string, unknown>>;
  for (const name of [
    'pendingWriteRevisions',
    'deferredMutationRows',
    'deferredWriteLocks',
    'pendingWriteLocks',
  ]) {
    expect(internals[name]!.size, name).toBe(0);
  }
}

describe('ReplicatedTable.writeAndQueue (MYK9-1471)', () => {
  let manager: MutationManager | undefined;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });

  afterEach(() => teardownStaleRowTest(manager));

  async function start(table: WritingTable, supabase = refusingServer()) {
    manager = startStaleRowManager(table, supabase).manager;
    await table.set('1', { id: '1', status: 'scored', finalPlacement: null }, false, undefined, 3);
  }

  async function fillBacklog() {
    const db = await databaseManager.getDatabase('test');
    const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
    for (let i = 0; i < QUEUE_MAX_SIZE; i++) {
      const filler: PendingMutation = {
        id: `filler-${i}`,
        authUserId: AUTH_USER_ID,
        tableName: 'filler',
        operation: 'UPDATE',
        rowId: `f${i}`,
        data: {},
        timestamp: Date.now(),
        retries: 0,
        status: 'pending',
      };
      void tx.store.put(filler);
    }
    await tx.done;
  }

  const failures: Array<[string, () => void, RegExp]> = [
    [
      'a full backlog',
      () => void 0, // the backlog is filled by the test body
      /overflow/,
    ],
    [
      'an IndexedDB failure',
      () =>
        void vi
          .spyOn(MutationQueueStore.prototype, 'queueMutation')
          .mockRejectedValueOnce(new DOMException('disk full', 'QuotaExceededError')),
      /disk full/,
    ],
  ];

  describe.each(failures)('when the enqueue fails on %s', (label, arrange, message) => {
    for (const startDirty of [false, true]) {
      it(`leaves a ${startDirty ? 'dirty' : 'clean'} row exactly as it was`, async () => {
        const table = new WritingTable(tableName);
        await start(table);
        if (startDirty) await table.edit('1', 'earlier');
        const before = await snapshot(table);
        const pendingBefore = await pendingFor(tableName);
        if (label === 'a full backlog') await fillBacklog();
        arrange();

        await expect(table.edit('1', 'lost')).rejects.toThrow(message);

        expect(await snapshot(table)).toEqual(before);
        expect(await pendingFor(tableName)).toEqual(pendingBefore);
        if (!startDirty) expectNoDanglingState(table);

        // A dangling lock would hang this write; a dangling revision would
        // stamp it too old.
        if (label === 'a full backlog') {
          const db = await databaseManager.getDatabase('test');
          await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
        }
        await table.edit('1', 'saved');
        expect((await table.getReplicatedRow('1'))?.data.status).toBe('saved');
      });
    }
  });

  it('removes the queued mutation when the local write throws', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    const before = await snapshot(table);
    vi.spyOn(table as unknown as { setOnce: () => unknown }, 'setOnce').mockRejectedValueOnce(
      new Error('put failed')
    );

    await expect(table.edit('1', 'lost')).rejects.toThrow('put failed');

    expect(await pendingFor(tableName)).toEqual([]);
    expect(await snapshot(table)).toEqual(before);
    expectNoDanglingState(table);
    await table.edit('1', 'saved');
    expect(await pendingFor(tableName)).toHaveLength(1);
  });

  it('stamps the mutation with the revision its own write produced', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    const before = (await table.getReplicatedRow('1'))!.version;

    const { mutationId, result } = await table.edit('1', 'done');

    expect(result).toEqual({ written: true });
    const [queued] = await pendingFor(tableName);
    expect(queued?.id).toBe(mutationId);
    expect(queued?.rowRevision).toBe(before + 1);
    expectNoDanglingState(table);
  });

  it('still reverts on Discard for a table that opts in', async () => {
    const table = new RevertingWritingTable(tableName);
    await start(table);
    const { mutationId } = await table.edit('1', 'done');
    await manager!.uploadPendingMutations();
    const db = await databaseManager.getDatabase('test');
    await vi.waitFor(async () =>
      expect(await db.get(REPLICATION_STORES.FAILED_MUTATIONS, mutationId!)).toBeDefined()
    );

    await manager!.discardFailedMutation(mutationId!);

    const row = await table.getReplicatedRow('1');
    expect(row?.data.status).toBe('scored');
    expect(row?.isDirty).toBe(false);
    expect(row?.serverVersion).toBe(3);
  });

  it('writes the row without a mutation when no MutationManager is set', async () => {
    const table = new WritingTable(tableName);
    const { mutationId, result } = await table.edit('9', 'offline-only');
    expect(mutationId).toBeNull();
    expect(result).toEqual({ written: true } as const);
  });
});

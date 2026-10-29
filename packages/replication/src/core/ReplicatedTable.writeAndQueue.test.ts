import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationManager } from '../MutationManager';
import { QUEUE_MAX_SIZE } from '../mutation-queue-capacity';
import {
  AUTH_USER_ID,
  PlainEntriesTable,
  pendingFor,
  makeServer,
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

  /** Fail the next write into one object store while every other write passes through. */
  function failNextPutInto(storeName: string, error: Error) {
    const put = IDBObjectStore.prototype.put;
    let armed = true;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (armed && this.name === storeName) {
        armed = false;
        throw error;
      }
      return put.apply(this, args);
    });
  }

  const failures: Array<[string, (table: WritingTable) => void, RegExp]> = [
    ['a full backlog', () => void 0, /overflow/],
    [
      'an IndexedDB failure building the mutation',
      () =>
        void vi
          .spyOn(MutationManager.prototype, 'prepareMutation')
          .mockRejectedValueOnce(new DOMException('disk full', 'QuotaExceededError')),
      /disk full/,
    ],
    [
      'the mutation put, after the row put was issued',
      () => failNextPutInto(REPLICATION_STORES.PENDING_MUTATIONS, new Error('mutation put failed')),
      /mutation put failed/,
    ],
    [
      'the row put',
      () => failNextPutInto(REPLICATION_STORES.REPLICATED_TABLES, new Error('row put failed')),
      /row put failed/,
    ],
  ];

  describe.each(failures)('when the write fails on %s', (label, arrange, message) => {
    for (const startDirty of [false, true]) {
      it(`leaves a ${startDirty ? 'dirty' : 'clean'} row and the queue exactly as they were`, async () => {
        const table = new WritingTable(tableName);
        await start(table);
        if (startDirty) await table.edit('1', 'earlier');
        const before = await snapshot(table);
        const pendingBefore = await pendingFor(tableName);
        if (label === 'a full backlog') await fillBacklog();
        arrange(table);

        await expect(table.edit('1', 'lost')).rejects.toThrow(message);
        vi.restoreAllMocks();

        expect(await snapshot(table)).toEqual(before);
        expect(await pendingFor(tableName)).toEqual(pendingBefore);

        // A dangling lock would hang this write.
        if (label === 'a full backlog') {
          const db = await databaseManager.getDatabase('test');
          await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
        }
        await table.edit('1', 'saved');
        expect((await table.getReplicatedRow('1'))?.data.status).toBe('saved');
      });
    }
  });

  it('writes the row and the mutation in one transaction over both stores', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    const spanned: string[][] = [];
    const open = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      spanned.push(typeof args[0] === 'string' ? [args[0]] : [...args[0]]);
      return open.apply(this, args);
    });

    await table.edit('1', 'done');

    expect(
      spanned.some(
        stores =>
          stores.includes(REPLICATION_STORES.REPLICATED_TABLES) &&
          stores.includes(REPLICATION_STORES.PENDING_MUTATIONS)
      )
    ).toBe(true);
  });

  it('never lets an upload pass run ahead of the dirty row', async () => {
    const table = new WritingTable(tableName);
    const server = makeServer({ status: 'scored', final_placement: null, version: 3 });
    manager = startStaleRowManager(table, server.supabase).manager;
    await table.set('1', { id: '1', status: 'scored', finalPlacement: null }, false, undefined, 3);

    // Upload passes hammer the queue while the write is in flight.
    let writing = true;
    const passes = (async () => {
      while (writing) await manager!.uploadPendingMutations();
    })();
    const { mutationId } = await table.edit('1', 'done');
    writing = false;
    await passes;
    await manager!.uploadPendingMutations();

    // Sent exactly once, and the row it belongs to is no longer pending.
    expect(mutationId).not.toBeNull();
    expect(server.updates).toHaveLength(1);
    expect(await pendingFor(tableName)).toEqual([]);
    const row = await table.getReplicatedRow('1');
    expect(row?.isDirty).toBe(false);
    expect(row?.data.status).toBe('done');
  });

  it('queues nothing when the row write stores nothing', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    vi.spyOn(
      table as unknown as { coldInsertGuardMode: () => string },
      'coldInsertGuardMode'
    ).mockReturnValue('skip');

    const { mutationId, result } = await table.edit('absent-row', 'x');

    expect(result.written).toBe(false);
    expect(mutationId).toBeNull();
    expect(await pendingFor(tableName)).toEqual([]);
  });

  it('releases the write lock when the identity lookup throws mid-write', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    // A one-slot gate standing in for sharedMutationManager's cache-clear lock.
    let tail: Promise<void> = Promise.resolve();
    manager!.acquireMutationWriteLock = () => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>(resolve => (release = resolve));
      return previous.then(() => release);
    };
    vi.spyOn(
      table as unknown as { rowOwnerFor: () => unknown },
      'rowOwnerFor'
    ).mockRejectedValueOnce(new Error('getSession failed'));

    await expect(table.edit('1', 'lost')).rejects.toThrow('getSession failed');

    const acquired = await Promise.race([
      manager!.acquireMutationWriteLock().then(() => 'acquired'),
      new Promise<string>(resolve => setTimeout(() => resolve('still locked'), 500)),
    ]);
    expect(acquired).toBe('acquired');
    expect(await pendingFor(tableName)).toEqual([]);
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

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationManager } from '../MutationManager';
import { QUEUE_MAX_SIZE } from '../mutation-queue-capacity';
import { evictCleanCacheRows } from '../quota-eviction';
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

  it('still queues the mutation, alone, when the cold-insert guard refuses the row write', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    vi.spyOn(
      table as unknown as { coldInsertGuardMode: () => string },
      'coldInsertGuardMode'
    ).mockReturnValue('skip');

    const { mutationId, result } = await table.edit('absent-row', 'x');

    expect(result.written).toBe(false);
    expect(mutationId).not.toBeNull();
    const queued = await pendingFor(tableName);
    expect(queued.map(m => [m.id, m.rowId])).toEqual([[mutationId, 'absent-row']]);
    expect(await table.getReplicatedRow('absent-row')).toBeNull();
  });

  it('numbers overlapping writes in the order they commit, not the order they prepared', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    await table.set('2', { id: '2', status: 'scored', finalPlacement: null }, false, undefined, 3);
    // The first write finishes preparing, then stalls before its transaction.
    let openGate!: () => void;
    const gate = new Promise<void>(resolve => (openGate = resolve));
    const prepare = MutationManager.prototype.prepareMutation;
    vi.spyOn(MutationManager.prototype, 'prepareMutation').mockImplementationOnce(async function (
      this: MutationManager,
      ...args: Parameters<typeof prepare>
    ) {
      const prepared = await prepare.apply(this, args);
      await gate;
      return prepared;
    });

    const first = table.edit('1', 'first-prepared');
    await vi.waitFor(() => expect(MutationManager.prototype.prepareMutation).toHaveBeenCalled());
    await table.edit('2', 'second-committed');
    openGate();
    await first;

    const bySequence = (await pendingFor(tableName)).sort(
      (a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)
    );
    expect(bySequence.map(m => m.rowId)).toEqual(['2', '1']);
    expect(new Set(bySequence.map(m => m.sequenceNumber)).size).toBe(2);
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

  // Codex round 3: the mutation is in the row's transaction, so a full disk must be relieved
  // across tables as the queue store does, not only from this table's clean rows.
  it('frees clean rows of another table when its own table has none to give', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    await table.edit('1', 'first'); // the only row in this table is now dirty, so protected
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
      tableName: 'other_table',
      id: 'spare',
      data: {},
      isDirty: false,
      version: 1,
      lastAccessedAt: 1,
    });
    const quota = new Error('QuotaExceededError');
    quota.name = 'AbortError';
    failNextPutInto(REPLICATION_STORES.PENDING_MUTATIONS, quota);

    const { mutationId, result } = await table.edit('1', 'second');

    expect(result.written).toBe(true);
    expect(mutationId).not.toBeNull();
    expect(await db.get(REPLICATION_STORES.REPLICATED_TABLES, ['other_table', 'spare'])).toBe(
      undefined
    );
    expect((await table.getReplicatedRow('1'))?.data).toMatchObject({ status: 'second' });
  });

  // Codex round 4: a quota retry that finds its own clean row evicted rebuilds it, and the
  // queued UPDATE must keep the server version the first attempt read as its OCC check.
  // Codex rounds 4-5: quota relief must never evict the row being written. A rebuilt row
  // would lose its OCC token and its Discard snapshot (baseData, baseServerVersion).
  it('per-table quota relief never evicts the row being written', async () => {
    const table = new WritingTable(tableName);
    await start(table); // row 1 is clean at server version 3
    const db = await databaseManager.getDatabase('test');
    // Make row 1 the oldest, least-used, otherwise evictable row in its table.
    const seeded = await db.get(REPLICATION_STORES.REPLICATED_TABLES, [tableName, '1']);
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
      ...seeded,
      lastAccessedAt: 1,
      lastModifiedAt: 1,
      accessCount: 1,
    });
    const quota = new Error('QuotaExceededError');
    quota.name = 'AbortError';
    failNextPutInto(REPLICATION_STORES.PENDING_MUTATIONS, quota);

    const { mutationId } = await table.edit('1', 'after-relief');

    const queued = (await db.get(REPLICATION_STORES.PENDING_MUTATIONS, mutationId!)) as
      PendingMutation | undefined;
    expect(queued?.serverVersion).toBe(3);
    const row = await table.getReplicatedRow('1');
    expect(row?.serverVersion).toBe(3);
    expect(row?.baseData).toMatchObject({ status: 'scored' });
  });

  it('cross-table eviction never deletes the row being written or a dirty row', async () => {
    const db = await databaseManager.getDatabase('test');
    const row = (table: string, id: string, isDirty: boolean, lastAccessedAt: number) => ({
      tableName: table,
      id,
      data: {},
      isDirty,
      version: 1,
      lastAccessedAt,
    });
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row('t', 'target', false, 1));
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row('t', 'dirty', true, 2));
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, row('u', 'spare', false, 3));

    expect(await evictCleanCacheRows(db, ['t', 'target'])).toBe(1);

    const left = async (table: string, id: string) =>
      (await db.get(REPLICATION_STORES.REPLICATED_TABLES, [table, id])) !== undefined;
    expect(await left('t', 'target')).toBe(true);
    expect(await left('t', 'dirty')).toBe(true);
    expect(await left('u', 'spare')).toBe(false);
  });

  it('writes the row without a mutation when no MutationManager is set', async () => {
    const table = new WritingTable(tableName);
    const { mutationId, result } = await table.edit('9', 'offline-only');
    expect(mutationId).toBeNull();
    expect(result).toEqual({ written: true } as const);
  });
});

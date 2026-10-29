import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationManager } from '../MutationManager';
import { HELD_FOR_LOCAL_WRITE_TTL_MS } from '../mutation-hold';
import {
  AUTH_USER_ID,
  PlainEntriesTable,
  makeServer,
  pendingFor,
  resetForStaleRowTest,
  startStaleRowManager,
  teardownStaleRowTest,
} from '../test-utils/staleRowRefetchFixtures';
import type { PendingMutation } from '../types';
import { databaseManager, REPLICATION_STORES } from './DatabaseManager';

/**
 * A mutation queued ahead of its dirty row write is held: no upload pass may
 * send (and delete) it before the write lands (MYK9-1471).
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

describe('deferred mutation hold (MYK9-1471)', () => {
  let manager: MutationManager | undefined;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });

  afterEach(() => teardownStaleRowTest(manager));

  async function start(table: WritingTable) {
    const server = makeServer({ status: 'scored', final_placement: null, version: 3 });
    manager = startStaleRowManager(table, server.supabase).manager;
    await table.set('1', { id: '1', status: 'scored', finalPlacement: null }, false, undefined, 3);
    return server;
  }

  /** Hold the next local write open until `open()` is called. */
  function gateNextWrite(table: WritingTable) {
    let open!: () => void;
    const gate = new Promise<void>(resolve => (open = resolve));
    const setOnce = (table as unknown as { setOnce: (...args: unknown[]) => Promise<unknown> })
      .setOnce;
    vi.spyOn(table as unknown as { setOnce: typeof setOnce }, 'setOnce').mockImplementationOnce(
      async function (this: unknown, ...args: unknown[]) {
        await gate;
        return setOnce.apply(table, args);
      }
    );
    return open;
  }

  it('does not upload a deferred mutation before its dirty write lands', async () => {
    const table = new WritingTable(tableName);
    const server = await start(table);
    const before = (await table.getReplicatedRow('1'))!.version;
    const openWrite = gateNextWrite(table);

    const editing = table.edit('1', 'done');
    await vi.waitFor(async () => expect(await pendingFor(tableName)).toHaveLength(1));

    // Another flush (reconnect, interval, another row's upload) runs mid-write.
    await manager!.uploadPendingMutations();

    expect(server.updates).toHaveLength(0);
    expect(await pendingFor(tableName)).toHaveLength(1);

    openWrite();
    const { mutationId } = await editing;

    const [released] = await pendingFor(tableName);
    expect(released?.id).toBe(mutationId);
    expect(released?.heldForLocalWrite).toBeUndefined();
    expect(released?.rowRevision).toBe(before + 1);

    await manager!.uploadPendingMutations();
    expect(server.updates).toHaveLength(1);
    expect(await pendingFor(tableName)).toEqual([]);
    expect((await table.getReplicatedRow('1'))?.isDirty).toBe(false);
  });

  it('keeps a mutation that depends on a held one back too', async () => {
    const table = new WritingTable(tableName);
    const server = await start(table);
    const openWrite = gateNextWrite(table);
    const editing = table.edit('1', 'done');
    await vi.waitFor(async () => expect(await pendingFor(tableName)).toHaveLength(1));
    const [held] = await pendingFor(tableName);
    await manager!.queueMutation(tableName, 'UPDATE', '2', { id: '2', status: 'x' }, [held!.id]);

    await manager!.uploadPendingMutations();
    expect(server.updates).toHaveLength(0);

    openWrite();
    await editing;
  });

  describe('crash recovery', () => {
    async function putHeld(id: string, heldAt: number) {
      const db = await databaseManager.getDatabase('test');
      const mutation: PendingMutation = {
        id,
        authUserId: AUTH_USER_ID,
        tableName,
        operation: 'UPDATE',
        rowId: '1',
        data: { id: '1', status: 'crashed' },
        timestamp: heldAt,
        retries: 0,
        status: 'pending',
        heldForLocalWrite: heldAt,
      };
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
    }

    it('releases a hold left by a tab that died mid-write when the manager starts up', async () => {
      const table = new WritingTable(tableName);
      const server = await start(table);
      await putHeld('abandoned', Date.now() - HELD_FOR_LOCAL_WRITE_TTL_MS - 1_000);

      await manager!.restoreMutationsFromLocalStorage();
      await manager!.uploadPendingMutations();

      expect(server.updates).toHaveLength(1);
      expect(await pendingFor(tableName)).toEqual([]);
    });

    it('leaves a live write hold alone', async () => {
      const table = new WritingTable(tableName);
      const server = await start(table);
      await putHeld('live', Date.now());

      await manager!.restoreMutationsFromLocalStorage();
      await manager!.uploadPendingMutations();

      expect(server.updates).toHaveLength(0);
      const [still] = await pendingFor(tableName);
      expect(still?.heldForLocalWrite).toBeDefined();
    });

    it('does not let an abandoned hold block upload before any startup sweep', async () => {
      const table = new WritingTable(tableName);
      const server = await start(table);
      await putHeld('abandoned', Date.now() - HELD_FOR_LOCAL_WRITE_TTL_MS - 1_000);

      await manager!.uploadPendingMutations();

      expect(server.updates).toHaveLength(1);
    });
  });

  it('releases the cache-clear gate lock when the identity lookup throws mid-write', async () => {
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

  it('announces the rollback so pending-count UIs drop the removed mutation', async () => {
    const table = new WritingTable(tableName);
    await start(table);
    const counts: Promise<number>[] = [];
    const onQueued = () => counts.push(manager!.getPendingCount());
    window.addEventListener('replication:mutation-queued', onQueued);
    vi.spyOn(table as unknown as { setOnce: () => unknown }, 'setOnce').mockRejectedValueOnce(
      new Error('put failed')
    );

    await expect(table.edit('1', 'lost')).rejects.toThrow('put failed');
    window.removeEventListener('replication:mutation-queued', onQueued);

    // Enqueue announces +1; the rollback must announce again, after removal.
    expect(counts).toHaveLength(2);
    expect(await Promise.all(counts)).toContain(0);
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { MutationManager } from './MutationManager';
import type { RowRefetchAdapter } from './refetchDirtyRowsById';
import {
  adapterFor,
  PlainEntriesTable,
  resetForStaleRowTest,
  startStaleRowManager,
  teardownStaleRowTest,
  type LocalEntry,
  type RemoteEntry,
  type ServerRow,
} from './test-utils/staleRowRefetchFixtures';
import type { PendingMutation } from './types';

/**
 * MYK9-1076: Discard of a refused edit puts the device's row back to the last
 * server state it knew, but only when that edit is the newest thing written to
 * the row and nothing else still names the row.
 */

/** A server that refuses every UPDATE for good (an RLS denial). */
function refusingServer(): SupabaseClient {
  const refused = { data: null, error: { code: '42501', message: 'permission denied' } };
  const builder = {
    eq: () => builder,
    select: async () => refused,
  };
  return { from: () => ({ update: () => builder }) } as unknown as SupabaseClient;
}

class EditableEntriesTable extends PlainEntriesTable {
  /** The dogs write pair: a dirty local write, then the queued full-row UPDATE. */
  async edit(id: string, status: string): Promise<string | null> {
    await this.set(id, { id, status, finalPlacement: null }, true);
    return this.queueMutation('UPDATE', id, { id, status });
  }

  /** Queue an UPDATE with no local write of its own. */
  async queueOnly(id: string, status: string): Promise<string | null> {
    return this.queueMutation('UPDATE', id, { id, status });
  }
}

class RevertingEntriesTable extends EditableEntriesTable {
  protected override readonly revertsOnDiscard = true;
}

/** Reverting, and able to fetch one row from the server for the online step. */
class RefetchingRevertingTable extends RevertingEntriesTable {
  constructor(
    tableName: string,
    private readonly adapter: RowRefetchAdapter<RemoteEntry, LocalEntry>
  ) {
    super(tableName);
  }

  protected override getRowRefetchAdapter(): RowRefetchAdapter<RemoteEntry, LocalEntry> {
    return this.adapter;
  }
}

/** A server that accepts the first UPDATE (to version 4) and refuses the rest. */
function acceptFirstServer(): SupabaseClient {
  let calls = 0;
  const builder = {
    eq: () => builder,
    select: async () =>
      ++calls === 1
        ? { data: [{ id: '1', version: 4 }], error: null }
        : { data: null, error: { code: '42501', message: 'permission denied' } },
  };
  return { from: () => ({ update: () => builder }) } as unknown as SupabaseClient;
}

describe('Discard reverts the row (MYK9-1076)', () => {
  let manager: MutationManager | undefined;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });

  afterEach(() => teardownStaleRowTest(manager));

  async function start(table: EditableEntriesTable, supabase = refusingServer()) {
    manager = startStaleRowManager(table, supabase).manager;
    // A clean row the server holds at version 3.
    await table.set('1', { id: '1', status: 'scored', finalPlacement: null }, false, undefined, 3);
  }

  async function failedIds(): Promise<string[]> {
    const db = await databaseManager.getDatabase('test');
    const all = (await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[];
    return all.filter(m => m.tableName === tableName).map(m => m.id);
  }

  /** Let the refusal land: the upload moves every queued write to failed. */
  async function refuseAll(count: number) {
    await manager!.uploadPendingMutations();
    await vi.waitFor(async () => expect(await failedIds()).toHaveLength(count));
  }

  it('restores the last server state, clears dirty and notifies listeners', async () => {
    const table = new RevertingEntriesTable(tableName);
    await start(table);
    const id = await table.edit('1', 'done');
    await refuseAll(1);
    const listener = vi.fn();
    const unsubscribe = table.subscribe(listener, { emitCurrent: false });

    await manager!.discardFailedMutation(id!);

    const row = await table.getReplicatedRow('1');
    expect(row?.data.status).toBe('scored');
    expect(row?.isDirty).toBe(false);
    expect(row?.syncStatus).toBe('synced');
    expect(row?.serverVersion).toBe(3);
    expect(row?.baseData).toBeUndefined();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    unsubscribe();
  });

  it('stamps each queued write with the revision its own local write produced', async () => {
    const table = new RevertingEntriesTable(tableName);
    await start(table);
    const before = (await table.getReplicatedRow('1'))!.version;

    // Two dirty writes land before either queues: each mutation still gets
    // the revision of its OWN write, not the row's revision at queue time.
    await table.set('1', { id: '1', status: 'first', finalPlacement: null }, true);
    await table.set('1', { id: '1', status: 'second', finalPlacement: null }, true);
    await table.queueOnly('1', 'first');
    await table.queueOnly('1', 'second');
    const db = await databaseManager.getDatabase('test');
    const queued = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
    const mine = queued
      .filter(m => m.tableName === tableName)
      .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
    expect(mine.map(m => m.rowRevision)).toEqual([before + 1, before + 2]);
  });

  it('keeps a newer local write that was never queued (write-before-queue)', async () => {
    const table = new RevertingEntriesTable(tableName);
    await start(table);
    const id = await table.edit('1', 'done');
    await refuseAll(1);
    // A newer edit wrote the row but has not reached the queue yet.
    await table.set('1', { id: '1', status: 'newer', finalPlacement: null }, true);

    await manager!.discardFailedMutation(id!);

    const row = await table.getReplicatedRow('1');
    expect(row?.data.status).toBe('newer');
    expect(row?.isDirty).toBe(true);
  });

  it('keeps the row while a newer write for it is still queued', async () => {
    const table = new RevertingEntriesTable(tableName);
    await start(table);
    const id = await table.edit('1', 'done');
    await refuseAll(1);
    // Queued, but held back from upload so it stays pending.
    await table.set('1', { id: '1', status: 'newer', finalPlacement: null }, true);
    const db = await databaseManager.getDatabase('test');
    const newer: PendingMutation = {
      id: 'newer-pending',
      authUserId: 'stale-row-refetch-user',
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', status: 'newer' },
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      nextRetryAt: Date.now() + 3_600_000,
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, newer);
    // Even a stamp that matches must not revert while another write names the row.
    const failed = (await db.get(REPLICATION_STORES.FAILED_MUTATIONS, id!)) as PendingMutation;
    const current = (await table.getReplicatedRow('1'))!.version;
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, { ...failed, rowRevision: current });

    await manager!.discardFailedMutation(id!);

    expect((await table.getReplicatedRow('1'))?.data.status).toBe('newer');
  });

  it('keeps the row while a sibling failed write names it', async () => {
    const table = new RevertingEntriesTable(tableName);
    await start(table);
    const first = await table.edit('1', 'done');
    await table.edit('1', 'done again');
    await refuseAll(2);
    const db = await databaseManager.getDatabase('test');
    const failed = (await db.get(REPLICATION_STORES.FAILED_MUTATIONS, first!)) as PendingMutation;
    const current = (await table.getReplicatedRow('1'))!.version;
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, { ...failed, rowRevision: current });

    await manager!.discardFailedMutation(first!);

    const row = await table.getReplicatedRow('1');
    expect(row?.data.status).toBe('done again');
    expect(row?.isDirty).toBe(true);
  });

  it('leaves a table that has not opted in unchanged', async () => {
    const table = new EditableEntriesTable(tableName);
    await start(table);
    const id = await table.edit('1', 'done');
    await refuseAll(1);

    await manager!.discardFailedMutation(id!);

    const row = await table.getReplicatedRow('1');
    expect(row?.data.status).toBe('done');
    expect(row?.isDirty).toBe(true);
  });

  it('leaves the row when the write carries no revision (queued without a local write)', async () => {
    const table = new RevertingEntriesTable(tableName);
    await start(table);
    const id = await table.edit('1', 'done');
    await refuseAll(1);
    const db = await databaseManager.getDatabase('test');
    const failed = (await db.get(REPLICATION_STORES.FAILED_MUTATIONS, id!)) as PendingMutation;
    const unstamped = { ...failed };
    delete unstamped.rowRevision;
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, unstamped);

    await manager!.discardFailedMutation(id!);

    expect((await table.getReplicatedRow('1'))?.data.status).toBe('done');
  });

  describe('after an own upload was accepted while the row stayed dirty', () => {
    // First edit uploads (server -> version 4), second is refused. The base still
    // predates both edits, so restoring it would undo the accepted first edit.
    async function acceptedThenRefused(table: EditableEntriesTable) {
      await start(table, acceptFirstServer());
      await table.edit('1', 'first');
      const second = await table.edit('1', 'second');
      await refuseAll(1);
      return second!;
    }

    it('does not restore the stale base offline', async () => {
      const table = new RevertingEntriesTable(tableName);
      const second = await acceptedThenRefused(table);

      await manager!.discardFailedMutation(second);

      const row = await table.getReplicatedRow('1');
      expect(row?.data.status).toBe('second');
      expect(row?.isDirty).toBe(true);
    });

    it("online, replaces the row with the server's copy", async () => {
      const server: ServerRow = { status: 'first', final_placement: null, version: 4 };
      const table = new RefetchingRevertingTable(tableName, adapterFor(server));
      const second = await acceptedThenRefused(table);

      await manager!.discardFailedMutation(second);

      await vi.waitFor(async () => {
        const row = await table.getReplicatedRow('1');
        expect(row?.data.status).toBe('first');
        expect(row?.isDirty).toBe(false);
        expect(row?.serverVersion).toBe(4);
      });
    });
  });

  it('online, a revert is followed by the newer server value', async () => {
    const server: ServerRow = { status: 'changed elsewhere', final_placement: 1, version: 5 };
    const table = new RefetchingRevertingTable(tableName, adapterFor(server));
    await start(table);
    const id = await table.edit('1', 'done');
    await refuseAll(1);

    await manager!.discardFailedMutation(id!);

    await vi.waitFor(async () => {
      const row = await table.getReplicatedRow('1');
      expect(row?.data).toEqual({ id: '1', status: 'changed elsewhere', finalPlacement: 1 });
      expect(row?.serverVersion).toBe(5);
    });
  });

  it('the re-fetch never replaces a local edit made after the discard', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const server: ServerRow = { status: 'server', final_placement: null, version: 5 };
    const adapter = adapterFor(server, async () => {
      await gate;
      return [{ id: '1', ...server }];
    });
    const table = new RefetchingRevertingTable(tableName, adapter);
    await start(table);
    const id = await table.edit('1', 'done');
    await refuseAll(1);

    await manager!.discardFailedMutation(id!);
    await table.set('1', { id: '1', status: 'newer', finalPlacement: null }, true);
    release();

    await vi.waitFor(() => expect(adapter.fetchRowsById).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    const row = await table.getReplicatedRow('1');
    expect(row?.data.status).toBe('newer');
    expect(row?.isDirty).toBe(true);
  });

  it('announces the replaced row so the app can refresh its caches', async () => {
    const table = new RevertingEntriesTable(tableName);
    await start(table);
    const id = await table.edit('1', 'done');
    await refuseAll(1);
    const events: unknown[] = [];
    const listen = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener('replication:discard-row-replaced', listen);

    await manager!.discardFailedMutation(id!);

    window.removeEventListener('replication:discard-row-replaced', listen);
    expect(events).toEqual([{ tableName, rowId: '1' }]);
  });
});

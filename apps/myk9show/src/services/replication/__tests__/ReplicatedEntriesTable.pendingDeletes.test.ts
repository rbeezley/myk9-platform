/**
 * MYK9-762: an entry deleted here is still counted by the server until its
 * queued DELETE uploads. The entries sync hands the engine exactly those
 * entries (this show's, server-backed, queued), so the pending delete does
 * not read as a missing row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import type {
  MutationManager,
  PendingMutation,
  SyncReplicatedTableAdapter,
} from '@myk9/replication';

const engine = vi.hoisted(() => ({ adapters: [] as unknown[] }));

vi.mock('@myk9/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@myk9/replication')>();
  return {
    ...actual,
    syncReplicatedTable: vi.fn(async (_table: unknown, adapter: unknown) => {
      engine.adapters.push(adapter);
      return { tableName: 'entries', success: true, operation: 'incremental-sync' };
    }),
  };
});

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ReplicatedEntriesTable, type ReplicatedEntry } from '../ReplicatedEntriesTable';
import { deletePayload } from '../pendingDeletes';

describe('ReplicatedEntriesTable pending deletes (MYK9-762)', () => {
  let table: ReplicatedEntriesTable;
  let pending: PendingMutation[];
  let discardPending: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    engine.adapters.length = 0;
    pending = [];
    discardPending = vi.fn(async (_tableName: string, rowId: string) => {
      pending = pending.filter(mutation => mutation.rowId !== rowId);
    });
    table = new ReplicatedEntriesTable();
    table.setMutationManager(
      fromAny<MutationManager, unknown>({
        rowRefetchers: { register: () => () => undefined },
        queueMutation: async (
          tableName: string,
          operation: PendingMutation['operation'],
          rowId: string,
          data: Record<string, unknown>
        ) => {
          pending.push(fromAny<PendingMutation, unknown>({ tableName, operation, rowId, data }));
          return `m-${pending.length}`;
        },
        getPendingMutationsForTable: async (tableName: string) =>
          pending.filter(mutation => mutation.tableName === tableName),
        discardPendingMutationsForRow: discardPending,
        getPendingCount: async () => pending.length,
      })
    );
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  const seed = (entry: ReplicatedEntry, isDirty = false) =>
    table.set(entry.id, entry, isDirty, undefined, undefined, {
      allowColdInsert: 'test fixture standing in for the sync download',
    });

  it('recognizes a queued cold create even when the row was not cached', async () => {
    pending.push(
      fromAny<PendingMutation, unknown>({
        tableName: 'entries',
        operation: 'INSERT',
        rowId: 'cold-entry',
        data: { id: 'cold-entry', show_id: 'show-1' },
      })
    );

    expect(await table.getEntriesByShow('show-1')).toEqual([]);
    expect(await table.hasPendingWritesForShow('show-1')).toBe(true);
    expect(await table.hasPendingWritesForShow('show-2')).toBe(false);
  });

  /**
   * A DELETE an earlier client queued. No app path queues an entry DELETE any
   * more (CRUD standard Phase 2: soft_delete_entry), but a device can still hold
   * one, and the sync must keep honouring it.
   */
  const queuedDeleteFromEarlierClient = async (id: string) => {
    const row = await table.get(id);
    pending.push(
      fromAny<PendingMutation, unknown>({
        tableName: 'entries',
        operation: 'DELETE',
        rowId: id,
        data: deletePayload(id, row),
      })
    );
    await table.delete(id);
  };

  it('exposes no method that queues an entry DELETE (soft delete goes through the RPC)', () => {
    expect('deleteEntry' in table).toBe(false);
  });

  it('hands the sync engine this show’s server-backed deletes that are still queued', async () => {
    await seed({ id: 'e1', classId: 'c1', showId: 'show-1' });
    await seed({ id: 'e2', classId: 'c1', showId: 'show-2' });
    await seed({ id: 'local', classId: 'c1', showId: 'show-1', _localOnly: true }, true);
    await queuedDeleteFromEarlierClient('e1');
    await queuedDeleteFromEarlierClient('e2');
    await queuedDeleteFromEarlierClient('local');

    await table.sync('show-1');

    const adapter = engine.adapters[0] as SyncReplicatedTableAdapter<unknown, ReplicatedEntry>;
    await expect(adapter.getPendingDeleteIds?.({ scope: { value: 'show-1' } })).resolves.toEqual(
      new Set(['e1'])
    );
    expect(pending.map(m => m.data)).toEqual([
      { id: 'e1', show_id: 'show-1' },
      { id: 'e2', show_id: 'show-2' },
      { id: 'local' },
    ]);
  });

  it('suppresses a server-acknowledged removal across queued writes and a racing download', async () => {
    await seed({ id: 'e1', classId: 'c1', showId: 'show-1' });
    pending.push(
      fromAny<PendingMutation, unknown>({
        tableName: 'entries',
        operation: 'UPDATE',
        rowId: 'e1',
        data: { entry_status: 'confirmed' },
      })
    );

    await table.acknowledgeServerDeletion('e1', 5);
    await table.sync('show-1');

    expect(discardPending).toHaveBeenCalledWith('entries', 'e1');
    expect(pending).toEqual([]);
    expect(await table.get('e1')).toBeNull();
    const adapter = engine.adapters[0] as SyncReplicatedTableAdapter<unknown, ReplicatedEntry>;
    expect(adapter.shouldSkipRemoteRow?.({ id: 'e1' }, { local: null })).toBe(true);
    // A fetch can pass shouldSkipRemoteRow before the server removal, then
    // finish its batch write after it. The show read must still hide that row.
    await seed({ id: 'e1', classId: 'c1', showId: 'show-1' });
    expect(await table.getEntriesByShow('show-1')).toEqual([]);
    expect(
      adapter.shouldSkipRemoteRow?.({ id: 'e1', version: 6, deleted_at: null }, { local: null })
    ).toBe(false);
    await adapter.afterSuccessfulSync?.({
      scope: { value: 'show-1' },
      serverIds: new Set(['e1']),
      localRows: [],
      staleCleanupCompleted: false,
    });
    expect(await table.getEntriesByShow('show-1')).toHaveLength(1);
  });

  it('keeps a deleted-row guard through an incremental fetch whose watermark is zero', async () => {
    await seed({ id: 'e1', classId: 'c1', showId: 'show-1' });
    await table.acknowledgeServerDeletion('e1', 5);
    await table.sync('show-1');
    const adapter = engine.adapters[0] as SyncReplicatedTableAdapter<unknown, ReplicatedEntry>;

    await adapter.afterSuccessfulSync?.({
      scope: { value: 'show-1' },
      serverIds: new Set(),
      localRows: [],
      staleCleanupCompleted: false,
    });
    await seed({ id: 'e1', classId: 'c1', showId: 'show-1' });
    expect(await table.getEntriesByShow('show-1')).toEqual([]);

    await adapter.afterSuccessfulSync?.({
      scope: { value: 'show-1' },
      serverIds: new Set(),
      localRows: [],
      staleCleanupCompleted: true,
    });
    expect(await table.getEntriesByShow('show-1')).toEqual([]);

    await table.delete('e1');
    await adapter.afterSuccessfulSync?.({
      scope: { value: 'show-1' },
      serverIds: new Set(),
      localRows: [],
      staleCleanupCompleted: true,
    });
    expect(adapter.shouldSkipRemoteRow?.({ id: 'e1' }, { local: null })).toBe(false);
  });
});

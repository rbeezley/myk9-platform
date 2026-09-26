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

describe('ReplicatedEntriesTable pending deletes (MYK9-762)', () => {
  let table: ReplicatedEntriesTable;
  let pending: PendingMutation[];

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    engine.adapters.length = 0;
    pending = [];
    table = new ReplicatedEntriesTable();
    table.setMutationManager(
      fromAny<MutationManager, unknown>({
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

  it('hands the sync engine this show’s server-backed deletes that are still queued', async () => {
    await seed({ id: 'e1', classId: 'c1', showId: 'show-1' });
    await seed({ id: 'e2', classId: 'c1', showId: 'show-2' });
    await seed({ id: 'local', classId: 'c1', showId: 'show-1', _localOnly: true }, true);
    await table.deleteEntry('e1');
    await table.deleteEntry('e2');
    await table.deleteEntry('local');

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
});

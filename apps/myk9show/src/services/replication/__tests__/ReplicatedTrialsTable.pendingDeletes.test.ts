/**
 * MYK9-762: a trial deleted on this device, or on the server, and the trials
 * sync. Runs the real sync engine over a fake Supabase and a fake queue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import type { MutationManager, PendingMutation } from '@myk9/replication';
import { ReplicatedTrialsTable, type ReplicatedTrial } from '../ReplicatedTrialsTable';
import { deletePayload } from '../pendingDeletes';

const server = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  count: 0,
}));

vi.mock('@/services/database/supabaseClient', () => {
  function query(head: boolean) {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      gt: () => builder,
      order: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      then: (resolve: (value: unknown) => unknown) => {
        const rows = server.rows.filter(row => filters.every(([col, val]) => row[col] === val));
        return Promise.resolve(
          head ? { count: server.count, error: null } : { data: rows, error: null }
        ).then(resolve);
      },
    };
    return builder;
  }
  return {
    supabase: {
      from: () => ({
        select: (_columns: string, options?: { head?: boolean }) => query(options?.head === true),
      }),
    },
  };
});

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** The queue: records what the table queues and answers what is pending. */
function fakeQueue() {
  const pending: PendingMutation[] = [];
  const manager = {
    rowRefetchers: { register: () => () => undefined },
    queueMutation: vi.fn(
      async (
        tableName: string,
        operation: PendingMutation['operation'],
        rowId: string,
        data: Record<string, unknown>
      ) => {
        const id = `m-${pending.length + 1}`;
        pending.push(
          fromAny<PendingMutation, unknown>({
            id,
            tableName,
            operation,
            rowId,
            data,
            status: 'pending',
          })
        );
        return id;
      }
    ),
    getPendingMutationsForTable: vi.fn(async (tableName: string) =>
      pending.filter(mutation => mutation.tableName === tableName)
    ),
  };
  return { pending, manager };
}

const trial = (id: string, showId: string, extra: Partial<ReplicatedTrial> = {}) => ({
  id,
  showId,
  name: id,
  date: '2026-10-10',
  ...extra,
});

const serverRow = (id: string, showId: string) => ({
  id,
  show_id: showId,
  name: id,
  date: '2026-10-10',
  updated_at: '2026-09-25T00:00:00Z',
});

/**
 * A DELETE an earlier client queued. No app path queues a trial DELETE any more
 * (CRUD standard Phase 2: trials are soft-deleted through soft_delete_trial), but
 * a device can still hold one in its queue, and the sync must keep honouring it.
 */
async function queuedDeleteFromEarlierClient(
  table: ReplicatedTrialsTable,
  queue: ReturnType<typeof fakeQueue>,
  id: string
) {
  const row = await table.get(id);
  await queue.manager.queueMutation('trials', 'DELETE', id, deletePayload(id, row));
  await table.delete(id);
}

describe('ReplicatedTrialsTable pending and server deletes (MYK9-762)', () => {
  let table: ReplicatedTrialsTable;
  let queue: ReturnType<typeof fakeQueue>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    server.rows = [];
    server.count = 0;
    table = new ReplicatedTrialsTable();
    queue = fakeQueue();
    table.setMutationManager(fromAny<MutationManager, unknown>(queue.manager));
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('counts a queued DELETE of a synced trial as covered for its show only', async () => {
    await table.set('t1', trial('t1', 'show-1'));
    await table.set('local', trial('local', 'show-1', { _localOnly: true }), true);

    await queuedDeleteFromEarlierClient(table, queue, 't1');
    await queuedDeleteFromEarlierClient(table, queue, 'local');

    await expect(table.pendingDeletes.coveredIds('show-1')).resolves.toEqual(new Set(['t1']));
    await expect(table.pendingDeletes.coveredIds('show-2')).resolves.toEqual(new Set());
  });

  it('exposes no method that queues a trial DELETE (soft delete goes through the RPC)', () => {
    expect('deleteTrial' in table).toBe(false);
  });

  it('does not bring back a trial whose DELETE is still queued, even on a full fetch', async () => {
    await table.set('t1', trial('t1', 'show-1'));
    await table.set('t2', trial('t2', 'show-1'));
    await queuedDeleteFromEarlierClient(table, queue, 't2');
    // The DELETE has not uploaded: the server still has, and counts, t2.
    server.rows = [serverRow('t1', 'show-1'), serverRow('t2', 'show-1')];
    server.count = 2;

    const result = await table.sync('show-1', { forceFullSync: true });

    expect(result.success).toBe(true);
    expect(await table.get('t1')).toMatchObject({ id: 't1' });
    expect(await table.get('t2')).toBeNull();
  });

  it('does not force a full sync for a trial deleted here whose DELETE is queued', async () => {
    await table.set('t1', trial('t1', 'show-1'));
    await table.set('t2', trial('t2', 'show-1'));
    await table.updateSyncMetadata(
      { lastIncrementalSyncAt: 1000, lastFullSyncAt: Date.now() },
      { scopeValue: 'show-1' }
    );
    await queuedDeleteFromEarlierClient(table, queue, 't2');
    server.rows = [];
    server.count = 2;

    const result = await table.sync('show-1');

    expect(result.operation).toBe('incremental-sync');
  });

  it("removes a trial deleted on the server, and keeps other shows' trials", async () => {
    await table.set('t1', trial('t1', 'show-1'));
    await table.set('t2', trial('t2', 'show-1'));
    await table.set('x1', trial('x1', 'show-2'));
    await table.updateSyncMetadata(
      { lastIncrementalSyncAt: 1000, lastFullSyncAt: Date.now() },
      { scopeValue: 'show-1' }
    );
    // t2 was hard-deleted on the server.
    server.rows = [serverRow('t1', 'show-1'), serverRow('x1', 'show-2')];
    server.count = 1;
    // The cleanup cutoff is strict (synced BEFORE the fetch began).
    await new Promise(resolve => setTimeout(resolve, 5));

    const result = await table.sync('show-1');

    expect(result.operation).toBe('full-sync');
    expect(await table.get('t1')).toMatchObject({ id: 't1' });
    expect(await table.get('t2')).toBeNull();
    expect(await table.get('x1')).toMatchObject({ id: 'x1' });
  });
});

/**
 * MYK9-762: a trial deleted on this device, or on the server, and the trials
 * sync. Runs the real sync engine over a fake Supabase and a fake queue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import type { MutationManager, PendingMutation } from '@myk9/replication';
import { ReplicatedTrialsTable, type ReplicatedTrial } from '../ReplicatedTrialsTable';

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

  it('records the show on the DELETE of a synced trial, and only the id for a pending create', async () => {
    await table.set('t1', trial('t1', 'show-1'));
    await table.set('local', trial('local', 'show-1', { _localOnly: true }), true);

    await table.deleteTrial('t1');
    await table.deleteTrial('local');

    expect(queue.pending.map(m => [m.operation, m.rowId, m.data])).toEqual([
      ['DELETE', 't1', { id: 't1', show_id: 'show-1' }],
      ['DELETE', 'local', { id: 'local' }],
    ]);
    await expect(table.pendingDeletes.coveredIds('show-1')).resolves.toEqual(new Set(['t1']));
    await expect(table.pendingDeletes.coveredIds('show-2')).resolves.toEqual(new Set());
  });

  it('queues the DELETE before removing the local row', async () => {
    await table.set('t1', trial('t1', 'show-1'));
    let rowWhenQueued: unknown = 'not queued';
    queue.manager.queueMutation.mockImplementationOnce(async (_t, _op, rowId: string) => {
      rowWhenQueued = await table.get(rowId);
      return 'm-1';
    });

    await table.deleteTrial('t1');

    expect(rowWhenQueued).toMatchObject({ id: 't1' });
    expect(await table.get('t1')).toBeNull();
  });

  it('does not bring back a trial whose DELETE is still queued, even on a full fetch', async () => {
    await table.set('t1', trial('t1', 'show-1'));
    await table.set('t2', trial('t2', 'show-1'));
    await table.deleteTrial('t2');
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
    await table.deleteTrial('t2');
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

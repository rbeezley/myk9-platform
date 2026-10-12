import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { replaceRefusedRows } from './core/replaceRefusedRows';
import type { MutationManager } from './MutationManager';
import {
  adapterFor,
  makeServer,
  pendingFor,
  RefetchingEntriesTable,
  resetForStaleRowTest,
  seedStaleWrite,
  startStaleRowManager,
  teardownStaleRowTest,
  type LocalEntry,
  type ServerRow,
} from './test-utils/staleRowRefetchFixtures';
import type { ReplicatedRow } from './types';

/** MYK9-1076: a refused or discarded queued UPDATE re-pulls its row, for opted-in tables only. */
class RepullingEntriesTable extends RefetchingEntriesTable {
  protected override readonly repullsRefusedRows = true;
}

/** The server refuses every UPDATE for good (RLS denial). */
function refusingClient(error: Record<string, unknown>): SupabaseClient {
  const builder: Record<string, unknown> = {};
  builder.update = () => builder;
  builder.eq = () => builder;
  builder.select = async () => ({ data: null, error });
  return { from: () => builder } as unknown as SupabaseClient;
}
const RLS_DENIAL = { code: '42501', message: 'new row violates row-level security policy' };

describe('a discarded failed UPDATE re-pulls its row (MYK9-1076)', () => {
  let manager: MutationManager;
  let tableName: string;
  const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });
  afterEach(() => teardownStaleRowTest(manager));

  const localOf = async (table: RefetchingEntriesTable) =>
    (await table.getReplicatedRow('1')) as ReplicatedRow<LocalEntry>;

  async function refuseWith(table: RefetchingEntriesTable, error: Record<string, unknown>) {
    const client = refusingClient(error);
    manager = startStaleRowManager(table, client).manager;
    await seedStaleWrite(table);
    await manager.uploadPendingMutations();
  }

  it('a dead-lettered UPDATE is NOT re-pulled: the user keeps seeing their edit until Retry or Discard', async () => {
    const adapter = adapterFor(serverRow);
    const table = new RepullingEntriesTable(tableName, adapter);
    await refuseWith(table, RLS_DENIAL);
    await Promise.resolve();

    expect(await manager.getFailedMutations()).toHaveLength(1);
    expect(adapter.fetchRowsById).not.toHaveBeenCalled();
    expect((await localOf(table)).data.status).toBe('done');
  });

  it('a discarded failed UPDATE replaces only that row with the server row and announces it', async () => {
    const adapter = adapterFor(serverRow);
    const table = new RepullingEntriesTable(tableName, adapter);
    await refuseWith(table, RLS_DENIAL);
    const replaced: unknown[] = [];
    const listener = (event: Event) => replaced.push((event as CustomEvent).detail);
    window.addEventListener('replication:rows-replaced', listener);

    const [failed] = await manager.getFailedMutations();
    await manager.discardFailedMutation(failed!.id);

    await vi.waitFor(async () => expect((await localOf(table)).data.status).toBe('scored'));
    window.removeEventListener('replication:rows-replaced', listener);
    expect(adapter.fetchRowsById).toHaveBeenCalledWith(['1']);
    const row = await localOf(table);
    expect(row).toMatchObject({ isDirty: false, serverVersion: 8 });
    expect(row.data).toEqual({ id: '1', status: 'scored', finalPlacement: 2 });
    expect(replaced).toEqual([{ tableName, rowIds: ['1'] }]);
  });

  it('a second failed edit for the row holds it: only the last discard re-pulls', async () => {
    const adapter = adapterFor(serverRow);
    const table = new RepullingEntriesTable(tableName, adapter);
    await refuseWith(table, RLS_DENIAL);
    const db = await databaseManager.getDatabase('test');
    const [first] = await manager.getFailedMutations();
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, {
      ...first!,
      id: 'second-failed',
      failureKind: 'max-retries',
    });

    await manager.discardFailedMutation(first!.id);
    await vi.waitFor(() => expect(adapter.fetchRowsById).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect((await localOf(table)).data.status).toBe('done');

    await manager.discardFailedMutation('second-failed');
    await vi.waitFor(async () => expect((await localOf(table)).data.status).toBe('scored'));
  });

  it('a table that did not opt in is not re-pulled (opt-in)', async () => {
    const adapter = adapterFor(serverRow);
    const table = new RefetchingEntriesTable(tableName, adapter);
    await refuseWith(table, RLS_DENIAL);
    const [failed] = await manager.getFailedMutations();
    await manager.discardFailedMutation(failed!.id);
    await Promise.resolve();

    expect(adapter.fetchRowsById).not.toHaveBeenCalled();
    expect((await localOf(table)).data.status).toBe('done');
  });

  it('Retry is unchanged: the failed write keeps its own token and payload', async () => {
    const adapter = adapterFor(serverRow);
    const table = new RepullingEntriesTable(tableName, adapter);
    await refuseWith(table, RLS_DENIAL);
    const [failed] = await manager.getFailedMutations();

    await manager.retryFailedMutation(failed!.id);

    const [requeued] = await pendingFor(tableName);
    expect(requeued?.serverVersion).toBe(3);
    expect(requeued?.data).toEqual(failed?.data);
    expect(adapter.fetchRowsById).not.toHaveBeenCalled();
  });

  it('an offline discard neither throws nor wedges the queue', async () => {
    const adapter = adapterFor(serverRow, async () => {
      throw new TypeError('Failed to fetch');
    });
    const table = new RepullingEntriesTable(tableName, adapter);
    const { supabase } = makeServer(serverRow);
    manager = startStaleRowManager(table, supabase).manager;
    await seedStaleWrite(table);
    const db = await databaseManager.getDatabase('test');
    const [pending] = await pendingFor(tableName);
    await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, pending!.id);
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, { ...pending!, status: 'failed' });

    await expect(manager.discardFailedMutation(pending!.id)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(adapter.fetchRowsById).toHaveBeenCalled());

    expect(await manager.getFailedMutations()).toHaveLength(0);
    expect((await localOf(table)).data.status).toBe('done');
  });
});

describe('replaceRefusedRows skips a row that changed or is queued (MYK9-1071 helper)', () => {
  beforeEach(async () => {
    await resetForStaleRowTest();
  });
  afterEach(() => teardownStaleRowTest(undefined));

  it('replaces only the untouched row', async () => {
    const name = `entries_${crypto.randomUUID()}`;
    const table = new RefetchingEntriesTable(
      name,
      adapterFor({ status: 's', final_placement: null, version: 1 })
    );
    for (const id of ['ok', 'edited', 'queued']) {
      await table.set(id, { id, status: 'refused', finalPlacement: null }, false, undefined, 3);
    }
    const versions = Object.fromEntries(
      await Promise.all(
        ['ok', 'edited', 'queued'].map(async id => [
          id,
          (await table.getReplicatedRow(id))!.version,
        ])
      )
    ) as Record<string, number>;
    await table.set('edited', { id: 'edited', status: 'new edit', finalPlacement: null }, false);
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      id: 'm-q',
      tableName: name,
      rowId: 'queued',
      operation: 'UPDATE',
      data: {},
      timestamp: 1,
      retries: 0,
      status: 'pending',
    });
    const remote = (id: string) => ({ id, status: 'server', finalPlacement: null });

    const replaced = await replaceRefusedRows<LocalEntry>(
      db,
      name,
      ['ok', 'edited', 'queued'].map(id => ({
        id,
        expectedRowVersion: versions[id]!,
        remote: remote(id),
        remoteServerVersion: 5,
      }))
    );

    expect(replaced).toEqual(['ok']);
    expect((await table.getReplicatedRow('edited'))!.data.status).toBe('new edit');
    expect((await table.getReplicatedRow('queued'))!.data.status).toBe('refused');
  });
});

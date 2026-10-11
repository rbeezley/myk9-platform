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

describe('a refused or discarded queued UPDATE re-pulls its row (MYK9-1076)', () => {
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

  it('a dead-lettered UPDATE replaces the local row with the server row, for that row only', async () => {
    const adapter = adapterFor(serverRow);
    const table = new RepullingEntriesTable(tableName, adapter);
    await refuseWith(table, RLS_DENIAL);

    expect(await manager.getFailedMutations()).toHaveLength(1);
    await vi.waitFor(async () => expect((await localOf(table)).data.status).toBe('scored'));
    expect(adapter.fetchRowsById).toHaveBeenCalledWith(['1']);
    const row = await localOf(table);
    expect(row).toMatchObject({ isDirty: false, serverVersion: 8 });
    expect(row.data).toEqual({ id: '1', status: 'scored', finalPlacement: 2 });
  });

  it('a discarded failed UPDATE replaces the local row with the server row', async () => {
    // The refusal's own re-pull finds nothing, so only the discard can heal it.
    const adapter = adapterFor(serverRow, async () => []);
    const table = new RepullingEntriesTable(tableName, adapter);
    await refuseWith(table, RLS_DENIAL);
    await vi.waitFor(() => expect(adapter.fetchRowsById).toHaveBeenCalledTimes(1));
    expect((await localOf(table)).data.status).toBe('done');

    vi.mocked(adapter.fetchRowsById).mockResolvedValue([{ id: '1', ...serverRow }]);
    const [failed] = await manager.getFailedMutations();
    await manager.discardFailedMutation(failed!.id);

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

  it('retries exhausted is not a refusal: the row keeps the edit', async () => {
    const adapter = adapterFor(serverRow);
    const table = new RepullingEntriesTable(tableName, adapter);
    // A 5xx that is retryable, with a single allowed attempt, dead-letters as max-retries.
    const client = refusingClient({ code: '500', message: 'upstream unavailable' });
    manager = startStaleRowManager(table, client, { maxRetries: 1 }).manager;
    await seedStaleWrite(table);
    await manager.uploadPendingMutations();

    const [failed] = await manager.getFailedMutations();
    expect(failed?.failureKind).toBe('max-retries');
    await Promise.resolve();
    expect(adapter.fetchRowsById).not.toHaveBeenCalled();
    expect((await localOf(table)).data.status).toBe('done');
  });

  it('Retry after the re-pull carries the row’s current token, not the stale one', async () => {
    const adapter = adapterFor(serverRow);
    const table = new RepullingEntriesTable(tableName, adapter);
    await refuseWith(table, RLS_DENIAL);
    await vi.waitFor(async () => expect((await localOf(table)).serverVersion).toBe(8));
    const [failed] = await manager.getFailedMutations();
    expect(failed?.serverVersion).toBe(3);

    await manager.retryFailedMutation(failed!.id);

    expect((await pendingFor(tableName))[0]?.serverVersion).toBe(8);
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

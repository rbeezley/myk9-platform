import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { MutationManager } from './MutationManager';
import { syncReplicatedTable } from './syncReplicatedTable';
import {
  adapterFor,
  afterBackoff,
  makeServer,
  pendingFor,
  RefetchingEntriesTable,
  resetForStaleRowTest,
  seedStaleWrite,
  startStaleRowManager,
  stubWebLocks,
  teardownStaleRowTest,
  type RemoteEntry,
  type ServerRow,
} from './test-utils/staleRowRefetchFixtures';

/**
 * MYK9-794. The MYK9-771 re-fetch runs under the upload lock, but a sync's
 * download phase does not. So a download can read and apply a NEWER version of
 * the row between the re-fetch's read and its apply:
 *
 * 1. the re-fetch reads the row at v8;
 * 2. another writer bumps it to v9;
 * 3. a sync download applies v9;
 * 4. the re-fetch applies its v8 snapshot.
 *
 * The row must still end at the server's latest version, the edit must upload
 * once, and nothing may be marked as a conflict.
 */
describe('a sync download lands inside a stale-row re-fetch (MYK9-794)', () => {
  let manager: MutationManager | undefined;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });

  afterEach(() => teardownStaleRowTest(manager));

  /**
   * Runs steps 1-4, with `betweenDownloadAndApply` after step 3, then upload
   * passes until the queue drains (bounded: a write that never lands fails).
   */
  async function runRace(
    betweenDownloadAndApply?: (table: RefetchingEntriesTable) => Promise<void>
  ) {
    const events = stubWebLocks();
    // Every queued lock section (upload or re-fetch) has run and released.
    const lockSettled = async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await vi.waitFor(() => {
        const acquired = events.filter(event => event.startsWith('acquire')).length;
        expect(events.filter(event => event.startsWith('release'))).toHaveLength(acquired);
      });
    };
    const conflicts: unknown[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') conflicts.push((event as CustomEvent).detail);
        return true;
      },
    });

    // Another writer set `final_placement` (a field this device never touched).
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>(resolve => (releaseFetch = resolve));
    let fetchStarted = false;
    let fetches = 0;
    const adapter = adapterFor(serverRow, async ids => {
      if (!ids.includes('1')) return [];
      // Step 1: the first re-fetch reads the row, then stalls before applying it.
      const snapshot: RemoteEntry = { id: '1', ...serverRow };
      if (++fetches === 1) {
        fetchStarted = true;
        await fetchGate;
      }
      return [snapshot];
    });
    const table = new RefetchingEntriesTable(tableName, adapter);
    const { supabase, updates } = makeServer(serverRow);
    manager = startStaleRowManager(table, supabase).manager;
    await seedStaleWrite(table);

    await manager.uploadPendingMutations();
    await vi.waitFor(() => expect(fetchStarted).toBe(true));

    // Step 2.
    serverRow.final_placement = 3;
    serverRow.version = 9;

    // Step 3: a sync download, outside the upload lock.
    await syncReplicatedTable(
      table,
      { ...adapter, fetchRemoteRows: async () => [{ id: '1', ...serverRow }] },
      {},
      { conflictSurfacingEnabled: true }
    );
    expect((await table.getReplicatedRow('1'))?.serverVersion).toBe(9);
    await betweenDownloadAndApply?.(table);

    // Step 4.
    releaseFetch();
    await lockSettled();
    const afterStaleApply = await table.getReplicatedRow('1');

    for (let pass = 1; pass <= 5 && (await pendingFor(tableName)).length > 0; pass++) {
      afterBackoff(10 * pass);
      await manager.uploadPendingMutations();
      await lockSettled();
    }

    return { table, serverRow, updates, conflicts, afterStaleApply };
  }

  it('the stale v8 apply leaves the v9 row alone, and the write lands once on v9', async () => {
    const { table, serverRow, updates, conflicts, afterStaleApply } = await runRace();

    // Step 4 changed nothing: the row still holds v9 and its field.
    expect(afterStaleApply).toMatchObject({
      data: { id: '1', status: 'done', finalPlacement: 3 },
      baseData: { id: '1', status: 'scored', finalPlacement: 3 },
      serverVersion: 9,
    });

    expect(await pendingFor(tableName)).toHaveLength(0);
    // The edit landed exactly once, on top of the other writer's v9 field.
    expect(updates.filter(call => call.applied)).toHaveLength(1);
    expect(serverRow).toEqual({ status: 'done', final_placement: 3, version: 10 });
    // The device holds the server's latest version, clean, with no conflict.
    expect(conflicts).toHaveLength(0);
    expect(await table.getReplicatedRow('1')).toMatchObject({
      data: { id: '1', status: 'done', finalPlacement: 3 },
      serverVersion: 10,
      isDirty: false,
      syncStatus: 'synced',
    });
  });

  it('an edit made on top of v9 is not marked as a conflict with the stale v8 snapshot', async () => {
    // After the download, the user changes the field the v9 writer changed.
    // Against v9 that is an ordinary edit; only the stale v8 disagrees.
    const { table, serverRow, updates, conflicts } = await runRace(async edited => {
      await edited.set('1', { id: '1', status: 'done', finalPlacement: 4 }, true);
      const db = await databaseManager.getDatabase('test');
      const [queued] = await pendingFor(tableName);
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
        ...queued!,
        data: { ...queued!.data, final_placement: 4 },
      });
    });

    expect(conflicts).toHaveLength(0);
    expect(await pendingFor(tableName)).toHaveLength(0);
    expect(updates.filter(call => call.applied)).toHaveLength(1);
    expect(serverRow).toEqual({ status: 'done', final_placement: 4, version: 10 });
    expect(await table.getReplicatedRow('1')).toMatchObject({
      data: { id: '1', status: 'done', finalPlacement: 4 },
      serverVersion: 10,
      syncStatus: 'synced',
    });
  });
});

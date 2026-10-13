import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { MutationManager } from './MutationManager';
import type { DirtyRowComparePolicy } from './conflict/detectDirtyRowConflict';
import {
  adapterFor,
  afterBackoff,
  makeServer,
  pendingFor,
  RefetchingEntriesTable,
  resetForStaleRowTest,
  startStaleRowManager,
  teardownStaleRowTest,
  type ServerRow,
} from './test-utils/staleRowRefetchFixtures';
import type { PendingMutation } from './types';

/**
 * MYK9-1104 on the real path: a stale full-row write is rejected (40001), the
 * row is re-fetched, and the dirty-row decision runs. `status` plays the class
 * status (the device spells it `Done`, the server `done`) and `finalPlacement`
 * plays the server-stamped completion time.
 */
const comparePolicy: DirtyRowComparePolicy = {
  normalizeValue: (field, value) =>
    field === 'status' && typeof value === 'string' ? value.toLowerCase() : value,
  serverWinsFields: ['finalPlacement'],
};

describe('a write whose outcome the server already reached (MYK9-1104)', () => {
  let manager: MutationManager;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });

  afterEach(() => teardownStaleRowTest(manager));

  /** Clean at version 3, then the device writes `Done` and its own stamp (1). */
  async function seedDeviceCompletion(table: RefetchingEntriesTable) {
    await table.set('1', { id: '1', status: 'scored', finalPlacement: null }, false, undefined, 3);
    await table.set('1', { id: '1', status: 'Done', finalPlacement: 1 }, true);
    const db = await databaseManager.getDatabase('test');
    const mutation: PendingMutation = {
      id: `mut-converged-${tableName}`,
      authUserId: 'stale-row-refetch-user',
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', status: 'Done', final_placement: 1 },
      explicitDataKeys: ['id', 'status', 'final_placement'],
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      serverVersion: 3,
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
  }

  function setup(serverRow: ServerRow) {
    const adapter = { ...adapterFor(serverRow), dirtyRowComparePolicy: comparePolicy };
    const table = new RefetchingEntriesTable(tableName, adapter);
    const server = makeServer(serverRow);
    manager = startStaleRowManager(table, server.supabase).manager;
    return { table, ...server };
  }

  it('settles without a prompt, takes the server stamp, and the row syncs', async () => {
    // The server completed it first: same status, its own stamp (2), version 8.
    const serverRow: ServerRow = { status: 'done', final_placement: 2, version: 8 };
    const { table, updates } = setup(serverRow);
    await seedDeviceCompletion(table);
    const conflicts: unknown[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') conflicts.push((event as CustomEvent).detail);
        return true;
      },
    });

    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect((await pendingFor(tableName))[0]?.serverVersion).toBe(8));

    expect(conflicts).toHaveLength(0);
    const row = await table.getReplicatedRow('1');
    expect(row?.syncStatus).not.toBe('conflict');
    expect(row?.data).toEqual({ id: '1', status: 'done', finalPlacement: 2 });
    expect((await pendingFor(tableName))[0]?.data).toEqual({
      id: '1',
      status: 'done',
      final_placement: 2,
    });

    afterBackoff();
    await manager.uploadPendingMutations();

    expect(updates.map(call => call.expectedVersion)).toEqual([3, 8]);
    expect(await pendingFor(tableName)).toHaveLength(0);
    expect(serverRow).toEqual({ status: 'done', final_placement: 2, version: 9 });
    const synced = await table.getReplicatedRow('1');
    expect(synced?.isDirty).toBe(false);
    expect(synced?.syncStatus).not.toBe('conflict');
  });

  it('still prompts when the server disagrees (reopened), and never overwrites it', async () => {
    const serverRow: ServerRow = { status: 'scored', final_placement: null, version: 8 };
    // Base was `in progress`; the server moved it to a different status.
    const adapter = {
      ...adapterFor({ ...serverRow, status: 'upcoming' }),
      dirtyRowComparePolicy: comparePolicy,
    };
    const table = new RefetchingEntriesTable(tableName, adapter);
    const server = makeServer({ ...serverRow, status: 'upcoming' });
    manager = startStaleRowManager(table, server.supabase).manager;
    await seedDeviceCompletion(table);
    const conflicts: Array<{ fields: string[] }> = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') {
          conflicts.push((event as CustomEvent).detail);
        }
        return true;
      },
    });

    await manager.uploadPendingMutations();
    await vi.waitFor(async () =>
      expect((await table.getReplicatedRow('1'))?.syncStatus).toBe('conflict')
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.fields).toEqual(['status']);
    expect(await pendingFor(tableName)).toMatchObject([{ serverVersion: 3 }]);
    afterBackoff();
    await manager.uploadPendingMutations();
    expect(server.updates.every(call => call.expectedVersion === 3)).toBe(true);
  });
});

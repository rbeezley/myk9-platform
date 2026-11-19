import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { MutationManager } from './MutationManager';
import {
  adapterFor,
  afterBackoff,
  AUTH_USER_ID,
  pendingFor,
  RefetchingEntriesTable,
  resetForStaleRowTest,
  startStaleRowManager,
  teardownStaleRowTest,
  type ServerRow,
} from './test-utils/staleRowRefetchFixtures';
import type { PendingMutation } from './types';

/**
 * MYK9-2111. An RPC delta (ringside scoring) rejected with 40001 is NOT re-stamped
 * with the server's version: that token only says the row moved, so restamping
 * would let a judge's stale offline score overwrite a secretary's correction. The
 * server row is re-fetched and the delta's own fields compared with it.
 */
describe('an RPC write rejected on a stale OCC token (MYK9-2111)', () => {
  let manager: MutationManager;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });

  afterEach(async () => {
    await teardownStaleRowTest(manager);
  });

  /** An RPC with a real OCC precondition: it applies only on the server's version. */
  function makeRpcServer(row: ServerRow) {
    const calls: Array<{ expectedVersion: number; fields: unknown }> = [];
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      calls.push({ expectedVersion: args.p_expected_version as number, fields: args });
      if (args.p_expected_version !== row.version) {
        return {
          data: null,
          error: { code: '40001', message: 'version conflict', details: String(row.version) },
        };
      }
      row.version += 1;
      return { data: row.version, error: null };
    });
    return { supabase: { rpc, from: vi.fn() } as unknown as SupabaseClient, calls, rpc };
  }

  /** Clean at version 1 (`scored`), then the device queues an RPC write of `status`. */
  async function setup(serverRow: ServerRow, deviceStatus: string) {
    const table = new RefetchingEntriesTable(tableName, adapterFor(serverRow));
    const server = makeRpcServer(serverRow);
    manager = startStaleRowManager(table, server.supabase).manager;
    await table.set('1', { id: '1', status: 'scored', finalPlacement: null }, false, undefined, 1);
    await table.set('1', { id: '1', status: deviceStatus, finalPlacement: null }, true);
    const db = await databaseManager.getDatabase('test');
    const mutation: PendingMutation = {
      id: `mut-rpc-${tableName}`,
      authUserId: AUTH_USER_ID,
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', status: deviceStatus },
      timestamp: Date.now(),
      sequenceNumber: 1,
      retries: 0,
      status: 'pending',
      serverVersion: 1,
      rpc: { name: 'ringside_update_entry', fields: { status: deviceStatus } },
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
    return { table, ...server };
  }

  function captureConflicts() {
    const conflicts: Array<{ fields: string[] }> = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') {
          conflicts.push((event as CustomEvent).detail);
        }
        return true;
      },
    });
    return conflicts;
  }

  it('dequeues a write the server already holds, without resending it', async () => {
    // The observed case: the server is at version 2 with the device's values.
    const serverRow: ServerRow = { status: 'done', final_placement: null, version: 2 };
    const { table, rpc } = await setup(serverRow, 'done');
    const conflicts = captureConflicts();

    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect(await pendingFor(tableName)).toHaveLength(0));

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(conflicts).toHaveLength(0);
    const row = await table.getReplicatedRow('1');
    expect(row?.isDirty).toBe(false);
    expect(row?.syncStatus).not.toBe('conflict');
    expect(row?.serverVersion).toBe(2);

    afterBackoff();
    await manager.uploadPendingMutations();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(serverRow.version).toBe(2);
  });

  it('never overwrites a different server value: it surfaces a conflict instead', async () => {
    // A secretary corrected the same field while the judge's tablet was offline.
    const serverRow: ServerRow = { status: 'reopened', final_placement: null, version: 2 };
    const { table, calls } = await setup(serverRow, 'done');
    const conflicts = captureConflicts();

    await manager.uploadPendingMutations();
    await vi.waitFor(async () =>
      expect((await table.getReplicatedRow('1'))?.syncStatus).toBe('conflict')
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.fields).toEqual(['status']);
    expect(await pendingFor(tableName)).toMatchObject([{ serverVersion: 1 }]);

    afterBackoff();
    await manager.uploadPendingMutations();
    expect(calls.every(call => call.expectedVersion === 1)).toBe(true);
    expect(serverRow).toEqual({ status: 'reopened', final_placement: null, version: 2 });
    expect(await pendingFor(tableName)).toHaveLength(1);
  });

  it('rebases onto the server version when the server changed only other fields', async () => {
    const serverRow: ServerRow = { status: 'scored', final_placement: 4, version: 2 };
    const { calls } = await setup(serverRow, 'done');
    captureConflicts();

    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect((await pendingFor(tableName))[0]?.serverVersion).toBe(2));
    afterBackoff();
    await manager.uploadPendingMutations();

    expect(calls.map(call => call.expectedVersion)).toEqual([1, 2]);
    expect(await pendingFor(tableName)).toHaveLength(0);
    expect(serverRow.version).toBe(3);
  });
});

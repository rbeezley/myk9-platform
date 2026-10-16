/**
 * MYK9-1220 on the real classes path: the device completes a class (A, a direct
 * UPDATE with the device's own `actual_end_time`), then edits the description (B)
 * before the next pull. A is acknowledged while B is queued. The pull that
 * returns A's row must not conflict, and CLASS_DIRTY_ROW_COMPARE_POLICY must still
 * let the server's `actual_end_time` win on a converged completion.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  refetchDirtyRowsById,
  type RowRefetchAdapter,
} from '@myk9/replication';
import { ReplicatedClassesTable, type ReplicatedClass } from './ReplicatedClassesTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ID = 'class-1';
const AUTH = 'ack-rebase-class-user';

describe('ReplicatedClassesTable acknowledged write then later edit (MYK9-1220)', () => {
  let table: ReplicatedClassesTable;
  let manager: MutationManager;
  let conflicts: unknown[];
  let release: () => void;

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    conflicts = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') conflicts.push((event as CustomEvent).detail);
        return true;
      },
    });
    // The first direct UPDATE (A) is acknowledged at version 4 once released; B's
    // upload fails offline, so it stays queued and the row stays dirty.
    let updates = 0;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const supabase = {
      from: () => ({
        update: () => {
          const call = ++updates;
          const builder = {
            eq: () => builder,
            select: async () => {
              if (call > 1) throw new TypeError('Failed to fetch');
              await gate;
              return { data: [{ id: ID, version: 4 }], error: null };
            },
          };
          return builder;
        },
      }),
    } as unknown as SupabaseClient;
    manager = new MutationManager(supabase, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: supabase }),
    });
    table = new ReplicatedClassesTable();
    await table.clearCache();
    table.setMutationManager(manager);
    await table.set(
      ID,
      {
        id: ID,
        trialId: 'trial-1',
        name: 'Novice',
        classStatus: 'in_progress',
      } as ReplicatedClass,
      false,
      undefined,
      3
    );
  });

  afterEach(async () => {
    release();
    manager.destroy();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it('adopts the server completion stamp and raises no conflict when A (acked) is pulled', async () => {
    await table.updateClass(ID, { classStatus: 'Completed', actual_end_time: 'T-device' });
    await table.updateClass(ID, { description: 'B edit' });
    release();
    await vi.waitFor(async () => expect((await table.getReplicatedRow(ID))?.serverVersion).toBe(4));
    const row = await table.getReplicatedRow(ID);
    expect(row?.isDirty).toBe(true);
    // The base now holds what A put on the server, not the pre-A row.
    expect(row?.baseData).toMatchObject({
      classStatus: 'completed',
      actual_end_time: 'T-device',
    });
    expect(row?.baseServerVersion).toBe(4);

    // The server's row at A's version: it spells the status its own way and
    // stamped its own completion time.
    const getAdapter = (
      table as unknown as { getRowRefetchAdapter(): RowRefetchAdapter<unknown, ReplicatedClass> }
    ).getRowRefetchAdapter.bind(table);
    const adapter: RowRefetchAdapter<unknown, ReplicatedClass> = {
      ...getAdapter(),
      fetchRowsById: async () => [
        {
          id: ID,
          trial_id: 'trial-1',
          name: 'Novice',
          status: 'completed',
          actual_end_time: 'T-server',
          allow_waitlist: false,
          version: 4,
        },
      ],
    };
    await refetchDirtyRowsById(table, adapter, [ID]);

    expect(conflicts).toEqual([]);
    const after = await table.getReplicatedRow(ID);
    expect(after?.syncStatus).not.toBe('conflict');
    expect(after?.data.description).toBe('B edit');
    expect(after?.data.actual_end_time).toBe('T-server');
  });
});

/**
 * MYK9-1327 on the real classes path: a judge change is written onto the local class row
 * (`setClassJudge`), so every screen shows it at
 * once and after an offline reload. A pull that reaches the row while its writes are still
 * queued must keep that judge, and must not surface the device's own earlier picks, or an
 * unresolved judge lookup, as a conflict. A judge change made elsewhere still reaches a row
 * this device did not change the judge on.
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
const AUTH = 'local-judge-class-user';

const judge = (id: string, first: string) => ({
  judgeId: id,
  judgeName: `${first} Judge`,
  judgeFirstName: first,
  judgeLastName: 'Judge',
  judgeResolved: true,
});

/** The server's class row, with its confirmed judge assignment embedded. */
const serverRow = (judgeId: string, extra: Record<string, unknown> = {}) => ({
  id: ID,
  trial_id: 'trial-1',
  name: 'Novice',
  status: 'not_started',
  allow_waitlist: false,
  version: 3,
  judge_assignments: [{ id: `ja-${judgeId}`, person_id: judgeId, status: 'confirmed' }],
  // The show's judge-name lookup did not run on this fetch: names are unknown, not absent.
  _judgeResolved: false,
  ...extra,
});

describe('ReplicatedClassesTable local judge (MYK9-1327)', () => {
  let table: ReplicatedClassesTable;
  let manager: MutationManager;
  let conflicts: unknown[];

  const pull = async (row: Record<string, unknown>) => {
    const getAdapter = (
      table as unknown as { getRowRefetchAdapter(): RowRefetchAdapter<unknown, ReplicatedClass> }
    ).getRowRefetchAdapter.bind(table);
    await refetchDirtyRowsById(table, { ...getAdapter(), fetchRowsById: async () => [row] }, [ID]);
  };

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
    // Offline: every upload fails, so the class writes stay queued and the row stays dirty.
    const supabase = {
      from: () => ({
        update: () => {
          const builder = {
            eq: () => builder,
            select: async () => {
              throw new TypeError('Failed to fetch');
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
        classStatus: 'not_started',
        ...judge('judge-a', 'Ann'),
      } as ReplicatedClass,
      false,
      undefined,
      3
    );
  });

  afterEach(async () => {
    manager.destroy();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it('keeps the newest local pick through a pull that returns its own earlier pick', async () => {
    await table.updateClass(ID, { ...judge('judge-b', 'Bob'), _lastModified: new Date() });
    await table.updateClass(ID, { ...judge('judge-c', 'Cy'), _lastModified: new Date() });

    // B's assignment has landed on the server; C's has not.
    await pull(serverRow('judge-b'));

    expect(conflicts).toEqual([]);
    const row = await table.getReplicatedRow(ID);
    expect(row?.syncStatus).not.toBe('conflict');
    expect(row?.data).toMatchObject(judge('judge-c', 'Cy'));
  });

  it('keeps the local judge when the pull could not resolve judge names', async () => {
    await table.updateClass(ID, { ...judge('judge-c', 'Cy'), _lastModified: new Date() });

    await pull(serverRow('judge-a'));

    expect(conflicts).toEqual([]);
    expect((await table.getReplicatedRow(ID))?.data).toMatchObject(judge('judge-c', 'Cy'));
  });

  it("adopts another secretary's judge on a row this device changed for another reason", async () => {
    await table.updateClass(ID, { description: 'Bring water' });

    await pull(serverRow('judge-d', { description: null }));

    expect(conflicts).toEqual([]);
    const row = await table.getReplicatedRow(ID);
    expect(row?.data.judgeId).toBe('judge-d');
    expect(row?.data.description).toBe('Bring water');
  });

  it("lets the server's judge win once the row has no queued writes", () => {
    const resolve = (
      table as unknown as {
        resolveConflict(local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass;
      }
    ).resolveConflict.bind(table);
    const local = { id: ID, trialId: 'trial-1', name: 'Novice', ...judge('judge-c', 'Cy') };
    const remote = { id: ID, trialId: 'trial-1', name: 'Novice', ...judge('judge-d', 'Dee') };

    expect(resolve(local as ReplicatedClass, remote as ReplicatedClass)).toMatchObject(
      judge('judge-d', 'Dee')
    );
  });
});

/**
 * MYK9-1327 Batch 3 on the real replica and queue (fake-indexeddb MutationManager plus the
 * singleton class table): a class-judge pick is ONE queued `set_class_judge` RPC mutation.
 *
 * The scripted Supabase client below stands in for the server only. Every state asserted is
 * read from the real queue stores and the real replicated row. A pick that parks in the failed
 * store no longer holds its row dirty (plan Amendment, 2026-10-28), so the tests that pull after
 * a park assert what the pull does, and that Retry still lands the pick.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  refetchDirtyRowsById,
  type PendingMutation,
  type RowRefetchAdapter,
} from '@myk9/replication';
import { replicatedClassesTable as table, type ReplicatedClass } from './ReplicatedClassesTable';
import { replicatedJudgeAssignmentsTable } from './ReplicatedJudgeAssignmentsTable';
import { replicatedShowDeskPeopleTable } from './ReplicatedShowDeskPeopleTable';
import { upsertClassJudgeAssignment } from '@/services/database/judges/reads';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ID = 'class-1';
const SHOW = 'show-1';
const AUTH = 'set-class-judge-user';

type Reply = { data: unknown; error: unknown };
const offline = async (): Promise<Reply> => {
  throw new TypeError('Failed to fetch');
};
const ok = async (): Promise<Reply> => ({ data: { version: 99 }, error: null });
const parked = (code: string) => async (): Promise<Reply> => ({
  data: null,
  error: { code, message: `server said ${code}` },
});

const judgeOf = (id: string, first: string) => ({
  personId: id,
  name: `${first} Judge`,
  firstName: first,
  lastName: 'Judge',
});

/** The server's class row, judge embedded; names unresolved, as on a plain class fetch. */
const serverRow = (judgeId: string, extra: Record<string, unknown> = {}) => ({
  id: ID,
  trial_id: 'trial-1',
  name: 'Novice',
  status: 'not_started',
  allow_waitlist: false,
  version: 3,
  judge_assignments: [{ id: `ja-${judgeId}`, person_id: judgeId, status: 'confirmed' }],
  _judgeResolved: false,
  ...extra,
});

type AdapterHost = { getRowRefetchAdapter(): RowRefetchAdapter<unknown, ReplicatedClass> };
const adapterHost = table as unknown as AdapterHost;
const realAdapter = adapterHost.getRowRefetchAdapter.bind(table);

describe('ReplicatedClassesTable.setClassJudge (MYK9-1327)', () => {
  let manager: MutationManager;
  let rpcImpl: (name: string, args: Record<string, unknown>) => Promise<Reply>;
  let updateImpl: (
    payload: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => Promise<Reply>;
  let insertImpl: () => Promise<Reply>;
  let serverVersion: number;
  let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  let updateCalls: Array<Record<string, unknown>>;
  let tablesWritten: string[];

  const makeSupabase = () =>
    ({
      rpc: (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return rpcImpl(name, args);
      },
      from: (tableName: string) => ({
        update: (payload: Record<string, unknown>) => {
          tablesWritten.push(tableName);
          updateCalls.push(payload);
          const filters: Record<string, unknown> = {};
          const builder = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return builder;
            },
            select: async () => updateImpl(payload, filters),
          };
          return builder;
        },
        insert: () => {
          tablesWritten.push(tableName);
          return { select: async () => insertImpl() };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { version: serverVersion }, error: null }),
          }),
        }),
      }),
    }) as unknown as SupabaseClient;

  const attach = (supabase: SupabaseClient) => {
    manager = new MutationManager(supabase, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: supabase }),
    });
    table.setMutationManager(manager);
    replicatedJudgeAssignmentsTable.setMutationManager(manager);
    replicatedShowDeskPeopleTable.setMutationManager(manager);
  };

  const pending = (): Promise<PendingMutation[]> => manager.getPendingMutationsForTable('classes');
  const failed = async (): Promise<PendingMutation[]> =>
    (await manager.getFailedMutations()).filter(m => m.tableName === 'classes');
  const picks = (list: PendingMutation[]) => list.filter(m => m.rpc?.name === 'set_class_judge');
  const pickTargets = (list: PendingMutation[]) => picks(list).map(m => m.rpc?.args?.p_person_id);

  /** Every backed-off mutation is due now, as if its backoff had elapsed. */
  const expireBackoff = async () => {
    const db = await databaseManager.getDatabase('MutationManager');
    for (const m of (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[]) {
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...m, nextRetryAt: 0 });
    }
  };
  const upload = async () => {
    await expireBackoff();
    await manager.uploadPendingMutations();
  };

  /** A pull of a DIRTY row: reconciled against the queue, never overwriting a held judge. */
  const pull = async (serverCopy: Record<string, unknown>) => {
    await refetchDirtyRowsById(
      table,
      { ...realAdapter(), fetchRowsById: async () => [serverCopy] },
      [ID]
    );
  };
  /** A pull of a CLEAN row, as the download writes it: the adapter's resolveConflict, then stored. */
  const pullClean = async (serverCopy: Record<string, unknown>) => {
    const local = (await row())!.data;
    const remote = { ...realAdapter().toLocalRow(serverCopy), id: ID };
    const resolved = (
      table as unknown as {
        resolveConflict(l: ReplicatedClass, r: ReplicatedClass): ReplicatedClass;
      }
    ).resolveConflict(local, remote);
    await table.set(ID, resolved, false, undefined, serverCopy.version as number);
  };
  const row = () => table.getReplicatedRow(ID);

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    vi.stubGlobal('window', { dispatchEvent: () => true });
    rpcImpl = offline;
    updateImpl = offline;
    insertImpl = offline;
    serverVersion = 3;
    rpcCalls = [];
    updateCalls = [];
    tablesWritten = [];
    // The Discard re-fetch would reach the real client; the tests pull the server copy themselves.
    vi.spyOn(adapterHost, 'getRowRefetchAdapter').mockImplementation(() => ({
      ...realAdapter(),
      fetchRowsById: async () => [],
    }));
    attach(makeSupabase());
    await table.clearCache();
    await table.set(
      ID,
      {
        id: ID,
        trialId: 'trial-1',
        name: 'Novice',
        classStatus: 'not_started',
        judgeId: 'judge-a',
        judgeName: 'Ann Judge',
        judgeFirstName: 'Ann',
        judgeLastName: 'Judge',
        judgeResolved: true,
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

  it('queues exactly one set_class_judge RPC for a pick: no assignment write, no plain class update', async () => {
    await upsertClassJudgeAssignment(SHOW, ID, 'judge-b', {
      name: 'Bob Judge',
      firstName: 'Bob',
      lastName: 'Judge',
    });

    const all = await pending();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      tableName: 'classes',
      operation: 'UPDATE',
      rowId: ID,
      rpc: { name: 'set_class_judge', args: { p_class_id: ID, p_person_id: 'judge-b' } },
    });
    expect(await manager.getPendingMutationsForTable('judge_assignments')).toEqual([]);

    // On the wire: the RPC once, and nothing else.
    rpcImpl = ok;
    await upload();
    await vi.waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(rpcCalls[0]).toEqual({
      name: 'set_class_judge',
      args: { p_class_id: ID, p_person_id: 'judge-b' },
    });
    expect(updateCalls).toEqual([]);
    expect(tablesWritten).toEqual([]);
  });

  it('merges the pick into a class row that changed while the pick read the queue', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const realFailed = manager.getFailedMutations.bind(manager);
    vi.spyOn(manager, 'getFailedMutations').mockImplementation(async () => {
      await gate;
      return realFailed();
    });

    const picking = table.setClassJudge(ID, { personId: 'judge-b', name: 'Bob Judge' });
    // A sync lands a renamed class while the pick is still reading the queue.
    const before = (await row())!.data;
    await table.set(ID, { ...before, name: 'Novice A' }, false, undefined, 4);
    release();
    await picking;

    const after = (await row())!.data;
    expect(after.name).toBe('Novice A');
    expect(after.judgeId).toBe('judge-b');
  });

  it('sends a null person for a removal and clears the local judge', async () => {
    await upsertClassJudgeAssignment(SHOW, ID, 'TBD');

    expect(picks(await pending())[0]?.rpc?.args).toEqual({ p_class_id: ID, p_person_id: null });
    const after = await row();
    expect(after?.data.judgeId).toBeUndefined();
    expect(after?.data.judgeResolved).toBe(true);
  });

  it('keeps the pick when an unrelated class edit acks while the pick is backed off and a pull returns the old judge', async () => {
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    await vi.waitFor(async () => expect(picks(await pending())[0]?.retries).toBeGreaterThan(0));

    updateImpl = async () => ({ data: [{ id: ID, version: 5 }], error: null });
    await table.updateClass(ID, { description: 'Bring water' });
    await vi.waitFor(async () => expect((await pending()).filter(m => !m.rpc)).toHaveLength(0));

    // The edit acked; the pick is still queued, so the row is still dirty.
    expect((await row())?.isDirty).toBe(true);
    await pull(serverRow('judge-a', { version: 5, description: 'Bring water' }));
    expect((await row())?.data).toMatchObject({ judgeId: 'judge-b', judgeFirstName: 'Bob' });
  });

  it('goes clean on a retry that succeeds, and a later class edit rebases through the OCC path', async () => {
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    rpcImpl = async () => ({
      data: { version: 9, updated_at: 'x', judge: { person_id: 'judge-b' } },
      error: null,
    });
    await vi.waitFor(async () => {
      await upload();
      expect(await pending()).toEqual([]);
    });
    const clean = await row();
    expect(clean?.isDirty).toBe(false);
    expect(clean?.data.judgeId).toBe('judge-b');
    // The engine reads no version from the jsonb: the row's token is as it was.
    expect(clean?.serverVersion).toBe(3);

    // The pick moved the server to version 9, so this edit (stamped 3) is rejected and rebased.
    serverVersion = 9;
    updateImpl = async (_payload, filters) =>
      filters.version === 9
        ? { data: [{ id: ID, version: 10 }], error: null }
        : { data: [], error: null };
    await table.updateClass(ID, { description: 'After the pick' });
    await vi.waitFor(async () => {
      await upload();
      expect((await row())?.serverVersion).toBe(9);
    });
    await pull(serverRow('judge-b', { version: 9, description: null }));
    await vi.waitFor(async () => {
      await upload();
      expect(await pending()).toEqual([]);
    });
    expect(updateCalls.at(-1)).toMatchObject({ description: 'After the pick' });
    expect((await row())?.data).toMatchObject({
      judgeId: 'judge-b',
      description: 'After the pick',
    });
  });

  it('parks a P0002 pick in the failed store; Discard removes it and the row shows the server judge', async () => {
    rpcImpl = parked('P0002');
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    await vi.waitFor(async () => expect(await failed()).toHaveLength(1));

    const [failure] = await failed();
    expect(failure).toMatchObject({ failureKind: 'permanent', rpc: { name: 'set_class_judge' } });
    expect(await pending()).toEqual([]);

    await manager.discardFailedMutation(failure!.id);
    expect(await failed()).toEqual([]);
    // Discard puts the row back to the server's state: the refused judge is gone and the row is clean.
    expect((await row())?.isDirty).toBe(false);
    expect((await row())?.data).toMatchObject({ judgeId: 'judge-a' });
    await pullClean(serverRow('judge-a'));
    expect((await row())?.data).toMatchObject({ judgeId: 'judge-a' });
  });

  it('keeps a parked pick recoverable after an unrelated edit acks and a pull restores the old judge', async () => {
    rpcImpl = parked('P0002');
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    await vi.waitFor(async () => expect(await failed()).toHaveLength(1));

    updateImpl = async () => ({ data: [{ id: ID, version: 5 }], error: null });
    await table.updateClass(ID, { description: 'Bring water' });
    await vi.waitFor(async () => expect((await row())?.isDirty).toBe(false));
    await pullClean(serverRow('judge-a', { version: 5, description: 'Bring water' }));
    expect((await row())?.data.judgeId).toBe('judge-a');

    // The pick is still in the failed store, and Retry lands it.
    const [failure] = await failed();
    expect(failure?.rpc?.args).toEqual({ p_class_id: ID, p_person_id: 'judge-b' });
    rpcImpl = ok;
    await manager.retryFailedMutation(failure!.id);
    await vi.waitFor(async () => {
      await upload();
      expect(rpcCalls.at(-1)?.args).toEqual({ p_class_id: ID, p_person_id: 'judge-b' });
    });
    expect(await failed()).toEqual([]);
    expect(await pending()).toEqual([]);
  });

  it('chains A to B to C and ends at C while B is backing off', async () => {
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    await table.setClassJudge(ID, judgeOf('judge-c', 'Cy'));

    const [pickB, pickC] = picks(await pending());
    expect(pickC?.dependsOn).toEqual([pickB!.id]);

    // B's assignment reaches the server first; the pull must not show it over C.
    await pull(serverRow('judge-b'));
    expect((await row())?.data).toMatchObject({ judgeId: 'judge-c', judgeFirstName: 'Cy' });

    rpcImpl = ok;
    await vi.waitFor(async () => {
      await upload();
      expect(await pending()).toEqual([]);
    });
    expect(rpcCalls.map(c => c.args.p_person_id)).toEqual(['judge-b', 'judge-c']);
  });

  it('holds C behind a parked B, releases it on Discard, and ends at C', async () => {
    rpcImpl = async (_name, args) =>
      args.p_person_id === 'judge-b' ? parked('P0002')() : offline();
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    // Queue C directly behind a B that is still pending (its dependency).
    await table.setClassJudge(ID, judgeOf('judge-c', 'Cy'));
    await vi.waitFor(async () => expect(await failed()).toHaveLength(1));

    expect(pickTargets(await pending())).toEqual(['judge-c']);
    const callsBefore = rpcCalls.filter(c => c.args.p_person_id === 'judge-c').length;
    await upload();
    expect(rpcCalls.filter(c => c.args.p_person_id === 'judge-c')).toHaveLength(callsBefore);

    rpcImpl = ok;
    await manager.discardFailedMutation((await failed())[0]!.id);
    await vi.waitFor(async () => {
      await upload();
      expect(await pending()).toEqual([]);
    });
    expect(rpcCalls.at(-1)?.args.p_person_id).toBe('judge-c');
    expect((await row())?.data.judgeId).toBe('judge-c');
  });

  it('uploads B then C when a parked B is retried', async () => {
    let bAttempts = 0;
    rpcImpl = async (_name, args) => {
      if (args.p_person_id !== 'judge-b') return offline();
      bAttempts += 1;
      return bAttempts === 1 ? parked('P0002')() : ok();
    };
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    await table.setClassJudge(ID, judgeOf('judge-c', 'Cy'));
    await vi.waitFor(async () => expect(await failed()).toHaveLength(1));

    rpcImpl = ok;
    await manager.retryFailedMutation((await failed())[0]!.id);
    await vi.waitFor(async () => {
      await upload();
      expect(await pending()).toEqual([]);
    });
    expect(rpcCalls.slice(-2).map(c => c.args.p_person_id)).toEqual(['judge-b', 'judge-c']);
    expect((await row())?.data.judgeId).toBe('judge-c');
  });

  it('discards an earlier failed pick when a newer pick is queued, so Retry cannot replay it', async () => {
    rpcImpl = parked('P0002');
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    await vi.waitFor(async () => expect(await failed()).toHaveLength(1));

    rpcImpl = ok;
    await table.setClassJudge(ID, judgeOf('judge-c', 'Cy'));

    expect(await failed()).toEqual([]);
    await vi.waitFor(async () => {
      await upload();
      expect(await pending()).toEqual([]);
    });
    expect(rpcCalls.filter(c => c.args.p_person_id === 'judge-b')).toHaveLength(1);
    expect(rpcCalls.at(-1)?.args.p_person_id).toBe('judge-c');
  });

  it('rejects, writes nothing and queues nothing when discarding a superseded pick throws', async () => {
    rpcImpl = parked('P0002');
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    await vi.waitFor(async () => expect(await failed()).toHaveLength(1));
    const before = await row();
    const [failure] = await failed();

    vi.spyOn(manager, 'discardFailedMutation').mockRejectedValue(new Error('queue busy'));
    await expect(table.setClassJudge(ID, judgeOf('judge-c', 'Cy'))).rejects.toThrow('queue busy');

    expect(await pending()).toEqual([]);
    expect((await failed()).map(m => m.id)).toEqual([failure!.id]);
    const after = await row();
    expect(after?.data).toEqual(before?.data);
    expect(after?.version).toBe(before?.version);
  });

  it('shows the new judge and holds exactly one pick after superseding a failed one', async () => {
    rpcImpl = parked('P0002');
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    await vi.waitFor(async () => expect(await failed()).toHaveLength(1));
    // The refused pick left the row dirty on judge B; discarding it reverts the row, and the
    // new pick's write must land AFTER that revert.
    rpcImpl = offline;

    await table.setClassJudge(ID, judgeOf('judge-c', 'Cy'));

    expect(await failed()).toEqual([]);
    expect(pickTargets(await pending())).toEqual(['judge-c']);
    expect(picks(await pending())[0]?.dependsOn).toBeUndefined();
    expect((await row())?.data).toMatchObject({ judgeId: 'judge-c', judgeFirstName: 'Cy' });
    expect((await row())?.isDirty).toBe(true);
  });

  it('waits behind a parked people INSERT: not uploaded until Retry succeeds', async () => {
    insertImpl = parked('42501');
    const person = await replicatedShowDeskPeopleTable.createPerson({
      id: 'person-parked',
      firstName: 'Pia',
      lastName: 'Parked',
    });
    await vi.waitFor(async () =>
      expect(
        (await manager.getFailedMutations()).filter(m => m.tableName === 'people')
      ).toHaveLength(1)
    );
    const [personFailure] = (await manager.getFailedMutations()).filter(
      m => m.tableName === 'people'
    );

    await table.setClassJudge(ID, judgeOf(person.id, 'Pia'));
    expect(picks(await pending())[0]?.dependsOn).toEqual([personFailure!.id]);

    rpcImpl = ok;
    await upload();
    expect(rpcCalls).toEqual([]);

    insertImpl = async () => ({ data: [{ id: person.id }], error: null });
    await manager.retryFailedMutation(personFailure!.id);
    await vi.waitFor(async () => {
      await upload();
      expect(rpcCalls).toHaveLength(1);
    });
    expect(rpcCalls[0]?.args).toEqual({ p_class_id: ID, p_person_id: person.id });
  });

  it('runs the pick once a parked people INSERT is discarded', async () => {
    insertImpl = parked('42501');
    const person = await replicatedShowDeskPeopleTable.createPerson({
      id: 'person-dropped',
      firstName: 'Dot',
      lastName: 'Dropped',
    });
    await vi.waitFor(async () =>
      expect(
        (await manager.getFailedMutations()).filter(m => m.tableName === 'people')
      ).toHaveLength(1)
    );
    const [personFailure] = (await manager.getFailedMutations()).filter(
      m => m.tableName === 'people'
    );
    await table.setClassJudge(ID, judgeOf(person.id, 'Dot'));
    rpcImpl = ok;
    await upload();
    expect(rpcCalls).toEqual([]);

    await manager.discardFailedMutation(personFailure!.id);
    await vi.waitFor(async () => {
      await upload();
      expect(rpcCalls).toHaveLength(1);
    });
  });

  it('makes a wizard pick wait behind a parked class INSERT', async () => {
    const wizardId = 'class-parked';
    insertImpl = parked('42501');
    await table.createClass({
      id: wizardId,
      trialId: 'trial-1',
      name: 'Parked Class',
      classStatus: 'not_started',
    } as ReplicatedClass);
    await vi.waitFor(async () =>
      expect(
        (await failed()).filter(m => m.operation === 'INSERT' && m.rowId === wizardId)
      ).toHaveLength(1)
    );
    const [insertFailure] = (await failed()).filter(m => m.operation === 'INSERT');

    await table.setClassJudge(wizardId, judgeOf('judge-b', 'Bob'));

    expect(picks(await pending())[0]?.dependsOn).toEqual([insertFailure!.id]);
    rpcImpl = ok;
    await upload();
    expect(rpcCalls).toEqual([]);
  });

  it('does not wait on an unrelated class edit, and an unrelated edit does not wait on the pick', async () => {
    await table.updateClass(ID, { description: 'Bring water' });
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));

    const [pick] = picks(await pending());
    expect(pick?.dependsOn).toBeUndefined();
  });

  it('makes a wizard pick wait for the class INSERT', async () => {
    const wizardId = 'class-wizard';
    await table.createClass({
      id: wizardId,
      trialId: 'trial-1',
      name: 'Wizard Class',
      classStatus: 'not_started',
    } as ReplicatedClass);
    await upsertClassJudgeAssignment(SHOW, wizardId, 'judge-b', judgeOf('judge-b', 'Bob'));

    const all = await pending();
    const insert = all.find(m => m.operation === 'INSERT' && m.rowId === wizardId);
    const pick = picks(all).find(m => m.rowId === wizardId);
    expect(insert).toBeDefined();
    expect(pick?.dependsOn).toEqual([insert!.id]);

    // INSERT still failing: the pick must not reach the server first.
    await upload();
    expect(rpcCalls.filter(c => c.args.p_class_id === wizardId)).toEqual([]);

    insertImpl = async () => ({ data: [{ id: wizardId }], error: null });
    rpcImpl = ok;
    await vi.waitFor(async () => {
      await upload();
      expect(rpcCalls.filter(c => c.args.p_class_id === wizardId)).toHaveLength(1);
    });
    expect(tablesWritten).toContain('classes');
  });

  it("makes a pick wait for the judge's own pending people INSERT", async () => {
    const person = await replicatedShowDeskPeopleTable.createPerson({
      id: 'person-new',
      firstName: 'Nia',
      lastName: 'Newjudge',
    });
    await table.setClassJudge(ID, judgeOf(person.id, 'Nia'));

    const personInsert = (await manager.getPendingMutationsForTable('people')).find(
      m => m.operation === 'INSERT' && m.rowId === person.id
    );
    const pick = picks(await pending())[0];
    expect(personInsert).toBeDefined();
    expect(pick?.dependsOn).toEqual([personInsert!.id]);

    // The INSERT keeps failing: the pick must not reach the server first (it would hit 22023).
    rpcImpl = ok;
    await upload();
    expect(rpcCalls).toEqual([]);

    insertImpl = async () => ({ data: [{ id: person.id }], error: null });
    await vi.waitFor(async () => {
      await upload();
      expect(rpcCalls).toHaveLength(1);
    });
    expect(rpcCalls[0]?.args).toEqual({ p_class_id: ID, p_person_id: person.id });
    expect(tablesWritten).toContain('people');
  });

  it('adds no person dependency when the judge has no pending people INSERT', async () => {
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    expect(picks(await pending())[0]?.dependsOn).toBeUndefined();
  });

  it('survives an offline reload: rebuilt from IndexedDB, the judge and the queued pick persist', async () => {
    await table.setClassJudge(ID, judgeOf('judge-b', 'Bob'));
    manager.destroy();

    // A fresh manager over the same IndexedDB, as after a reload.
    attach(makeSupabase());
    const reloaded = await row();
    expect(reloaded?.isDirty).toBe(true);
    expect(reloaded?.data).toMatchObject({ judgeId: 'judge-b', judgeFirstName: 'Bob' });
    expect(pickTargets(await pending())).toEqual(['judge-b']);

    rpcImpl = ok;
    await vi.waitFor(async () => {
      await upload();
      expect(await pending()).toEqual([]);
    });
    expect(rpcCalls.map(c => c.args.p_person_id)).toEqual(expect.arrayContaining(['judge-b']));
  });
});

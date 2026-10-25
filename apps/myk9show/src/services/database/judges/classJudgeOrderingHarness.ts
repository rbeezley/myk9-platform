/**
 * Shared harness for the MYK9-1327 class-judge upload-ordering tests: the real singleton
 * replica tables, a real MutationManager/MutationUploadRunner over fake-indexeddb, and a fake
 * Supabase transport that APPLIES the payloads it receives (so a stale column reverting the
 * server is observable). Call `useOrderingHarness()` inside a `describe`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, vi } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  type PendingMutation,
} from '@myk9/replication';
import {
  replicatedClassesTable,
  replicatedJudgeAssignmentsTable,
  type ReplicatedClass,
} from '@/services/replication';
import { bridge } from './classJudgeSupabaseBridge';
import { upsertClassJudgeAssignment } from './reads';

export const CLASS_ID = 'class-1';
export const SHOW_ID = 'show-1';
const AUTH = 'class-judge-ordering-user';

/** How the fake server treats judge_assignments writes. */
export type Transport = 'up' | 'down' | 'insertsDown' | 'denied';

export const judgeNames = (id: string, first: string) => ({
  judgeId: id,
  judgeName: `${first} Judge`,
  judgeFirstName: first,
  judgeLastName: 'Judge',
});

export function useOrderingHarness() {
  const h = {
    manager: undefined as unknown as MutationManager,
    transport: 'up' as Transport,
    /** person_id of each assignment row the fake server holds, by assignment id. */
    serverAssignments: new Map<string, string>(),
    /** The fake server's class row columns; UPDATE payloads are applied to it. */
    serverClass: {} as Record<string, unknown>,
    /** The fake server's class `version`: any judge_assignments write or class UPDATE bumps it. */
    serverVersion: 3,
    /** Every UPDATE payload the server received for the class, in arrival order. */
    classPayloads: [] as Array<Record<string, unknown>>,

    pick: (id: string, first: string) =>
      upsertClassJudgeAssignment(SHOW_ID, CLASS_ID, id, {
        name: `${first} Judge`,
        firstName: first,
        lastName: 'Judge',
      }),
    remove: () => upsertClassJudgeAssignment(SHOW_ID, CLASS_ID, 'TBD'),

    /** Another secretary assigns `personId` (or nobody) straight on the server. */
    serverAssigns: (personId: string | null) => {
      h.serverAssignments = new Map(personId ? [[`ja-${personId}`, personId]] : []);
      h.serverVersion += 1;
    },

    /** The server's class row as a sync or refetch would return it. */
    serverRow: () => ({
      id: CLASS_ID,
      trial_id: 'trial-1',
      name: 'Novice',
      status: 'not_started',
      allow_waitlist: false,
      updated_at: new Date().toISOString(),
      ...h.serverClass,
      version: h.serverVersion,
      judge_assignments: [...h.serverAssignments].map(([id, personId]) => ({
        id,
        person_id: personId,
        status: 'confirmed',
      })),
      _judgeResolved: false,
    }),

    /** The real `ReplicatedClassesTable.sync` against the fake server (a full sync). */
    sync: () => replicatedClassesTable.sync('trial-1', { forceFullSync: true }),

    pending: async (): Promise<PendingMutation[]> =>
      (await (
        await databaseManager.getDatabase('test')
      ).getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[],
    failed: async (): Promise<PendingMutation[]> =>
      (await (
        await databaseManager.getDatabase('test')
      ).getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[],

    /** Let every backed-off mutation retry now, then run a pass. */
    upload: async () => {
      const db = await databaseManager.getDatabase('test');
      for (const mutation of await h.pending()) {
        await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...mutation, nextRetryAt: undefined });
      }
      await h.manager.uploadPendingMutations();
    },

    localClass: () => replicatedClassesTable.getClassById(CLASS_ID),
    localJudgeId: async () => (await h.localClass())?.judgeId,
    classIsDirty: async () => (await replicatedClassesTable.getReplicatedRow(CLASS_ID))?.isDirty,
  };

  const fakeServer = (): SupabaseClient => {
    const gate = (table: string, isInsert: boolean) => {
      if (table !== 'judge_assignments') return null;
      if (h.transport === 'down' || (h.transport === 'insertsDown' && isInsert)) {
        throw new TypeError('Failed to fetch');
      }
      if (h.transport === 'denied') {
        return { data: null, error: { code: '42501', message: 'permission denied' } };
      }
      return null;
    };
    /** The trg_touch_class_on_judge_assignment_* trigger: an assignment write bumps the class. */
    const touchClass = (table: string) => {
      if (table === 'judge_assignments') h.serverVersion += 1;
    };
    const classRead = (options?: { head?: boolean }) => {
      const read = {
        gt: () => read,
        order: () => read,
        eq: () => read,
        in: () => read,
        maybeSingle: async () => ({ data: { version: h.serverVersion }, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(
            options?.head
              ? { count: 1, data: null, error: null }
              : { data: [h.serverRow()], error: null }
          ).then(resolve, reject),
      };
      return read;
    };
    return {
      from: (table: string) => ({
        select: (_columns: string, options?: { head?: boolean }) => classRead(options),
        insert: (row: { id: string; person_id: string }) => ({
          select: async () => {
            const refused = gate(table, true);
            if (refused) return refused;
            h.serverAssignments.set(row.id, row.person_id);
            touchClass(table);
            return { data: [{ id: row.id }], error: null };
          },
        }),
        delete: () => ({
          eq: (_column: string, id: string) => ({
            select: async () => {
              const refused = gate(table, false);
              if (refused) return refused;
              h.serverAssignments.delete(id);
              touchClass(table);
              return { data: [{ id }], error: null };
            },
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          let expectedVersion: unknown;
          const builder = {
            eq: (column: string, value: unknown) => {
              if (column === 'version') expectedVersion = value;
              return builder;
            },
            select: async () => {
              // The OCC precondition: a stale token matches no row.
              if (expectedVersion !== undefined && expectedVersion !== h.serverVersion) {
                return { data: [], error: null };
              }
              h.classPayloads.push(payload);
              const columns = { ...payload };
              delete columns.id;
              Object.assign(h.serverClass, columns);
              h.serverVersion += 1;
              return { data: [{ id: CLASS_ID, version: h.serverVersion }], error: null };
            },
          };
          return builder;
        },
      }),
    } as unknown as SupabaseClient;
  };

  let enrichSpy: { mockRestore: () => void } | undefined;

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    vi.stubGlobal('window', { dispatchEvent: () => true });
    h.transport = 'up';
    h.serverAssignments = new Map([['ja-judge-a', 'judge-a']]);
    h.serverClass = { entry_fee: 10 };
    h.serverVersion = 3;
    h.classPayloads = [];
    const supabase = fakeServer();
    bridge.client = supabase;
    // The enrichment RPCs are not under test: rows come back as a failed name lookup would.
    enrichSpy = vi
      .spyOn(
        replicatedClassesTable as unknown as {
          enrichClassRows: (rows: Array<Record<string, unknown>>) => Promise<unknown>;
        },
        'enrichClassRows'
      )
      .mockImplementation(async rows => rows);
    h.manager = new MutationManager(supabase, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: supabase }),
    });
    for (const table of [replicatedClassesTable, replicatedJudgeAssignmentsTable]) {
      await table.clearCache();
      table.setMutationManager(h.manager);
    }
    await replicatedClassesTable.set(
      CLASS_ID,
      {
        id: CLASS_ID,
        trialId: 'trial-1',
        name: 'Novice',
        classStatus: 'not_started',
        entryFee: 10,
        judgeResolved: true,
        ...judgeNames('judge-a', 'Ann'),
      } as ReplicatedClass,
      false,
      undefined,
      3
    );
    await replicatedJudgeAssignmentsTable.set(
      'ja-judge-a',
      {
        id: 'ja-judge-a',
        personId: 'judge-a',
        showId: SHOW_ID,
        trialId: null,
        classId: CLASS_ID,
        status: 'confirmed',
        _version: 1,
        _lastModified: new Date(),
        _syncStatus: 'synced',
      } as never,
      false,
      undefined,
      1
    );
  });

  afterEach(async () => {
    h.manager.destroy();
    bridge.client = null;
    enrichSpy?.mockRestore();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  return h;
}

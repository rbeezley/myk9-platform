/**
 * MYK9-1327 harness: the real singleton replicas (`classes`, `judge_assignments`) over
 * fake-indexeddb, a real MutationManager and upload runner, the real incremental syncs and the
 * real class enrichment. ONLY the network transport is faked: a small server that holds one
 * class and its class-level judge assignments, applies the writes it receives, bumps the class's
 * `updated_at` the way `trg_touch_class_on_judge_assignment_*` does, and answers
 * `get_show_judges` from its own assignments.
 *
 * Call `useClassJudgeHarness()` inside a `describe`; the file's test must mock
 * `@/services/database/supabaseClient` to `classJudgeSupabaseBridge` (see the tests).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  type PendingMutation,
} from '@myk9/replication';
import { upsertClassJudgeAssignment, reassignClassJudge } from '@/services/database/judges/reads';
import { invalidateClassEnrichment } from '../classEnrichmentCache';
import { replicatedClassesTable, replicatedJudgeAssignmentsTable } from '..';
import { ReplicatedClassesTable } from '../ReplicatedClassesTable';
import { replicatedClassJudgeClearsTable } from '../ReplicatedClassJudgeClearsTable';
import { bridge } from './classJudgeSupabaseBridge';

export const CLASS_ID = 'class-1';
export const TRIAL_ID = 'trial-1';
export const SHOW_ID = 'show-1';
const AUTH = 'class-judge-user';
const FIRST: Record<string, string> = {
  'judge-a': 'Ann',
  'judge-b': 'Bob',
  'judge-c': 'Cy',
  'judge-d': 'Dee',
};

/** How the fake server treats judge_assignments writes. */
export type Transport = 'up' | 'down' | 'insertsDown' | 'deletesDown' | 'denied';

export const pick = (id: string) => ({
  name: `${FIRST[id]} Judge`,
  firstName: FIRST[id],
  lastName: 'Judge',
});

export function useClassJudgeHarness() {
  // Ahead of the real clock, so a class pulled after an acknowledgement is newer than it.
  let clock = Date.now() + 3_600_000;
  const tick = () => new Date((clock += 10 * 60_000)).toISOString();

  const h = {
    manager: undefined as unknown as MutationManager,
    transport: 'up' as Transport,
    /** person_id of each class-level assignment the fake server holds, by assignment id. */
    serverAssignments: new Map<string, string>(),
    classUpdatedAt: tick(),
    classVersion: 3,
    /** Every request the transport saw, as "table:verb" (for ordering assertions). */
    requests: [] as string[],
    /** While set, the name lookup (get_show_judges) fails, as it can on a bad connection. */
    enrichmentDown: false,
    entryFee: 10,

    pick: (id: string) => upsertClassJudgeAssignment(SHOW_ID, CLASS_ID, id, pick(id)),
    pickWithoutName: (id: string) => upsertClassJudgeAssignment(SHOW_ID, CLASS_ID, id),
    clear: () => upsertClassJudgeAssignment(SHOW_ID, CLASS_ID, 'TBD'),
    reassign: (from: string, to: string) => reassignClassJudge(SHOW_ID, CLASS_ID, from, to),

    /** Another secretary changes the judge straight on the server (the trigger touches the class). */
    serverAssigns: (personId: string | null) => {
      h.serverAssignments = new Map(personId ? [[`ja-${personId}`, personId]] : []);
      h.touchClass();
    },
    touchClass: () => {
      h.classUpdatedAt = tick();
      h.classVersion += 1;
    },

    /** The real incremental `ReplicatedClassesTable.sync` (a watermark, never forceFullSync). */
    syncClasses: () => replicatedClassesTable.sync(TRIAL_ID),
    syncAssignments: () => replicatedJudgeAssignmentsTable.sync(),

    pending: async (): Promise<PendingMutation[]> =>
      (
        (await (
          await databaseManager.getDatabase('test')
        ).getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[]
      ).filter(m => m.tableName === 'judge_assignments'),
    failed: async (): Promise<PendingMutation[]> =>
      (
        (await (
          await databaseManager.getDatabase('test')
        ).getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[]
      ).filter(m => m.tableName === 'judge_assignments'),

    /** One upload pass as the app runs it (backoff honored). */
    pass: () => h.manager.uploadPendingMutations(),
    /** Let every backed-off mutation retry now, then run a pass. */
    retryNow: async () => {
      const db = await databaseManager.getDatabase('test');
      for (const mutation of await h.pending()) {
        await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...mutation, nextRetryAt: undefined });
      }
      await h.manager.uploadPendingMutations();
      // The upload-complete event stamps a cleared judge's tombstone: let it land.
      await new Promise(resolve => setTimeout(resolve, 30));
    },
    /** The pull a device runs: assignments, then classes. */
    catchUp: async () => {
      await h.syncAssignments();
      await h.syncClasses();
    },

    /** A reload: a fresh class table instance, with no memory of anything this session did. */
    reloaded: () => new ReplicatedClassesTable(),

    /** What a reader of the trial's classes sees. */
    shownClass: async () => (await replicatedClassesTable.getByTrialOrThrow(TRIAL_ID))[0],
    shownJudgeId: async () => (await h.shownClass())?.judgeId,
    /** What a reader of the single class row sees. */
    shownByIdJudgeId: async () => (await replicatedClassesTable.getClassById(CLASS_ID))?.judgeId,
    /** What the replica STORES on the class row (the raw, server-derived judge). */
    storedJudgeId: async () => (await replicatedClassesTable.get(CLASS_ID))?.judgeId,
    classIsDirty: async () => (await replicatedClassesTable.getReplicatedRow(CLASS_ID))?.isDirty,
  };

  const classRow = () => ({
    id: CLASS_ID,
    trial_id: TRIAL_ID,
    name: 'Novice',
    status: 'not_started',
    allow_waitlist: false,
    entry_fee: h.entryFee,
    updated_at: h.classUpdatedAt,
    version: h.classVersion,
    judge_assignments: [...h.serverAssignments].map(([id, personId]) => ({
      id,
      person_id: personId,
      status: 'confirmed',
    })),
  });

  const assignmentRows = () =>
    [...h.serverAssignments].map(([id, personId]) => ({
      id,
      person_id: personId,
      show_id: SHOW_ID,
      trial_id: null,
      class_id: CLASS_ID,
      status: 'confirmed',
      invited_at: null,
      confirmed_at: null,
      created_at: h.classUpdatedAt,
      updated_at: h.classUpdatedAt,
      version: 1,
      day_capacity_override: null,
      classes: { name: 'Novice', trial_id: TRIAL_ID, trials: { show_id: SHOW_ID } },
    }));

  const refused = (isInsert: boolean) => {
    if (h.transport === 'down') throw new TypeError('Failed to fetch');
    if (h.transport === 'insertsDown' && isInsert) throw new TypeError('Failed to fetch');
    if (h.transport === 'deletesDown' && !isInsert) throw new TypeError('Failed to fetch');
    if (h.transport === 'denied') {
      return { data: null, error: { code: '42501', message: 'permission denied' } };
    }
    return null;
  };

  /** A chainable read: every filter returns the builder, awaiting it resolves `rows()`. */
  const read = (table: string, options?: { head?: boolean }) => {
    let since = 0;
    let byId = false;
    const builder: Record<string, unknown> = {};
    for (const method of ['order', 'eq', 'is', 'or', 'range', 'limit']) {
      builder[method] = () => builder;
    }
    builder.in = () => {
      byId = true;
      return builder;
    };
    builder.gt = (_column: string, value: string) => {
      since = Date.parse(value);
      return builder;
    };
    builder.maybeSingle = async () => ({ data: { version: h.classVersion }, error: null });
    builder.then = async (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown
    ) => {
      h.requests.push(`${table}:select${byId ? ':byId' : ''}`);
      const rows =
        table === 'classes'
          ? [classRow()]
          : table === 'judge_assignments'
            ? assignmentRows()
            : table === 'trials'
              ? [{ id: TRIAL_ID, show_id: SHOW_ID }]
              : [];
      const fresh = rows.filter(row => {
        const updatedAt = (row as { updated_at?: string }).updated_at;
        return since === 0 || !updatedAt || Date.parse(updatedAt) > since;
      });
      return Promise.resolve(
        options?.head
          ? { count: rows.length, data: null, error: null }
          : { data: fresh, error: null }
      ).then(resolve, reject);
    };
    return builder;
  };

  const fakeTransport = () =>
    ({
      rpc: async (name: string) => {
        h.requests.push(`rpc:${name}`);
        if (name !== 'get_show_judges') return { data: [], error: null };
        if (h.enrichmentDown) return { data: null, error: { message: 'rpc unavailable' } };
        return {
          data: [...h.serverAssignments].map(([id, personId]) => ({
            assignment_id: id,
            person_id: personId,
            class_id: CLASS_ID,
            trial_id: null,
            status: 'confirmed',
            first_name: FIRST[personId],
            last_name: 'Judge',
          })),
          error: null,
        };
      },
      from: (table: string) => ({
        select: (_columns: string, options?: { head?: boolean }) => read(table, options),
        insert: (row: { id: string; person_id: string }) => ({
          select: async () => {
            h.requests.push(`${table}:insert:${row.person_id}`);
            const failure = refused(true);
            if (failure) return failure;
            h.serverAssignments.set(row.id, row.person_id);
            h.touchClass();
            return { data: [{ id: row.id }], error: null };
          },
        }),
        delete: () => ({
          eq: (_column: string, id: string) => ({
            select: async () => {
              h.requests.push(`${table}:delete:${id}`);
              const failure = refused(false);
              if (failure) return failure;
              h.serverAssignments.delete(id);
              h.touchClass();
              return { data: [{ id }], error: null };
            },
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          let expected: unknown;
          const builder = {
            eq: (column: string, value: unknown) => {
              if (column === 'version') expected = value;
              return builder;
            },
            select: async () => {
              h.requests.push(`${table}:update`);
              if (table === 'judge_assignments') {
                const failure = refused(false);
                if (failure) return failure;
                h.serverAssignments.set(String(payload.id), String(payload.person_id));
                h.touchClass();
                return { data: [{ id: payload.id, version: 2 }], error: null };
              }
              if (expected !== undefined && expected !== h.classVersion) {
                return { data: [], error: null };
              }
              if (payload.entry_fee !== undefined) h.entryFee = Number(payload.entry_fee);
              h.touchClass();
              return { data: [{ id: CLASS_ID, version: h.classVersion }], error: null };
            },
          };
          return builder;
        },
      }),
    }) as unknown as SupabaseClient;

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    invalidateClassEnrichment();
    h.transport = 'up';
    h.serverAssignments = new Map([['ja-judge-a', 'judge-a']]);
    h.classUpdatedAt = tick();
    h.classVersion = 3;
    h.enrichmentDown = false;
    h.entryFee = 10;
    h.requests = [];
    const supabase = fakeTransport();
    bridge.client = supabase as unknown as typeof bridge.client;
    h.manager = new MutationManager(supabase, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: supabase }),
    });
    await replicatedClassJudgeClearsTable.clearCache();
    for (const table of [replicatedClassesTable, replicatedJudgeAssignmentsTable]) {
      await table.clearCache();
      table.setMutationManager(h.manager);
    }
    // The first (full) syncs seed the replicas exactly as a device would hold them.
    await h.syncClasses();
    await h.syncAssignments();
    // Everything after this is incremental, behind the watermark.
    h.requests = [];
  });

  afterEach(async () => {
    h.manager.destroy();
    bridge.client = null;
    await databaseManager.reset();
  });

  return h;
}

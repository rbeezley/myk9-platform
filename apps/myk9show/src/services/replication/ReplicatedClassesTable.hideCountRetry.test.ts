/**
 * MYK9-1451 / MYK9-1458: when the hide-count lookup fails, the class sync still applies every
 * row, but never changes a hide count the device saved, and the next sync asks again for those
 * classes even if they did not change. Drives the real `sync()` (fetch, enrich, apply,
 * watermark) with Supabase mocked.
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

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => 'user-a',
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));

import { ReplicatedClassesTable, type ReplicatedClass } from './ReplicatedClassesTable';
import { invalidateClassEnrichment } from './classEnrichmentCache';
import { clearHideCountsOwed, markHideCountsOwed, owedHideCountClassIds } from './hideCountsOwed';

const ID = 'class-1';
const TRIAL = 'trial-1';
const AUTH = 'hide-count-retry-user';
const TRIALS = [{ id: TRIAL, show_id: 'show-1', registry_id: 'AKC' }];
const UPDATED_AT = '2026-10-27T12:00:00.000Z';
const SERVER_CLASS = {
  id: ID,
  trial_id: TRIAL,
  name: 'Novice',
  status: 'in_progress',
  allow_waitlist: false,
  element: 'Interior',
  level: 'Novice',
  version: 4,
  updated_at: UPDATED_AT,
};
const WARM_WATERMARK = Date.parse('2026-10-27T11:00:00.000Z');

type Answer = { data: unknown; error: unknown } | 'throw';

function builder(rows: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'in', 'eq', 'not', 'gt', 'order']) chain[step] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: error ? null : rows, error });
  return chain;
}

/** `classes` answers a by-id read (owed retry, row refetch) separately from the changed-rows read. */
function classesBuilder(changed: unknown[], byId: unknown[]) {
  let readById = false;
  const chain = builder([]);
  chain.in = (column: string) => {
    if (column === 'id') readById = true;
    return chain;
  };
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: readById ? byId : changed, error: null });
  return chain;
}

describe('class sync when the hide-count lookup fails (MYK9-1451)', () => {
  let table: ReplicatedClassesTable;
  let manager: MutationManager;
  let conflicts: unknown[];
  let rulesError: unknown;
  let changedClasses: unknown[];
  let classesById: unknown[];

  const officialLookup = (answer: Answer) =>
    mockRpc.mockImplementation(async (name: string) => {
      if (name !== 'get_shows_class_hide_counts') return { data: [], error: null };
      if (answer === 'throw') throw new Error('network down');
      return answer;
    });
  const lookupDown = () => officialLookup({ data: null, error: { message: 'rpc down' } });

  const sync = () => table.sync(TRIAL);
  const watermark = async () => (await table.getSyncMetadata(TRIAL))?.lastIncrementalSyncAt;
  const hideCount = async () => (await table.get(ID))?.hideCount;
  const refetchAdapter = () =>
    (
      table as unknown as { getRowRefetchAdapter(): RowRefetchAdapter<unknown, ReplicatedClass> }
    ).getRowRefetchAdapter();

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
    clearHideCountsOwed();
    rulesError = null;
    changedClasses = [SERVER_CLASS];
    classesById = [SERVER_CLASS];
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
    mockFrom.mockImplementation((name: string) => {
      if (name === 'trials') return builder(TRIALS);
      if (name === 'classes') return classesBuilder(changedClasses, classesById);
      if (name === 'sport_class_rules') return builder([], rulesError);
      return builder([]);
    });
    const offline = {
      from: () => ({
        update: () => {
          const call: Record<string, unknown> = {};
          call.eq = () => call;
          call.select = async () => {
            throw new TypeError('Failed to fetch');
          };
          return call;
        },
      }),
    } as unknown as SupabaseClient;
    manager = new MutationManager(offline, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: offline }),
    });
    table = new ReplicatedClassesTable();
    await table.clearCache();
    table.setMutationManager(manager);
    await table.set(
      ID,
      {
        id: ID,
        trialId: TRIAL,
        name: 'Novice',
        classStatus: 'not_started',
        hideCount: 5,
      } as ReplicatedClass,
      false,
      undefined,
      3
    );
    await table.updateSyncMetadata(
      { lastIncrementalSyncAt: WARM_WATERMARK, syncStatus: 'idle' },
      { scopeValue: TRIAL }
    );
  });

  afterEach(async () => {
    manager.destroy();
    vi.unstubAllGlobals();
    clearHideCountsOwed();
    await databaseManager.reset();
  });

  it.each([
    ['the official lookup returns an error', { data: null, error: { message: 'rpc down' } }],
    ['the official lookup throws', 'throw' as const],
  ])(
    'applies the class but keeps the saved count when %s, then retries the unchanged class',
    async (_label, failure) => {
      officialLookup(failure);

      const result = await sync();

      expect(result.success).toBe(true);
      expect((await table.get(ID))?.classStatus).toBe('in_progress');
      expect(await hideCount()).toBe(5);
      expect(await watermark()).toBe(Date.parse(UPDATED_AT));
      expect(owedHideCountClassIds(TRIAL)).toEqual([ID]);

      // Nothing changed on the server since; only the owed retry brings the class back.
      changedClasses = [];
      officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });
      expect((await sync()).success).toBe(true);

      expect(await hideCount()).toBe(7);
      expect(owedHideCountClassIds(TRIAL)).toEqual([]);
    }
  );

  it('keeps the saved count over a partial answer when the public rules read fails', async () => {
    rulesError = { message: 'rules down' };
    officialLookup({ data: [{ class_id: ID, num_hides: 9 }], error: null });

    expect((await sync()).success).toBe(true);
    expect(await hideCount()).toBe(5);

    rulesError = null;
    changedClasses = [];
    expect((await sync()).success).toBe(true);
    expect(await hideCount()).toBe(9);
  });

  it('clears the count when the lookup succeeds and returns none for the class', async () => {
    officialLookup({ data: [], error: null });

    const result = await sync();

    expect(result.success).toBe(true);
    expect(await hideCount()).toBeUndefined();
    expect(await watermark()).toBe(Date.parse(UPDATED_AT));
    expect(owedHideCountClassIds(TRIAL)).toEqual([]);
  });

  it('keeps a dirty row untouched, with no conflict, when the lookup fails', async () => {
    await table.updateClass(ID, { description: 'pending edit' });
    expect((await table.getReplicatedRow(ID))?.isDirty).toBe(true);
    lookupDown();

    await sync();

    expect(conflicts).toEqual([]);
    const row = await table.getReplicatedRow(ID);
    expect(row?.data.description).toBe('pending edit');
    expect(row?.data.hideCount).toBe(5);
  });

  it('fills a cold device count on the next sync even though the class never changed', async () => {
    await table.clearCache();
    lookupDown();

    expect((await sync()).success).toBe(true);
    expect((await table.get(ID))?.classStatus).toBe('in_progress');
    expect(await hideCount()).toBeUndefined();

    changedClasses = [];
    officialLookup({ data: [{ class_id: ID, num_hides: 4 }], error: null });
    expect((await sync()).success).toBe(true);

    expect(await hideCount()).toBe(4);
  });

  it('stops owing a class the server no longer returns', async () => {
    lookupDown();
    await sync();
    expect(owedHideCountClassIds(TRIAL)).toEqual([ID]);

    changedClasses = [];
    classesById = [];
    await sync();

    expect(owedHideCountClassIds(TRIAL)).toEqual([]);
  });

  it('does not hold the sync when the owed retry read fails, and keeps the class owed', async () => {
    lookupDown();
    await sync();
    const changedAt = '2026-10-27T13:00:00.000Z';
    const OTHER = 'class-2';
    mockFrom.mockImplementation((name: string) => {
      if (name === 'trials') return builder(TRIALS);
      if (name === 'classes') {
        const chain = builder([]);
        chain.in = () => builder([], { message: 'URI too long' });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data: [{ ...SERVER_CLASS, id: OTHER, status: 'completed', updated_at: changedAt }],
            error: null,
          });
        return chain;
      }
      return builder([]);
    });
    officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });

    expect((await sync()).success).toBe(true);

    expect((await table.get(OTHER))?.classStatus).toBe('completed');
    expect(await watermark()).toBe(Date.parse(changedAt));
    expect(await hideCount()).toBe(5);
    expect(owedHideCountClassIds(TRIAL)).toContain(ID);
  });

  it('keeps a class owed when the sync fails after its lookup answered', async () => {
    lookupDown();
    await sync();
    changedClasses = [];
    officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });
    vi.spyOn(table, 'batchSet').mockRejectedValueOnce(new Error('IDB write failed'));

    expect((await sync()).success).toBe(false);
    expect(owedHideCountClassIds(TRIAL)).toEqual([ID]);

    expect((await sync()).success).toBe(true);
    expect(await hideCount()).toBe(7);
    expect(owedHideCountClassIds(TRIAL)).toEqual([]);
  });

  it('keeps a class with an unsent edit owed until a later sync applies its count', async () => {
    lookupDown();
    await sync();
    await table.updateClass(ID, { description: 'pending edit' });
    changedClasses = [];
    officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });

    await sync();

    expect(owedHideCountClassIds(TRIAL)).toEqual([ID]);
  });

  it('retries owed classes on the all-trials sync too', async () => {
    lookupDown();
    await sync();
    changedClasses = [];
    officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });

    expect((await table.sync('')).success).toBe(true);

    expect(await hideCount()).toBe(7);
    expect(owedHideCountClassIds(TRIAL)).toEqual([]);
  });

  it('keeps a class owed when it held an unsent edit as the sync started', async () => {
    lookupDown();
    await sync();
    changedClasses = [];
    officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });
    const realRead = table.getReplicatedRowIncludingOtherAccounts.bind(table);
    vi.spyOn(table, 'getReplicatedRowIncludingOtherAccounts').mockImplementationOnce(async id => {
      const row = await realRead(id);
      return row ? { ...row, isDirty: true } : row;
    });

    expect((await sync()).success).toBe(true);

    expect(owedHideCountClassIds(TRIAL)).toEqual([ID]);
  });

  it("keeps a class owed while another account's unsent edit holds its row", async () => {
    lookupDown();
    await sync();
    changedClasses = [];
    officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });
    const realRead = table.getReplicatedRowIncludingOtherAccounts.bind(table);
    vi.spyOn(table, 'getReplicatedRowIncludingOtherAccounts').mockImplementation(async id => {
      const row = await realRead(id);
      return row ? { ...row, isDirty: true, ownerAuthUserId: 'other-account' } : row;
    });
    // The signed-in account's own view does not see the other account's row.
    vi.spyOn(table, 'getReplicatedRow').mockResolvedValue(null);

    expect((await sync()).success).toBe(true);

    expect(owedHideCountClassIds(TRIAL)).toEqual([ID]);
  });

  it.each([
    ['as the sync starts', 1],
    ['as it settles', 3],
  ])(
    'keeps the sync result and the class owed when the device store read fails %s',
    async (_label, failingCall) => {
      lookupDown();
      await sync();
      changedClasses = [];
      officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });
      // Calls in order: the sync-start check, the engine's own read of the owed row, the settle.
      const realRead = table.getReplicatedRowIncludingOtherAccounts.bind(table);
      let call = 0;
      vi.spyOn(table, 'getReplicatedRowIncludingOtherAccounts').mockImplementation(async id => {
        call += 1;
        if (call === failingCall) throw new Error('IDB read failed');
        return realRead(id);
      });

      expect((await sync()).success).toBe(true);

      expect(await hideCount()).toBe(7);
      expect(owedHideCountClassIds(TRIAL)).toEqual([ID]);
    }
  );

  it('keeps reading later owed chunks when one fails', async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ ...SERVER_CLASS, id: `owed-${i}` }));
    markHideCountsOwed(many);
    changedClasses = [];
    let read = 0;
    mockFrom.mockImplementation((name: string) => {
      if (name === 'trials') return builder(TRIALS);
      if (name === 'classes') {
        const chain = builder([]);
        chain.in = (_column: string, ids: string[]) => {
          read += 1;
          return read === 1
            ? builder([], { message: 'gateway timeout' })
            : builder(ids.map(id => ({ ...SERVER_CLASS, id })));
        };
        return chain;
      }
      return builder([]);
    });
    officialLookup({ data: [], error: null });

    expect((await sync()).success).toBe(true);

    expect(await table.get('owed-120')).toBeTruthy();
    expect(owedHideCountClassIds(TRIAL)).toHaveLength(100);
  });

  it('reads a long owed list in chunks', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ ...SERVER_CLASS, id: `owed-${i}` }));
    markHideCountsOwed(many);
    changedClasses = [];
    const chunks: number[] = [];
    mockFrom.mockImplementation((name: string) => {
      if (name === 'trials') return builder(TRIALS);
      if (name === 'classes') {
        const chain = builder([]);
        chain.in = (_column: string, ids: string[]) => {
          chunks.push(ids.length);
          return builder([]);
        };
        return chain;
      }
      return builder([]);
    });
    officialLookup({ data: [], error: null });

    await sync();

    expect(chunks).toEqual([100, 100, 50]);
    expect(owedHideCountClassIds(TRIAL)).toEqual([]);
  });

  it('refetches a dirty row for the OCC rebase without a conflict, keeping the saved count', async () => {
    await table.updateClass(ID, { description: 'pending edit' });
    lookupDown();

    const rebased = await refetchDirtyRowsById(table, refetchAdapter(), [ID]);

    expect(rebased).toBe(1);
    expect(conflicts).toEqual([]);
    const row = await table.getReplicatedRow(ID);
    expect(row?.data.description).toBe('pending edit');
    expect(row?.data.hideCount).toBe(5);
  });

  it('does not carry a count back when an account-boundary strip runs during the lookup', async () => {
    lookupDown();
    const adapter = refetchAdapter();
    const originalGet = table.get.bind(table);
    let strip: Promise<void> | undefined;
    vi.spyOn(table, 'get').mockImplementation(async id => {
      const local = await originalGet(id);
      strip ??= table.clearCachedHideCounts();
      return local;
    });

    const rows = await adapter.fetchRowsById([ID]);
    await strip;

    expect(adapter.toLocalRow(rows[0]).hideCount).toBeUndefined();
  });

  it('does not bring a stripped count back when the lookup then fails', async () => {
    await table.clearCachedHideCounts();
    expect(await hideCount()).toBeUndefined();
    lookupDown();

    expect((await sync()).success).toBe(true);

    expect(await hideCount()).toBeUndefined();
  });
});

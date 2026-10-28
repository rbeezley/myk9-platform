/**
 * MYK9-1451: when the hide-count lookup fails, the class sync applies nothing and leaves its
 * watermark where it was, so a warm device keeps the judge-set count and the next sync retries.
 * Drives the real `sync()` (fetch, enrich, apply, watermark) with Supabase mocked.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
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

describe('class sync when the hide-count lookup fails (MYK9-1451)', () => {
  let table: ReplicatedClassesTable;
  let manager: MutationManager;
  let conflicts: unknown[];
  let rulesError: unknown;

  const officialLookup = (answer: Answer) =>
    mockRpc.mockImplementation(async (name: string) => {
      if (name !== 'get_shows_class_hide_counts') return { data: [], error: null };
      if (answer === 'throw') throw new Error('network down');
      return answer;
    });

  const sync = () => table.sync(TRIAL);
  const watermark = async () => (await table.getSyncMetadata(TRIAL))?.lastIncrementalSyncAt;

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
    rulesError = null;
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
      if (name === 'classes') return builder([SERVER_CLASS]);
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
      { lastIncrementalSyncAt: WARM_WATERMARK, syncStatus: 'success' },
      { scopeValue: TRIAL }
    );
  });

  afterEach(async () => {
    manager.destroy();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  const hideCount = async () => (await table.get(ID))?.hideCount;

  it.each([
    ['the official lookup returns an error', { data: null, error: { message: 'rpc down' } }],
    ['the official lookup throws', 'throw' as const],
  ])(
    'keeps the count and the watermark when %s, then picks up the count on the next sync',
    async (_label, failure) => {
      officialLookup(failure);

      const result = await sync();

      expect(result.success).toBe(false);
      expect(await hideCount()).toBe(5);
      expect(await watermark()).toBe(WARM_WATERMARK);
      expect((await table.get(ID))?.classStatus).toBe('not_started');

      officialLookup({ data: [{ class_id: ID, num_hides: 7 }], error: null });
      const retry = await sync();

      expect(retry.success).toBe(true);
      expect(await hideCount()).toBe(7);
      expect((await table.get(ID))?.classStatus).toBe('in_progress');
      expect(await watermark()).toBe(Date.parse(UPDATED_AT));
    }
  );

  it('keeps the count and the watermark when the public rules read fails', async () => {
    rulesError = { message: 'rules down' };
    officialLookup({ data: [{ class_id: ID, num_hides: 9 }], error: null });

    const result = await sync();

    expect(result.success).toBe(false);
    expect(await hideCount()).toBe(5);
    expect(await watermark()).toBe(WARM_WATERMARK);

    rulesError = null;
    expect((await sync()).success).toBe(true);
    expect(await hideCount()).toBe(9);
  });

  it('clears the count when the lookup succeeds and returns none for the class', async () => {
    officialLookup({ data: [], error: null });

    const result = await sync();

    expect(result.success).toBe(true);
    expect(await hideCount()).toBeUndefined();
    expect(await watermark()).toBe(Date.parse(UPDATED_AT));
  });

  it('keeps a dirty row untouched, with no conflict, when the lookup fails', async () => {
    await table.updateClass(ID, { description: 'pending edit' });
    expect((await table.getReplicatedRow(ID))?.isDirty).toBe(true);
    officialLookup({ data: null, error: { message: 'rpc down' } });

    const result = await sync();

    expect(result.success).toBe(false);
    expect(conflicts).toEqual([]);
    const row = await table.getReplicatedRow(ID);
    expect(row?.data.description).toBe('pending edit');
    expect(row?.data.hideCount).toBe(5);
    expect(await watermark()).toBe(WARM_WATERMARK);
  });

  it('does not bring a stripped count back when the lookup then fails', async () => {
    await table.clearCachedHideCounts();
    expect(await hideCount()).toBeUndefined();
    officialLookup({ data: null, error: { message: 'rpc down' } });

    await sync();

    expect(await hideCount()).toBeUndefined();
  });
});

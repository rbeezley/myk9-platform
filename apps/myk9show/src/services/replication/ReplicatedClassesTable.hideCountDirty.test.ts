/**
 * MYK9-1451 on the dirty-row path: a class with a pending local edit merges through the
 * 3-way dirty merge, never `resolveConflict`. A failed official hide-count lookup must not
 * wipe the persisted count there either; a lookup that answered with no count still clears it.
 * Also the role-boundary strip (criterion 3): after `clearCachedHideCounts`, a failed lookup
 * must not bring the old count back.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  refetchDirtyRowsById,
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
const AUTH = 'hide-count-dirty-user';
const TRIALS = [{ id: 'trial-1', show_id: 'show-1', registry_id: 'AKC' }];
const SERVER_CLASS = {
  id: ID,
  trial_id: 'trial-1',
  name: 'Novice',
  status: 'in_progress',
  allow_waitlist: false,
  element: 'Interior',
  level: 'Novice',
  version: 4,
};

function builder(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'in', 'eq', 'not']) chain[step] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
  return chain;
}

describe('hide count on the dirty-row and role-boundary paths (MYK9-1451)', () => {
  let table: ReplicatedClassesTable;
  let manager: MutationManager;
  let conflicts: unknown[];

  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
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
    mockFrom.mockImplementation((name: string) =>
      builder(name === 'trials' ? TRIALS : name === 'classes' ? [SERVER_CLASS] : [])
    );
    // The device's own upload never lands, so the edit stays queued and the row dirty.
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
        trialId: 'trial-1',
        name: 'Novice',
        classStatus: 'in_progress',
        hideCount: 5,
        hideCountResolved: true,
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

  const officialLookup = (result: { data: unknown; error: unknown }) =>
    mockRpc.mockImplementation(async (name: string) =>
      name === 'get_shows_class_hide_counts' ? result : { data: [], error: null }
    );

  async function refetchDirty() {
    await table.updateClass(ID, { description: 'pending edit' });
    expect((await table.getReplicatedRow(ID))?.isDirty).toBe(true);
    const adapter = (
      table as unknown as { getRowRefetchAdapter(): Parameters<typeof refetchDirtyRowsById>[1] }
    ).getRowRefetchAdapter();
    await refetchDirtyRowsById(table, adapter, [ID]);
    return table.getReplicatedRow(ID);
  }

  it('keeps the persisted count on a dirty row when the official lookup failed', async () => {
    officialLookup({ data: null, error: { message: 'rpc down' } });

    const row = await refetchDirty();

    expect(conflicts).toEqual([]);
    expect(row?.data.description).toBe('pending edit');
    expect(row?.data.hideCount).toBe(5);
  });

  it('clears the count on a dirty row when the lookup answered with no count', async () => {
    officialLookup({ data: [], error: null });

    const row = await refetchDirty();

    expect(conflicts).toEqual([]);
    expect(row?.data.description).toBe('pending edit');
    expect(row?.data.hideCount).toBeUndefined();
  });

  it('does not bring a stripped count back when the lookup then fails', async () => {
    await table.clearCachedHideCounts();
    const stripped = await table.getReplicatedRow(ID);
    expect(stripped?.data.hideCount).toBeUndefined();

    officialLookup({ data: null, error: { message: 'rpc down' } });
    const [enriched] = await (
      table as unknown as { enrichClassRows(rows: unknown[]): Promise<unknown[]> }
    ).enrichClassRows([SERVER_CLASS]);
    const adapter = (
      table as unknown as {
        getRowRefetchAdapter(): { toLocalRow(remote: unknown): ReplicatedClass };
      }
    ).getRowRefetchAdapter();
    const merged = (
      table as unknown as {
        resolveConflict(local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass;
      }
    ).resolveConflict(stripped!.data, adapter.toLocalRow(enriched));

    expect(merged.hideCount).toBeUndefined();
  });
});

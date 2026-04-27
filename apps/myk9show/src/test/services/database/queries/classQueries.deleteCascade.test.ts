/**
 * deleteClass cascade tests.
 *
 * Verifies that soft-deleting a class also soft-deletes its entries — the
 * application-layer cascade that mirrors `soft_delete_show` (migration 037).
 * Without this, entries point at a "deleted" class and surface as orphans in
 * exhibitor-facing views.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseUpdates: Array<{ table: string; payload: Record<string, unknown> }> = [];
const supabaseFilters: Array<{ table: string; column: string; value: unknown }> = [];

const { mockSupabase } = vi.hoisted(() => {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const filters: Array<{ table: string; column: string; value: unknown }> = [];

  return {
    mockSupabase: {
      _updates: updates,
      _filters: filters,
      from: vi.fn((table: string) => {
        // Track what's being done so the test can assert call order.
        const builder: Record<string, unknown> = {};
        builder.update = vi.fn((payload: Record<string, unknown>) => {
          updates.push({ table, payload });
          return builder;
        });
        builder.eq = vi.fn((column: string, value: unknown) => {
          filters.push({ table, column, value });
          return builder;
        });
        builder.is = vi.fn(() => builder);
        builder.select = vi.fn(() => builder);
        // .single() resolves the chain into a Supabase-shaped response.
        builder.single = vi.fn(async () => ({
          data: { id: filters.find(f => f.table === table)?.value, name: 'Test Class' },
          error: null,
        }));
        // For non-.single() chains (entries update), the chain itself awaits
        // to a {data, error} shape — make `.is` return a thenable.
        const thenable = {
          then: (resolve: (v: { data: null; error: null }) => unknown) =>
            resolve({ data: null, error: null }),
        };
        builder.is = vi.fn(() => thenable as unknown);
        return builder;
      }),
    },
  };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((err: unknown) =>
    err instanceof Error ? err : new Error(String(err))
  ),
  DatabaseError: class DatabaseError extends Error {},
}));

vi.mock('../../../../src/services/database/queries/replicationUtils', () => ({
  withReplicationFallback: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getAll: vi.fn(), getClassById: vi.fn(), getClassesByTrial: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getAll: vi.fn(), getEntriesByClass: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getAll: vi.fn(), getTrialById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAll: vi.fn() },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { deleteClass } from '@/services/database/queries/classQueries';

describe('deleteClass cascade behavior', () => {
  beforeEach(() => {
    supabaseUpdates.length = 0;
    supabaseFilters.length = 0;
    mockSupabase._updates.length = 0;
    mockSupabase._filters.length = 0;
    vi.clearAllMocks();
  });

  it('soft-deletes entries before the class', async () => {
    const classId = 'class-1';
    await deleteClass(classId, 'user-1');

    const tablesUpdated = mockSupabase._updates.map(u => u.table);
    expect(tablesUpdated).toEqual(['entries', 'classes']);
  });

  it('filters the entries update by class_id', async () => {
    const classId = 'class-with-entries';
    await deleteClass(classId);

    const entryFilter = mockSupabase._filters.find(
      f => f.table === 'entries' && f.column === 'class_id'
    );
    expect(entryFilter?.value).toBe(classId);
  });

  it('sets deleted_at on both the entries and the class row', async () => {
    await deleteClass('class-1', 'user-1');

    const entriesUpdate = mockSupabase._updates.find(u => u.table === 'entries');
    const classUpdate = mockSupabase._updates.find(u => u.table === 'classes');

    expect(entriesUpdate?.payload.deleted_at).toBeTypeOf('string');
    expect(classUpdate?.payload.deleted_at).toBeTypeOf('string');
  });

  it('records the deleting user on both tables when provided', async () => {
    await deleteClass('class-1', 'user-7');

    const entriesUpdate = mockSupabase._updates.find(u => u.table === 'entries');
    const classUpdate = mockSupabase._updates.find(u => u.table === 'classes');

    expect(entriesUpdate?.payload.deleted_by).toBe('user-7');
    expect(classUpdate?.payload.deleted_by).toBe('user-7');
  });

  it('omits deleted_by when the deleting user is not provided', async () => {
    await deleteClass('class-1');

    const entriesUpdate = mockSupabase._updates.find(u => u.table === 'entries');
    const classUpdate = mockSupabase._updates.find(u => u.table === 'classes');

    expect('deleted_by' in (entriesUpdate?.payload ?? {})).toBe(false);
    expect('deleted_by' in (classUpdate?.payload ?? {})).toBe(false);
  });
});

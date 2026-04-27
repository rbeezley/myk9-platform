/**
 * deleteClass cascade tests.
 *
 * Verifies that soft-deleting a class also soft-deletes its entries — the
 * application-layer cascade that mirrors `soft_delete_show` (migration 037).
 * Without this, entries point at a "deleted" class and surface as orphans in
 * exhibitor-facing views.
 *
 * Cascade ordering matters: the class is updated first so a permission failure
 * short-circuits before entries are touched (no half-state where entries are
 * wiped against a surviving class).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface RecordedUpdate {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ column: string; value: unknown }>;
}

const { mockSupabase, recorded } = vi.hoisted(() => {
  const updates: RecordedUpdate[] = [];

  type ResponseShape = { data: unknown; error: unknown };
  const responseByTable: Record<string, ResponseShape> = {
    classes: { data: { id: 'class-1', name: 'Test Class' }, error: null },
    entries: { data: [{ id: 'entry-1' }, { id: 'entry-2' }], error: null },
  };

  function makeBuilder(table: string): Record<string, unknown> {
    const current: RecordedUpdate = { table, payload: {}, filters: [] };
    const builder: Record<string, unknown> = {};
    const finalize = () => Promise.resolve(responseByTable[table]);

    builder.update = (payload: Record<string, unknown>) => {
      current.payload = payload;
      updates.push(current);
      return builder;
    };
    builder.eq = (column: string, value: unknown) => {
      current.filters.push({ column, value });
      return builder;
    };
    builder.is = () => builder;
    builder.select = () => builder;
    // .single() resolves the chain (used by the classes update)
    builder.single = () => finalize();
    // For chains that don't end in .single() (entries update), the builder
    // itself must be awaitable.
    (builder as unknown as { then: (...args: unknown[]) => unknown }).then = (
      resolve: (v: ResponseShape) => unknown
    ) => finalize().then(resolve);
    return builder;
  }

  return {
    recorded: { updates, responseByTable },
    mockSupabase: {
      from: vi.fn((table: string) => makeBuilder(table)),
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
    recorded.updates.length = 0;
    recorded.responseByTable.classes = { data: { id: 'class-1', name: 'Test Class' }, error: null };
    recorded.responseByTable.entries = { data: [{ id: 'entry-1' }], error: null };
    vi.clearAllMocks();
  });

  it('returns success with the deleted class on the happy path', async () => {
    const result = await deleteClass('class-1', 'user-1');
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 'class-1', name: 'Test Class' });
  });

  it('soft-deletes the class first, then its entries', async () => {
    await deleteClass('class-1', 'user-1');
    const tablesUpdated = recorded.updates.map(u => u.table);
    expect(tablesUpdated).toEqual(['classes', 'entries']);
  });

  it('filters the entries update by class_id', async () => {
    const classId = 'class-with-entries';
    await deleteClass(classId);
    const entryFilter = recorded.updates
      .find(u => u.table === 'entries')
      ?.filters.find(f => f.column === 'class_id');
    expect(entryFilter?.value).toBe(classId);
  });

  it('sets deleted_at on both the class and the entries', async () => {
    await deleteClass('class-1', 'user-1');
    const classUpdate = recorded.updates.find(u => u.table === 'classes');
    const entriesUpdate = recorded.updates.find(u => u.table === 'entries');
    expect(classUpdate?.payload.deleted_at).toBeTypeOf('string');
    expect(entriesUpdate?.payload.deleted_at).toBeTypeOf('string');
  });

  it('records the deleting user on both tables when provided', async () => {
    await deleteClass('class-1', 'user-7');
    const classUpdate = recorded.updates.find(u => u.table === 'classes');
    const entriesUpdate = recorded.updates.find(u => u.table === 'entries');
    expect(classUpdate?.payload.deleted_by).toBe('user-7');
    expect(entriesUpdate?.payload.deleted_by).toBe('user-7');
  });

  it('omits deleted_by when the deleting user is not provided', async () => {
    await deleteClass('class-1');
    const classUpdate = recorded.updates.find(u => u.table === 'classes');
    const entriesUpdate = recorded.updates.find(u => u.table === 'entries');
    expect('deleted_by' in (classUpdate?.payload ?? {})).toBe(false);
    expect('deleted_by' in (entriesUpdate?.payload ?? {})).toBe(false);
  });

  it('short-circuits without touching entries when the class update fails', async () => {
    recorded.responseByTable.classes = {
      data: null,
      error: { message: 'rls denied', code: '42501' },
    };
    const result = await deleteClass('class-1', 'user-1');
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    const tablesUpdated = recorded.updates.map(u => u.table);
    expect(tablesUpdated).toEqual(['classes']);
  });
});

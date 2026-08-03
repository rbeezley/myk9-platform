import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

import { fetchEntryCountsByClassIds } from '../entryCounts';

/** Captures the filter chain each per-class count query builds. */
function mockCounts(countByClassId: Record<string, number>) {
  const eqCalls: Array<[string, string]> = [];
  const isCalls: Array<[string, unknown]> = [];
  const selectCalls: Array<[string, unknown]> = [];
  let call = 0;
  const order = Object.keys(countByClassId);

  mockSupabase.from.mockImplementation(() => {
    const classId = order[call++]!;
    const query = createChainableQuery({ count: countByClassId[classId], error: null });
    const select = query.select;
    const eq = query.eq;
    const is = query.is;
    select.mockImplementation((columns: unknown, options: unknown) => {
      selectCalls.push([String(columns), options]);
      return query;
    });
    eq.mockImplementation((column: unknown, value: unknown) => {
      eqCalls.push([String(column), String(value)]);
      return query;
    });
    is.mockImplementation((column: unknown, value: unknown) => {
      isCalls.push([String(column), value]);
      return query;
    });
    return query;
  });

  return { eqCalls, isCalls, selectCalls };
}

describe('fetchEntryCountsByClassIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockSupabase();
  });

  it('returns an exact count per class id', async () => {
    mockCounts({ 'class-a': 8, 'class-b': 0 });

    const counts = await fetchEntryCountsByClassIds(['class-a', 'class-b'], 'op');

    expect(counts.get('class-a')).toBe(8);
    // A real zero, distinguishable from "not counted" (undefined).
    expect(counts.get('class-b')).toBe(0);
  });

  it('makes no request and returns an empty map for no classes', async () => {
    const counts = await fetchEntryCountsByClassIds([], 'op');

    expect(counts.size).toBe(0);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('excludes soft-deleted entries so the total matches a deep-linked result set', async () => {
    const { isCalls } = mockCounts({ 'class-a': 3 });

    await fetchEntryCountsByClassIds(['class-a'], 'op');

    expect(isCalls).toContainEqual(['deleted_at', null]);
  });

  it('names a column and uses a head count, never select(*)', async () => {
    // `select('*', { count })` on entries is a 403 with an empty body under the
    // anon column allowlist, even with head:true — it asks for columns the role
    // cannot read. The TV board is a public surface, so this must stay pinned.
    const { selectCalls } = mockCounts({ 'class-a': 1 });

    await fetchEntryCountsByClassIds(['class-a'], 'op');

    expect(selectCalls).toEqual([['class_id', { count: 'exact', head: true }]]);
  });

  it('throws so replication-backed callers can fall back instead of reporting zero', async () => {
    mockSupabase.from.mockImplementation(() =>
      createChainableQuery({ count: null, error: { message: 'permission denied' } })
    );

    await expect(fetchEntryCountsByClassIds(['class-a'], 'op')).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});

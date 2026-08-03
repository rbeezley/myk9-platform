import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

import { fetchEntryCountsByClassIds, fetchPublicEntryCountsByShow } from '../entryCounts';

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

describe('fetchPublicEntryCountsByShow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockSupabase();
  });

  function mockCountRpc(result: unknown) {
    mockSupabase.rpc.mockImplementation(() => Promise.resolve(result));
  }

  // The point of the definer RPC: the count is derived from the SHOW, so it
  // cannot vary with who is looking. Reading `entries` directly is what let a
  // signed-in exhibitor see "3 / 2" on a public board (MYK9-65).
  it('reads the show-scoped RPC and never touches the entries table', async () => {
    mockCountRpc({
      data: [{ class_id: 'class-a', entry_count: 66, scored_count: 4 }],
      error: null,
    });

    const counts = await fetchPublicEntryCountsByShow('show-1', ['class-a'], 'op');

    // Numerator and denominator arrive together, from one row of one query, so
    // the board cannot render a scored count larger than its total (MYK9-65).
    expect(counts.get('class-a')).toEqual({ total: 66, scored: 4 });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('tv_class_entry_counts', {
      p_show_id: 'show-1',
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  // The server groups by class and omits empty classes rather than echoing back
  // a caller-supplied id list. Callers still expect every requested id present,
  // so a class with no entries must read 0 — not `undefined`, which the board
  // would render as "unavailable" and hide the counter on a perfectly healthy
  // empty class.
  it('fills classes the RPC omitted with zero', async () => {
    mockCountRpc({
      data: [{ class_id: 'class-a', entry_count: 4, scored_count: 1 }],
      error: null,
    });

    const counts = await fetchPublicEntryCountsByShow('show-1', ['class-a', 'empty-class'], 'op');

    expect([...counts.entries()]).toEqual([
      ['class-a', { total: 4, scored: 1 }],
      ['empty-class', { total: 0, scored: 0 }],
    ]);
  });

  // A class the caller did not ask about must not appear, or a board rendering
  // one trial would size itself from another trial's classes.
  it('returns only the requested class ids', async () => {
    mockCountRpc({
      data: [
        { class_id: 'class-a', entry_count: 4, scored_count: 0 },
        { class_id: 'other-trial-class', entry_count: 99, scored_count: 9 },
      ],
      error: null,
    });

    const counts = await fetchPublicEntryCountsByShow('show-1', ['class-a'], 'op');

    expect([...counts.keys()]).toEqual(['class-a']);
  });

  // Same contract as the session-scoped helper: throw, so the public surface can
  // render "unavailable" instead of a confident, wrong zero.
  it('throws rather than reporting zero when the RPC fails', async () => {
    mockCountRpc({ data: null, error: { message: 'permission denied for function' } });

    await expect(fetchPublicEntryCountsByShow('show-1', ['class-a'], 'op')).rejects.toMatchObject({
      message: 'permission denied for function',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  result: { data: [] as Array<{ id: string }> | null, error: null as unknown },
  /** When set, each page is answered from this list in turn (keyset paging). */
  pages: null as Array<Array<{ id: string }>> | null,
  throws: false,
  calls: [] as Array<[string, unknown[]]>,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (state.throws) throw new Error('network down');
      state.calls.push(['from', [table]]);
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'in', 'filter', 'order', 'lt']) {
        chain[method] = (...args: unknown[]) => {
          state.calls.push([method, args]);
          return chain;
        };
      }
      chain.range = (...args: unknown[]) => {
        state.calls.push(['range', args]);
        const page = state.pages && state.pages.length > 0 ? state.pages.shift() : undefined;
        return Promise.resolve(page ? { data: page, error: null } : state.result);
      };
      return chain;
    },
  },
}));

import {
  loadServerHeldEntryIds,
  stampServerHeldFlags,
  withServerHeldFlags,
} from './serverHeldFlags';

const rows = [
  { id: 'e1', show_id: 'show-1' },
  { id: 'e2', show_id: 'show-1' },
];

describe('stampServerHeldFlags (MYK9-1162)', () => {
  beforeEach(() => {
    state.result = { data: [], error: null };
    state.pages = null;
    state.throws = false;
    state.calls = [];
  });

  it("stamps the server's held entries, asking the view for those shows' held ids", async () => {
    state.result = { data: [{ id: 'e2' }], error: null };
    expect(await stampServerHeldFlags(rows)).toEqual([
      { id: 'e1', show_id: 'show-1' },
      { id: 'e2', show_id: 'show-1', awaiting_registration_number: true },
    ]);
    expect(state.calls).toEqual([
      ['from', ['view_authenticated_entry_results']],
      ['select', ['id']],
      ['in', ['show_id', ['show-1']]],
      ['filter', ['awaiting_registration_number', 'eq', true]],
      ['order', ['id', { ascending: false }]],
      ['range', [0, 999]],
    ]);
  });

  it('holds nothing when the lookup errors, as before the column exists', async () => {
    state.result = { data: null, error: { message: 'column does not exist' } };
    expect(await stampServerHeldFlags(rows)).toEqual(rows);
  });

  it('holds nothing when the lookup throws', async () => {
    state.throws = true;
    expect(await stampServerHeldFlags(rows)).toEqual(rows);
  });

  it('wraps a { data, error } read and leaves an empty one untouched', async () => {
    state.result = { data: [{ id: 'e1' }], error: null };
    const stamped = await withServerHeldFlags(Promise.resolve({ data: rows, error: null }));
    expect(stamped.data?.[0]).toEqual({
      id: 'e1',
      show_id: 'show-1',
      awaiting_registration_number: true,
    });
    const empty = await withServerHeldFlags(Promise.resolve({ data: [], error: null }));
    expect(empty).toEqual({ data: [], error: null });
    expect(state.calls.filter(([name]) => name === 'from')).toHaveLength(1);
  });

  it('reads every page past max_rows, so no held entry passes as not held', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `held-${String(1999 - i)}` }));
    state.pages = [firstPage, [{ id: 'held-0999' }]];

    const held = await loadServerHeldEntryIds(['show-1']);

    expect(held.size).toBe(1001);
    expect(held.has('held-0999')).toBe(true);
    expect(state.calls).toContainEqual(['lt', ['id', 'held-1000']]);
  });

  it('holds nothing when a later page fails, never a partial set', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `held-${String(1999 - i)}` }));
    state.pages = [firstPage];
    // The second page is past `pages`, so it answers with this error.
    state.result = { data: null, error: { message: 'timeout' } };

    expect(await loadServerHeldEntryIds(['show-1'])).toEqual(new Set());
  });
});

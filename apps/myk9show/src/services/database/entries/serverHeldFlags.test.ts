import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  result: { data: [] as Array<{ id: string }> | null, error: null as unknown },
  throws: false,
  calls: [] as Array<[string, unknown[]]>,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (state.throws) throw new Error('network down');
      state.calls.push(['from', [table]]);
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'in', 'filter']) {
        chain[method] = (...args: unknown[]) => {
          state.calls.push([method, args]);
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown) => resolve(state.result);
      return chain;
    },
  },
}));

import { stampServerHeldFlags, withServerHeldFlags } from './serverHeldFlags';

const rows = [
  { id: 'e1', show_id: 'show-1' },
  { id: 'e2', show_id: 'show-1' },
];

describe('stampServerHeldFlags (MYK9-1162)', () => {
  beforeEach(() => {
    state.result = { data: [], error: null };
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
});

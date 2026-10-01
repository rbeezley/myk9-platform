import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { method: string; args: unknown[] };
const calls = vi.hoisted(() => [] as Call[]);
// The "table": every declared id the show has, and a one-shot error switch.
const table = vi.hoisted(() => ({
  ids: [] as string[],
  error: null as { message: string } | null,
  // Supabase caps a response at this many rows whatever range is asked for.
  cap: 1000,
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  let range: [number, number] | null = null;
  for (const method of ['select', 'eq', 'is', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.range = (from: number, to: number) => {
    calls.push({ method: 'range', args: [from, to] });
    range = [from, to];
    return builder;
  };
  builder.then = (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) => {
    const [from, to] = range ?? [0, table.cap - 1];
    const slice = table.ids.slice(from, Math.min(to + 1, from + table.cap));
    return Promise.resolve({
      data: table.error ? null : slice.map(id => ({ id })),
      error: table.error,
    }).then(resolve, reject);
  };
  return {
    supabase: { from: (name: string) => (calls.push({ method: 'from', args: [name] }), builder) },
  };
});

import { useJuniorDeclaredEntryIds } from './useJuniorDeclaredEntryIds';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const makeIds = (n: number) =>
  Array.from({ length: n }, (_, i) => `entry-${String(i).padStart(5, '0')}`);

describe('useJuniorDeclaredEntryIds', () => {
  beforeEach(() => {
    calls.length = 0;
    table.ids = ['entry-1', 'entry-2'];
    table.error = null;
  });

  it("reads this show's declared, live entry ids by a NAMED column, never '*', in a stable order", async () => {
    const { result: hook } = renderHook(() => useJuniorDeclaredEntryIds('show-1'), { wrapper });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));

    expect([...(hook.current.data ?? [])]).toEqual(['entry-1', 'entry-2']);
    expect(calls).toEqual([
      { method: 'from', args: ['entries'] },
      { method: 'select', args: ['id'] },
      { method: 'eq', args: ['show_id', 'show-1'] },
      { method: 'eq', args: ['junior_fee_declared', true] },
      { method: 'is', args: ['deleted_at', null] },
      { method: 'order', args: ['id', { ascending: true }] },
      { method: 'range', args: [0, 999] },
    ]);
  });

  it('reads EVERY page: a show with more than 1,000 declared entries keeps the last page ids', async () => {
    table.ids = makeIds(2350);
    const { result: hook } = renderHook(() => useJuniorDeclaredEntryIds('show-1'), { wrapper });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));

    const set = hook.current.data!;
    expect(set.size).toBe(2350);
    // First page, a page boundary, and the very last id (page 3).
    expect(set.has('entry-00000')).toBe(true);
    expect(set.has('entry-01000')).toBe(true);
    expect(set.has('entry-02349')).toBe(true);
    expect(calls.filter(c => c.method === 'range').map(c => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('stops after a full final page without an extra empty read being required to be correct', async () => {
    table.ids = makeIds(2000);
    const { result: hook } = renderHook(() => useJuniorDeclaredEntryIds('show-1'), { wrapper });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));
    expect(hook.current.data!.size).toBe(2000);
    expect(calls.filter(c => c.method === 'range')).toHaveLength(3);
  });

  it('does not query without a show', () => {
    renderHook(() => useJuniorDeclaredEntryIds(undefined), { wrapper });
    expect(calls).toHaveLength(0);
  });

  it('surfaces a read error instead of an empty list', async () => {
    table.error = { message: 'permission denied' };
    const { result: hook } = renderHook(() => useJuniorDeclaredEntryIds('show-1'), { wrapper });
    await waitFor(() => expect(hook.current.isError).toBe(true));
    expect(hook.current.data).toBeUndefined();
  });
});

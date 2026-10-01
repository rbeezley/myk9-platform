import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as { method: string; args: unknown[] }[]);
const result = vi.hoisted(() => ({
  data: [{ id: 'entry-1' }, { id: 'entry-2' }] as { id: string }[] | null,
  error: null as { message: string } | null,
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return {
    supabase: { from: (table: string) => (calls.push({ method: 'from', args: [table] }), builder) },
  };
});

import { useJuniorDeclaredEntryIds } from './useJuniorDeclaredEntryIds';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useJuniorDeclaredEntryIds', () => {
  beforeEach(() => {
    calls.length = 0;
    result.data = [{ id: 'entry-1' }, { id: 'entry-2' }];
    result.error = null;
  });

  it("reads this show's declared, live entry ids by a NAMED column, never '*'", async () => {
    const { result: hook } = renderHook(() => useJuniorDeclaredEntryIds('show-1'), { wrapper });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));

    expect([...(hook.current.data ?? [])]).toEqual(['entry-1', 'entry-2']);
    expect(calls).toEqual([
      { method: 'from', args: ['entries'] },
      { method: 'select', args: ['id'] },
      { method: 'eq', args: ['show_id', 'show-1'] },
      { method: 'eq', args: ['junior_fee_declared', true] },
      { method: 'is', args: ['deleted_at', null] },
    ]);
  });

  it('does not query without a show', () => {
    renderHook(() => useJuniorDeclaredEntryIds(undefined), { wrapper });
    expect(calls).toHaveLength(0);
  });

  it('surfaces a read error instead of an empty list', async () => {
    result.data = null;
    result.error = { message: 'permission denied' };
    const { result: hook } = renderHook(() => useJuniorDeclaredEntryIds('show-1'), { wrapper });
    await waitFor(() => expect(hook.current.isError).toBe(true));
    expect(hook.current.data).toBeUndefined();
  });
});

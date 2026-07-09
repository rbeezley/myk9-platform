/**
 * exhibitor-ux-remediation (Codex review PR #1217): the header cart badge count
 * must mirror CartPage's `loadActiveCart` recovery predicate — status IN
 * ('active','expired') with NO `expires_at > now` filter — so a prior-session
 * cart with a lapsed hold (the audit's week-old draft) still surfaces the
 * badge instead of vanishing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const calls = vi.hoisted(() => ({
  status: undefined as unknown,
  gtCalled: false,
  result: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn((_col: string, values: unknown) => {
    calls.status = values;
    return builder;
  });
  builder.gt = vi.fn(() => {
    calls.gtCalled = true;
    return builder;
  });
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => Promise.resolve(calls.result));
  return { supabase: { from: vi.fn(() => builder) } };
});

import { useActiveCartItemCount } from './useActiveCartItemCount';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useActiveCartItemCount', () => {
  beforeEach(() => {
    calls.status = undefined;
    calls.gtCalled = false;
    calls.result = { data: null, error: null };
  });

  it('queries active OR expired carts and does not filter on expires_at', async () => {
    calls.result = {
      data: { id: 'cart-1', entry_cart_items: [{ count: 4 }] },
      error: null,
    };

    const { result } = renderHook(() => useActiveCartItemCount('exhibitor-1'), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current).toBe(4));
    expect(calls.status).toEqual(['active', 'expired']);
    expect(calls.gtCalled).toBe(false);
  });

  it('returns 0 when there is no recoverable cart', async () => {
    calls.result = { data: null, error: null };

    const { result } = renderHook(() => useActiveCartItemCount('exhibitor-1'), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current).toBe(0));
  });
});

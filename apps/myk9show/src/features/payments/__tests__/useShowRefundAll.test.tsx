import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { supabase } from '@/lib/supabase';
import { useShowRefundAll, showRefundAllErrorMessage } from '../useShowRefundAll';

vi.mock('@/lib/supabase', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...original,
    supabase: Object.assign(
      Object.create(Object.getPrototypeOf(original.supabase)),
      original.supabase,
      {
        functions: { invoke: vi.fn() },
      }
    ),
  };
});

const mockedInvoke = vi.mocked(supabase.functions.invoke);

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe('useShowRefundAll', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  // MYK9-2302: after the payout the club settles refunds with exhibitors directly
  // (owner decision 2026-11-13). The secretary is not sent to support for them.
  it('tells the secretary the club pays exhibitors directly once the payout has gone', async () => {
    mockedInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'payout_already_sent' }), { status: 422 }),
      }),
    });
    const { result } = renderHook(() => useShowRefundAll(), { wrapper });

    result.current.mutate('show-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    const message = showRefundAllErrorMessage(result.current.error);
    expect(message).toMatch(/club has already been paid for this show/i);
    expect(message).toMatch(/still owed are the club.s to pay each exhibitor directly/i);
    // stripe-refund-show refuses before reading entries, so the refusal cannot
    // say every exhibitor is still owed: the club checks prior refunds first.
    expect(message).toMatch(/check which exhibitors have already been refunded/i);
    expect(message).not.toMatch(/support/i);
  });
});

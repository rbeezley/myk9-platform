/**
 * MYK9-2166: a wait-list offer's Pay says card payment is paused when the club's payouts are off,
 * and keeps "We could not start payment" for every other refusal.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/database/supabaseClient', () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  return { supabase: { from: vi.fn(() => builder), functions: { invoke: vi.fn() } } };
});
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: { delete: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { useMyWaitlistEntries } from '../useMyWaitlistEntries';
import { supabase } from '@/services/database/supabaseClient';
import { CLUB_PAYOUTS_OFF_SERVER_MESSAGE } from '@/features/payments/cardPausedCopy';

const invoke = vi.mocked(supabase.functions.invoke);

function refusal(status: number, error: string) {
  return {
    data: null,
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error }), { status }),
    },
  };
}

async function payAndReadError() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1'), {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children),
  });
  try {
    await result.current.startPayment.mutateAsync({ entryId: 'e1', waitlistEntryId: 'w1' });
  } catch (err) {
    return (err as Error).message;
  }
  return null;
}

describe('wait-list offer Pay refusals', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('says card payment is paused when the club payouts are off', async () => {
    invoke.mockImplementation(async () => refusal(403, CLUB_PAYOUTS_OFF_SERVER_MESSAGE));
    expect(await payAndReadError()).toBe(
      "Card payment is paused for this show. The club's bank account needs attention. Please contact the show secretary to ask how else you can pay."
    );
  });

  it('keeps the generic sentence for another 403', async () => {
    invoke.mockImplementation(async () => refusal(403, 'Not your entry.'));
    expect(await payAndReadError()).toBe('We could not start payment. Please try again.');
  });

  it('keeps the generic sentence when the same words arrive with another status', async () => {
    invoke.mockImplementation(async () => refusal(500, CLUB_PAYOUTS_OFF_SERVER_MESSAGE));
    expect(await payAndReadError()).toBe('We could not start payment. Please try again.');
  });
});

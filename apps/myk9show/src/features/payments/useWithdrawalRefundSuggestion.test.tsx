import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

const single = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) },
}));

import { useWithdrawalRefundSuggestion } from './useWithdrawalRefundSuggestion';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const snapshot = {
  cutoffDate: '2026-06-01',
  retentionType: 'flat',
  retentionValue: 1000,
  notes: null,
};

describe('useWithdrawalRefundSuggestion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('drives the cutoff off withdrawn_at, NOT now: withdrawn before cutoff → full refund', async () => {
    // withdrawn_at is May 15 (before the June 1 cutoff). If the hook regressed to
    // using `now()` (well past the cutoff) this would flip to after_cutoff — so
    // this case pins the P1b fix.
    single.mockResolvedValue({
      data: {
        withdrawal_policy_snapshot: snapshot,
        withdrawn_at: '2026-05-15T12:00:00Z',
        trials: { timezone: 'America/New_York' },
      },
      error: null,
    });
    const { result } = renderHook(() => useWithdrawalRefundSuggestion('e1', 3000), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      hasPolicy: true,
      reason: 'before_cutoff',
      refundCents: 3000,
      retainedCents: 0,
    });
  });

  it('withdrawn after the cutoff → retains the fee', async () => {
    single.mockResolvedValue({
      data: {
        withdrawal_policy_snapshot: snapshot,
        withdrawn_at: '2026-06-15T12:00:00Z',
        trials: { timezone: 'America/New_York' },
      },
      error: null,
    });
    const { result } = renderHook(() => useWithdrawalRefundSuggestion('e1', 3000), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      reason: 'after_cutoff',
      refundCents: 2000,
      retainedCents: 1000,
    });
  });

  it('no snapshot → hasPolicy false, suggests full + requiresManual', async () => {
    single.mockResolvedValue({
      data: { withdrawal_policy_snapshot: null, withdrawn_at: null, trials: null },
      error: null,
    });
    const { result } = renderHook(() => useWithdrawalRefundSuggestion('e1', 3000), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      hasPolicy: false,
      refundCents: 3000,
      requiresManual: true,
      reason: 'no_policy',
    });
  });
});

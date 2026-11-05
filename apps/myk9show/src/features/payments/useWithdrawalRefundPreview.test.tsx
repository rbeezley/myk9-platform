import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWithdrawalRefundPreviews } from './useWithdrawalRefundPreview';

const useWithdrawalRefundPreview = (entryId: string, entryFeeCents: number) =>
  useWithdrawalRefundPreviews([{ entryId, entryFeeCents, enabled: true }])[0]!;

const { single } = vi.hoisted(() => ({ single: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useWithdrawalRefundPreview', () => {
  it('computes a figure for an entry that has no withdrawn_at yet', async () => {
    single.mockResolvedValue({
      data: {
        withdrawal_policy_snapshot: {
          cutoffDate: '2099-01-01',
          retentionType: 'flat',
          retentionValue: 500,
          retentionDeclared: true,
          notes: null,
        },
        trials: { timezone: 'America/New_York' },
      },
      error: null,
    });
    const { result } = renderHook(() => useWithdrawalRefundPreview('e1', 3000), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toMatchObject({
      refundCents: 3000,
      reason: 'before_cutoff',
      requiresManual: false,
    });
  });

  it('keeps the retention once the proposed withdrawal is past the cutoff', async () => {
    single.mockResolvedValue({
      data: {
        withdrawal_policy_snapshot: {
          cutoffDate: '2000-01-01',
          retentionType: 'flat',
          retentionValue: 500,
          retentionDeclared: true,
          notes: null,
        },
        trials: { timezone: 'America/New_York' },
      },
      error: null,
    });
    const { result } = renderHook(() => useWithdrawalRefundPreview('e2', 3000), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toMatchObject({ refundCents: 2500, retainedCents: 500 });
  });
});

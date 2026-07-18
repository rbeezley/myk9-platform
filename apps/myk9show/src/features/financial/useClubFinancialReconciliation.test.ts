import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useClubFinancialReconciliation } from './useClubFinancialReconciliation';
import * as reconciliation from './financialReconciliation';
import type { ShowPayoutRow } from '@/features/payments/useClubStripeAccount';

vi.mock('./financialReconciliation', async importOriginal => {
  const original = await importOriginal<typeof reconciliation>();
  return {
    ...original,
    fetchFinancialReconciliationOrders: vi.fn(),
    fetchFinancialReconciliationPayouts: vi.fn(),
  };
});

const mockedOrders = vi.mocked(reconciliation.fetchFinancialReconciliationOrders);
const mockedPayouts = vi.mocked(reconciliation.fetchFinancialReconciliationPayouts);

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useClubFinancialReconciliation', () => {
  it('composes orders + payouts into per-show rows, borrowing show names from payout history', async () => {
    mockedOrders.mockResolvedValue([
      {
        orderId: 'o1',
        showId: 'show-1',
        status: 'succeeded',
        orderType: 'entry',
        amountCents: 10700,
        entrySubtotalCents: 10000,
        platformFeeCents: 700,
        platformFeeRate: 0.07,
        stripeProcessingFeeCents: 320,
        refundedCents: 0,
        stripePaymentIntentId: 'pi_1',
        createdAt: '2026-07-01T00:00:00Z',
        paidAt: '2026-07-01T00:00:00Z',
        refundedAt: null,
      },
    ]);
    mockedPayouts.mockResolvedValue([
      {
        payoutId: 'sp-1',
        showId: 'show-1',
        status: 'completed',
        amountCents: 10000,
        stripeTransferId: 'tr_1',
        scheduledDate: null,
        completedAt: '2026-07-05T00:00:00Z',
        failureReason: null,
        createdAt: '2026-07-04T00:00:00Z',
      },
    ]);
    const history: ShowPayoutRow[] = [
      {
        id: 'sp-1',
        amount_cents: 10000,
        status: 'completed',
        failure_reason: null,
        completed_at: '2026-07-05T00:00:00Z',
        created_at: '2026-07-04T00:00:00Z',
        show: { name: 'Cedar Valley Classic', club_id: 'club-1' },
      },
    ];

    const { result } = renderHook(() => useClubFinancialReconciliation('club-1', true, history), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({
      showId: 'show-1',
      showName: 'Cedar Valley Classic',
      chargeVerification: 'Verified',
    });
    expect(mockedOrders).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'club', clubId: 'club-1' })
    );
  });

  it('an order/payout fetch failure surfaces isError, never a silent empty result', async () => {
    mockedOrders.mockRejectedValue(new Error('offline'));
    mockedPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => useClubFinancialReconciliation('club-1', true, undefined), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
  });

  it('does not fetch when clubId is undefined', () => {
    renderHook(() => useClubFinancialReconciliation(undefined, true, undefined), { wrapper });
    expect(mockedOrders).not.toHaveBeenCalled();
    expect(mockedPayouts).not.toHaveBeenCalled();
  });
});

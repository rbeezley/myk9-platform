import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useClubFinancialReconciliation } from './useClubFinancialReconciliation';
import * as reconciliation from './financialReconciliation';

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

function makeOrder(
  overrides: Partial<reconciliation.FinancialReconciliationOrder>
): reconciliation.FinancialReconciliationOrder {
  return {
    orderId: 'o1',
    showId: 'show-1',
    showName: 'Show 1',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 10700,
    entrySubtotalCents: 10000,
    platformFeeCents: 700,
    platformFeeRate: 0.07,
    stripeProcessingFeeCents: 320,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    stripePaymentIntentId: 'pi_1',
    createdAt: '2026-07-01T00:00:00Z',
    paidAt: '2026-07-01T00:00:00Z',
    refundedAt: null,
    ...overrides,
  };
}

describe('useClubFinancialReconciliation', () => {
  // Show names now come from the authorized RPC projection, NOT borrowed from
  // payout history (review finding 5): a show with orders but no payout row yet
  // is a normal pre-settlement state, and borrowing left it labelled "Show".
  it('composes orders + payouts into per-show rows, naming shows from the RPC projection', async () => {
    mockedOrders.mockResolvedValue([
      {
        orderId: 'o1',
        showId: 'show-1',
        showName: 'Cedar Valley Classic',
        status: 'succeeded',
        orderType: 'entry',
        amountCents: 10700,
        entrySubtotalCents: 10000,
        platformFeeCents: 700,
        platformFeeRate: 0.07,
        stripeProcessingFeeCents: 320,
        refundedCents: 0,
        makeWholeRefundedCents: 0,
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
        showName: null,
        status: 'completed',
        amountCents: 10000,
        stripeTransferId: 'tr_1',
        scheduledDate: null,
        completedAt: '2026-07-05T00:00:00Z',
        failureReason: null,
        createdAt: '2026-07-04T00:00:00Z',
      },
    ]);

    const { result } = renderHook(() => useClubFinancialReconciliation('club-1', 'enabled'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({
      showId: 'show-1',
      showName: 'Cedar Valley Classic',
      chargeVerification: 'AllFeeBreakdowns',
    });
    expect(mockedOrders).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'club', clubId: 'club-1' })
    );
  });

  it('names a show from the payout RPC when payout history cannot see it', async () => {
    // The soft-delete divergence. `useClubPayoutHistory` reads through an
    // `!inner` embed on shows, so shows_select's `deleted_at is null` drops the
    // row and history can never name it. The RPC is SECURITY DEFINER and is not
    // filtered, so it carries the name itself (20260821120000). Without that,
    // this row rendered as a dollar amount under the literal label "Show".
    mockedOrders.mockResolvedValue([]);
    mockedPayouts.mockResolvedValue([
      {
        payoutId: 'sp-9',
        showId: 'show-deleted',
        showName: 'Retired Autumn Trial',
        status: 'completed',
        amountCents: 10000,
        stripeTransferId: 'tr_9',
        scheduledDate: null,
        completedAt: '2026-07-05T00:00:00Z',
        failureReason: null,
        createdAt: '2026-07-04T00:00:00Z',
      },
    ]);

    const { result } = renderHook(
      // `undefined` history is exactly what the RLS-filtered read returns here.
      () => useClubFinancialReconciliation('club-1', 'enabled'),
      { wrapper }
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].showName).toBe('Retired Autumn Trial');
    expect(result.current.rows[0].showName).not.toBe('Show');
  });

  it('paginates orders to completion: a club past one page keeps every show in the total', async () => {
    // The wrapper is keyset-paginated. A full page means "there may be more";
    // a short page means "exhausted". Two full pages + a short one must all
    // land in the rows — a single-page read would silently drop show-2/show-3.
    const PAGE = 500;
    const fullPage = (prefix: string, showId: string) =>
      Array.from({ length: PAGE }, (_, i) =>
        makeOrder({
          orderId: `${prefix}-${i}`,
          showId,
          createdAt: `2026-07-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
        })
      );

    mockedOrders
      .mockResolvedValueOnce(fullPage('a', 'show-1'))
      .mockResolvedValueOnce(fullPage('b', 'show-2'))
      .mockResolvedValueOnce([makeOrder({ orderId: 'c-0', showId: 'show-3' })]);
    mockedPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => useClubFinancialReconciliation('club-1', 'enabled'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(mockedOrders).toHaveBeenCalledTimes(3);
    // First call has no cursor; the second is keyed off the last row of page 1.
    expect(mockedOrders.mock.calls[0][0]).toMatchObject({ cursor: null });
    expect(mockedOrders.mock.calls[1][0].cursor).toMatchObject({ id: `a-${PAGE - 1}` });
    // Every page's money is present: 500 + 500 orders of $100 on shows 1 and 2.
    const byShow = new Map(result.current.rows.map(r => [r.showId, r]));
    expect(byShow.get('show-1')?.net).toEqual({ status: 'available', netCents: 100_00 * PAGE });
    expect(byShow.get('show-2')?.net).toEqual({ status: 'available', netCents: 100_00 * PAGE });
    expect(byShow.get('show-3')?.net).toEqual({ status: 'available', netCents: 100_00 });
  });

  it('an order/payout fetch failure surfaces isError, never a silent empty result', async () => {
    mockedOrders.mockRejectedValue(new Error('offline'));
    mockedPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => useClubFinancialReconciliation('club-1', 'enabled'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
  });

  it('does not fetch when clubId is undefined', () => {
    renderHook(() => useClubFinancialReconciliation(undefined, 'enabled'), { wrapper });
    expect(mockedOrders).not.toHaveBeenCalled();
    expect(mockedPayouts).not.toHaveBeenCalled();
  });
});

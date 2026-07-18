import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import type { FinancialSummary } from '@/features/financial';
import type { FinancialReconciliationOrder } from '../financialReconciliation';

const getFinancialSummary = vi.fn();
const fetchFinancialReconciliationOrders = vi.fn();
const fetchFinancialReconciliationPayouts = vi.fn();

vi.mock('@/features/financial', () => ({
  getFinancialSummary: (...args: unknown[]) => getFinancialSummary(...args),
  fetchFinancialReconciliationOrders: (...args: unknown[]) =>
    fetchFinancialReconciliationOrders(...args),
  fetchFinancialReconciliationPayouts: (...args: unknown[]) =>
    fetchFinancialReconciliationPayouts(...args),
}));

import { usePlatformFinancialOverview } from './usePlatformFinancialOverview';

function summary(overrides: Partial<FinancialSummary> = {}): FinancialSummary {
  return {
    scope: 'platform',
    entryAccounting: { lines: [], totals: {} } as never,
    platformIncome: {
      onlineCollectedCents: 0,
      grossPlatformFeeCents: 0,
      netPlatformIncome: { availableCents: 0, pendingResidualCents: 0, pendingOrderCount: 0 },
      processingFeePendingCount: 0,
      refundedCents: 0,
      makeWholeRefundedCents: 0,
      snapshotMissingCount: 0,
      nonEntry: {
        orderCount: 0,
        grossCents: 0,
        refundedCents: 0,
        makeWholeRefundedCents: 0,
        netCents: 0,
      },
    },
    chargeVerification: {
      verifiedCount: 0,
      attestedCount: 0,
      mismatchCount: 0,
      pendingNetCount: 0,
      snapshotMissingCount: 0,
    },
    payoutSettlement: {
      payoutCount: 0,
      completedCents: 0,
      pendingCents: 0,
      failedCents: 0,
      failedCount: 0,
      outstandingCents: 0,
    },
    ...overrides,
  };
}

function orderRow(
  overrides: Partial<FinancialReconciliationOrder> = {}
): FinancialReconciliationOrder {
  return {
    orderId: 'order-1',
    showId: 'show-1',
    showName: 'Test Show',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 5000,
    entrySubtotalCents: 4500,
    platformFeeCents: 500,
    platformFeeRate: 0.1,
    stripeProcessingFeeCents: 150,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    stripePaymentIntentId: 'pi_1',
    createdAt: '2026-07-01T00:00:00Z',
    paidAt: '2026-07-01T00:00:00Z',
    refundedAt: null,
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe('usePlatformFinancialOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the shared service with scope=platform and composes attention from the results', async () => {
    getFinancialSummary.mockResolvedValue(
      summary({
        chargeVerification: {
          verifiedCount: 0,
          attestedCount: 0,
          mismatchCount: 0,
          pendingNetCount: 0,
          snapshotMissingCount: 2,
        },
      })
    );
    fetchFinancialReconciliationOrders.mockResolvedValue([]);
    fetchFinancialReconciliationPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFinancialSummary).toHaveBeenCalledWith({ scope: 'platform', entries: [] });
    expect(fetchFinancialReconciliationOrders).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'platform' })
    );
    expect(fetchFinancialReconciliationPayouts).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'platform' })
    );
    expect(result.current.data?.attention.missingPlatformFeeSnapshotCount).toBe(2);
    expect(result.current.data?.detailTruncated).toBe(false);
  });

  it('walks the keyset cursor to completion instead of stopping after one page', async () => {
    getFinancialSummary.mockResolvedValue(summary());
    // Page 1 is full (1000 rows) so a cursor exists; page 2 is short and ends it.
    // The drifting order lives on page 2 and is only seen if pagination works.
    // It is FULLY refunded (5000 of 5000) while still 'succeeded' — genuine
    // ledger drift, not the normal partial refund that must stay silent.
    const fullPage = Array.from({ length: 1000 }, (_, i) => orderRow({ orderId: `o-${i}` }));
    const lastOfPage1 = fullPage[fullPage.length - 1];
    fetchFinancialReconciliationOrders
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([
        orderRow({ orderId: 'o-drift', amountCents: 5000, refundedCents: 5000 }),
      ]);
    fetchFinancialReconciliationPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFinancialReconciliationOrders).toHaveBeenCalledTimes(2);
    expect(fetchFinancialReconciliationOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { createdAt: lastOfPage1.createdAt, id: lastOfPage1.orderId },
      })
    );
    expect(result.current.data?.attention.refundLedgerDriftCount).toBe(1);
    expect(result.current.data?.detailTruncated).toBe(false);
  });

  it('caps the walk and reports detailTruncated rather than silently truncating', async () => {
    getFinancialSummary.mockResolvedValue(summary());
    // Every page comes back full, so a cursor always exists — the max-pages guard
    // must stop the loop and surface that the counts are a floor.
    const fullPage = Array.from({ length: 1000 }, (_, i) => orderRow({ orderId: `o-${i}` }));
    fetchFinancialReconciliationOrders.mockResolvedValue(fullPage);
    fetchFinancialReconciliationPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFinancialReconciliationOrders).toHaveBeenCalledTimes(50);
    expect(result.current.data?.detailTruncated).toBe(true);
  });

  it('flags a mismatching order as attention but leaves a pending processing fee calm', async () => {
    getFinancialSummary.mockResolvedValue(summary());
    fetchFinancialReconciliationOrders.mockResolvedValue([
      // Does not tie: 4500 + 400 != 5000 → attention.
      orderRow({ orderId: 'o-mismatch', amountCents: 5000, platformFeeCents: 400 }),
      // Ties, but Stripe's processing fee hasn't landed yet → stays calm.
      orderRow({ orderId: 'o-pending', stripeProcessingFeeCents: null }),
    ]);
    fetchFinancialReconciliationPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.attention.chargeMismatchCount).toBe(1);
    expect(result.current.data?.attention.totalCount).toBe(1);
  });

  it('surfaces the RPC authorization failure as an error, never a zeroed summary', async () => {
    getFinancialSummary.mockRejectedValue(new Error('not authorized: is_site_admin() = false'));
    fetchFinancialReconciliationOrders.mockResolvedValue([]);
    fetchFinancialReconciliationPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

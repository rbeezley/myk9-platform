import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import type { FinancialSummary } from '@/features/financial';
import type { FinancialReconciliationPayout } from '../financialReconciliation';

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

function payoutRow(
  overrides: Partial<FinancialReconciliationPayout> = {}
): FinancialReconciliationPayout {
  return {
    payoutId: 'payout-1',
    showId: 'show-1',
    showName: null,
    status: 'completed',
    amountCents: 4000,
    stripeTransferId: 'tr_1',
    scheduledDate: null,
    completedAt: '2026-07-02T00:00:00Z',
    failureReason: null,
    createdAt: '2026-07-01T00:00:00Z',
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
          pendingNetCount: 0,
          snapshotMissingCount: 2,
        },
      })
    );
    fetchFinancialReconciliationPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFinancialSummary).toHaveBeenCalledWith({ scope: 'platform', entries: [] });
    expect(fetchFinancialReconciliationPayouts).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'platform' })
    );
    expect(result.current.data?.attention.missingPlatformFeeSnapshotCount).toBe(2);
    expect(result.current.data?.detailTruncated).toBe(false);
  });

  // The order-row walk existed ONLY to feed the deleted inference-based attention
  // categories. Every remaining platform figure is a server-side aggregate or a
  // payout-row fact, so scanning stripe_orders cross-platform is pure cost.
  it('does not walk stripe_orders at all any more', async () => {
    getFinancialSummary.mockResolvedValue(summary());
    fetchFinancialReconciliationPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFinancialReconciliationOrders).not.toHaveBeenCalled();
  });

  it('walks the payout keyset cursor to completion instead of stopping after one page', async () => {
    getFinancialSummary.mockResolvedValue(summary());
    // Page 1 is full (1000 rows) so a cursor exists; page 2 is short and ends it.
    // The genuine failure lives on page 2 and is only seen if pagination works.
    const fullPage = Array.from({ length: 1000 }, (_, i) => payoutRow({ payoutId: `p-${i}` }));
    const lastOfPage1 = fullPage[fullPage.length - 1];
    fetchFinancialReconciliationPayouts.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([
      payoutRow({
        payoutId: 'p-failed',
        showId: 'show-late',
        status: 'failed',
        failureReason: 'account_closed',
      }),
    ]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFinancialReconciliationPayouts).toHaveBeenCalledTimes(2);
    expect(fetchFinancialReconciliationPayouts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { createdAt: lastOfPage1.createdAt, id: lastOfPage1.payoutId },
      })
    );
    expect(result.current.data?.attention.failedTransferCount).toBe(1);
    expect(result.current.data?.detailTruncated).toBe(false);
  });

  it('caps the walk and reports detailTruncated rather than silently truncating', async () => {
    getFinancialSummary.mockResolvedValue(summary());
    // Every page comes back full, so a cursor always exists — the max-pages guard
    // must stop the loop and surface that the counts are a floor.
    const fullPage = Array.from({ length: 1000 }, (_, i) => payoutRow({ payoutId: `p-${i}` }));
    fetchFinancialReconciliationPayouts.mockResolvedValue(fullPage);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFinancialReconciliationPayouts).toHaveBeenCalledTimes(50);
    expect(result.current.data?.detailTruncated).toBe(true);
  });

  it('surfaces the RPC authorization failure as an error, never a zeroed summary', async () => {
    getFinancialSummary.mockRejectedValue(new Error('not authorized: is_site_admin() = false'));
    fetchFinancialReconciliationPayouts.mockResolvedValue([]);

    const { result } = renderHook(() => usePlatformFinancialOverview(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

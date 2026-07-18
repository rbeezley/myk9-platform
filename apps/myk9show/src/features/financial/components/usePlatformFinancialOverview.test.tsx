import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import type { FinancialSummary } from '@/features/financial';

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
      netPlatformIncome: { status: 'available', netCents: 0 },
      processingFeePendingCount: 0,
      refundedCents: 0,
      snapshotMissingCount: 0,
    },
    chargeVerification: {
      verifiedCount: 0,
      attestedCount: 0,
      mismatchCount: 0,
      pendingNetCount: 0,
      snapshotMissingCount: 0,
    },
    payoutSettlement: { payoutCount: 0, completedCents: 0, pendingCents: 0, failedCount: 0 },
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
    expect(result.current.data?.attention.missingProcessingFeeCount).toBe(2);
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

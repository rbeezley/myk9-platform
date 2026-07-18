import { describe, expect, it, vi } from 'vitest';
import {
  derivePayoutSettlement,
  derivePlatformIncome,
  getFinancialSummary,
  type FinancialSummaryDeps,
} from './financialSummary';
import type {
  FinancialReconciliationOrder,
  FinancialReconciliationSummary,
} from './financialReconciliation';
import { PaymentStatus } from '@/types/show-registration-types';
import type { ReportEntry } from '@/lib/reports/types';

function entry(overrides: Partial<ReportEntry>): ReportEntry {
  return {
    id: overrides.id ?? 'entry-1',
    armband: 101,
    runOrder: 1,
    callName: 'Buddy',
    breed: 'Lab',
    handler: 'Jane Mitchell',
    registrationNumber: null,
    checkInStatus: null,
    section: null,
    isScored: false,
    resultText: null,
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    entryStatus: 'accepted',
    entryFee: 50,
    paymentStatus: PaymentStatus.PAID_BY_CHECK,
    paymentMethod: 'check',
    ...overrides,
  };
}

function summaryRow(
  overrides: Partial<FinancialReconciliationSummary>
): FinancialReconciliationSummary {
  return {
    orderCount: 1,
    grossChargedCents: 5250,
    entrySubtotalCents: 5000,
    platformFeeCents: 250,
    processingFeeCents: 180,
    processingFeePendingCount: 0,
    refundedCents: 0,
    postHocRefundedCents: 0,
    snapshotMissingCount: 0,
    nonEntryOrderCount: 0,
    nonEntryGrossCents: 0,
    payoutCount: 1,
    payoutCompletedCents: 5000,
    payoutPendingCents: 0,
    payoutFailedCents: 0,
    payoutFailedCount: 0,
    ...overrides,
  };
}

function onlineOrder(
  overrides: Partial<FinancialReconciliationOrder>
): FinancialReconciliationOrder {
  return {
    orderId: 'order-1',
    showId: 'show-1',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 5250,
    entrySubtotalCents: 5000,
    platformFeeCents: 250,
    platformFeeRate: 5,
    stripeProcessingFeeCents: 180,
    refundedCents: 0,
    stripePaymentIntentId: 'pi_1',
    createdAt: '2026-07-17T00:00:00Z',
    paidAt: '2026-07-17T00:00:00Z',
    refundedAt: null,
    ...overrides,
  };
}

describe('derivePlatformIncome', () => {
  it('reports net income when every processing fee is captured', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        refundedCents: 0,
      })
    );
    expect(income.grossPlatformFeeCents).toBe(250);
    // gross fee − processing − absorbed refunds (0 here).
    expect(income.netPlatformIncome).toEqual({ status: 'available', netCents: 70 });
  });

  it('subtracts POST-HOC platform-absorbed refunds from net income', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        refundedCents: 40,
        postHocRefundedCents: 40,
      })
    );
    // 250 − 180 − 40 = 30.
    expect(income.netPlatformIncome).toEqual({ status: 'available', netCents: 30 });
  });

  it('does NOT subtract a cart-overflow make-whole refund from net income', () => {
    // The whole refund was overflow: the platform earned no fee and made no
    // transfer on those lines, so net income is untouched at 250 − 180 = 70.
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        refundedCents: 4000,
        postHocRefundedCents: 0,
      })
    );
    expect(income.netPlatformIncome).toEqual({ status: 'available', netCents: 70 });
    // ...but the money DID leave, so collections still drop by the full refund.
    expect(income.onlineCollectedCents).toBe(5250 - 4000);
    expect(income.refundedCents).toBe(4000);
    expect(income.postHocRefundedCents).toBe(0);
  });

  it('subtracts only the post-hoc share when an order has both refund kinds', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        refundedCents: 4025, // 4000 make-whole + 25 post-hoc
        postHocRefundedCents: 25,
      })
    );
    // 250 − 180 − 25 = 45 (NOT 250 − 180 − 4025 = −3955).
    expect(income.netPlatformIncome).toEqual({ status: 'available', netCents: 45 });
    expect(income.onlineCollectedCents).toBe(5250 - 4025);
  });

  it('lets a post-hoc absorbed refund drive net negative (not clamped to zero)', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        // A full post-hoc refund on an accepted entry: exceeds fee income.
        refundedCents: 5250,
        postHocRefundedCents: 5250,
      })
    );
    // 250 − 180 − 5250 = −5180, reported as-is (economically real).
    expect(income.netPlatformIncome).toEqual({ status: 'available', netCents: -5180 });
  });

  it('marks net income pending (never zero) when a processing fee is uncaptured', () => {
    const income = derivePlatformIncome(
      summaryRow({ platformFeeCents: 250, processingFeeCents: 180, processingFeePendingCount: 2 })
    );
    expect(income.netPlatformIncome).toEqual({ status: 'pending', grossCents: 250 });
    expect(income.processingFeePendingCount).toBe(2);
  });

  it('keeps net pending even when refunds exist (a missing fee still blocks a final net)', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 1,
        refundedCents: 999,
        postHocRefundedCents: 999,
      })
    );
    expect(income.netPlatformIncome).toEqual({ status: 'pending', grossCents: 250 });
  });

  it('keeps net pending even when the whole refund was cart overflow (pending still wins)', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 1,
        refundedCents: 4000,
        postHocRefundedCents: 0,
      })
    );
    expect(income.netPlatformIncome).toEqual({ status: 'pending', grossCents: 250 });
  });

  it('exposes online collected as gross charged less refunded', () => {
    const income = derivePlatformIncome(
      summaryRow({ grossChargedCents: 5250, refundedCents: 1000 })
    );
    expect(income.onlineCollectedCents).toBe(4250);
  });
});

describe('getFinancialSummary', () => {
  it('composes four separate groups without conflating them', async () => {
    const deps: FinancialSummaryDeps = {
      fetchSummary: vi.fn().mockResolvedValue(summaryRow({})),
    };
    const result = await getFinancialSummary(
      {
        scope: 'show',
        showId: 'show-1',
        entries: [
          entry({ id: 'check', entryFee: 50, paymentStatus: PaymentStatus.PAID_BY_CHECK }),
          entry({
            id: 'online',
            entryFee: 50,
            paymentStatus: PaymentStatus.PAID_ONLINE,
            paymentMethod: 'credit_card',
          }),
        ],
        matchedOrdersByEntryId: new Map([['online', onlineOrder({})]]),
      },
      deps
    );

    expect(deps.fetchSummary).toHaveBeenCalledWith({ scope: 'show', showId: 'show-1' });
    // Entry accounting is cent-based and independent from platform income.
    expect(result.entryAccounting.totals.collectedCents).toBe(10000);
    // Platform income is a separate figure.
    expect(result.platformIncome.grossPlatformFeeCents).toBe(250);
    // Charge verification: check = Attested, online (matched) = Verified.
    expect(result.chargeVerification.attestedCount).toBe(1);
    expect(result.chargeVerification.verifiedCount).toBe(1);
    expect(result.chargeVerification.mismatchCount).toBe(0);
    // Payout settlement is independent of charge facts.
    expect(result.payoutSettlement.completedCents).toBe(5000);
  });

  it('flags an online entry with no matched order snapshot as a Mismatch', async () => {
    const result = await getFinancialSummary(
      {
        scope: 'show',
        showId: 'show-1',
        entries: [
          entry({
            id: 'online',
            entryFee: 50,
            paymentStatus: PaymentStatus.PAID_ONLINE,
            paymentMethod: 'credit_card',
          }),
        ],
      },
      { fetchSummary: vi.fn().mockResolvedValue(summaryRow({})) }
    );
    expect(result.chargeVerification.mismatchCount).toBe(1);
  });

  it('surfaces pending-net count from the reconciliation summary', async () => {
    const result = await getFinancialSummary(
      { scope: 'platform', entries: [] },
      { fetchSummary: vi.fn().mockResolvedValue(summaryRow({ processingFeePendingCount: 3 })) }
    );
    expect(result.chargeVerification.pendingNetCount).toBe(3);
    expect(result.platformIncome.netPlatformIncome.status).toBe('pending');
  });

  it('propagates an authorization failure instead of returning $0', async () => {
    const deps: FinancialSummaryDeps = {
      fetchSummary: vi.fn().mockRejectedValue(new Error('permission denied')),
    };
    await expect(
      getFinancialSummary({ scope: 'club', clubId: 'other-club', entries: [] }, deps)
    ).rejects.toThrow('permission denied');
  });
});

describe('derivePayoutSettlement', () => {
  it('includes FAILED transfers in outstanding liability, kept separate from pending', () => {
    const result = derivePayoutSettlement(
      summaryRow({ payoutPendingCents: 3000, payoutFailedCents: 1200, payoutFailedCount: 1 })
    );
    // A failed transfer has not settled — it is still owed to the club.
    expect(result.outstandingCents).toBe(4200);
    // ...but it is never merged INTO pending: both stay individually labeled.
    expect(result.pendingCents).toBe(3000);
    expect(result.failedCents).toBe(1200);
    expect(result.failedCount).toBe(1);
  });

  it('reports outstanding = pending when nothing failed', () => {
    const result = derivePayoutSettlement(summaryRow({ payoutPendingCents: 500 }));
    expect(result.outstandingCents).toBe(500);
    expect(result.failedCents).toBe(0);
  });
});

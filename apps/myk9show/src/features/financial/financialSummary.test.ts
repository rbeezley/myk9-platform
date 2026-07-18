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
    pendingFeePlatformFeeCents: 0,
    pendingFeeRefundedCents: 0,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    snapshotMissingCount: 0,
    nonEntryOrderCount: 0,
    nonEntryGrossCents: 0,
    nonEntryRefundedCents: 0,
    nonEntryMakeWholeRefundedCents: 0,
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
    showName: 'Test Show',
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 5250,
    entrySubtotalCents: 5000,
    platformFeeCents: 250,
    platformFeeRate: 5,
    stripeProcessingFeeCents: 180,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
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
    // gross fee − processing − absorbed refunds (0 here). Nothing pending.
    expect(income.netPlatformIncome).toEqual({
      availableCents: 70,
      pendingResidualCents: 0,
      pendingOrderCount: 0,
    });
  });

  it('subtracts POST-HOC platform-absorbed refunds from net income', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        // refundedCents IS the post-hoc total now — read from its own column.
        refundedCents: 40,
      })
    );
    // 250 − 180 − 40 = 30.
    expect(income.netPlatformIncome.availableCents).toBe(30);
  });

  it('does NOT subtract a cart-overflow make-whole refund from net income', () => {
    // The whole refund was overflow: the platform earned no fee and made no
    // transfer on those lines, so net income is untouched at 250 − 180 = 70.
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        refundedCents: 0,
        makeWholeRefundedCents: 4000,
      })
    );
    expect(income.netPlatformIncome.availableCents).toBe(70);
    // ...but the money DID leave, so collections still drop by the full refund.
    expect(income.onlineCollectedCents).toBe(5250 - 4000);
    expect(income.refundedCents).toBe(0);
    expect(income.makeWholeRefundedCents).toBe(4000);
  });

  it('subtracts only the post-hoc share when an order has both refund kinds', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        refundedCents: 25, // post-hoc on the accepted entry
        makeWholeRefundedCents: 4000, // never-accepted cart overflow
      })
    );
    // 250 − 180 − 25 = 45 (NOT 250 − 180 − 4025 = −3955).
    expect(income.netPlatformIncome.availableCents).toBe(45);
    // Collected subtracts BOTH: 5250 − 25 − 4000 = 1225.
    expect(income.onlineCollectedCents).toBe(1225);
  });

  it('lets a post-hoc absorbed refund drive net negative (not clamped to zero)', () => {
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 250,
        processingFeeCents: 180,
        processingFeePendingCount: 0,
        // A full post-hoc refund on an accepted entry: exceeds fee income.
        refundedCents: 5250,
      })
    );
    // 250 − 180 − 5250 = −5180, reported as-is (economically real).
    expect(income.netPlatformIncome.availableCents).toBe(-5180);
  });

  // ── ROOT FIX (review finding 2). Net income used to latch to a SCOPE-WIDE
  // "pending" the moment ANY order's processing fee was uncaptured. Nothing
  // retries that capture, so the first delayed fee would have disabled the
  // headline figure permanently. It now reports an available net over the
  // captured-fee orders plus a separately labeled, EXCLUDED residual.
  it('reports an available net PLUS a pending residual instead of latching to pending', () => {
    // Two orders. Captured: fee 250, processing 180. Pending-fee: fee 90.
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 340, // 250 captured + 90 pending
        processingFeeCents: 180, // captured fees only
        processingFeePendingCount: 1,
        pendingFeePlatformFeeCents: 90,
      })
    );
    // Available nets ONLY the captured order: (340 − 90) − 180 = 70.
    expect(income.netPlatformIncome.availableCents).toBe(70);
    // The pending order's 90 of fee income is excluded, not added and not zeroed.
    expect(income.netPlatformIncome.pendingResidualCents).toBe(90);
    expect(income.netPlatformIncome.pendingOrderCount).toBe(1);
    expect(income.processingFeePendingCount).toBe(1);
  });

  it('does not let ONE delayed fee suppress the net of every other order', () => {
    // 100 captured orders' worth of fee income, one straggler. The available
    // figure must still be a real number — this is the whole point of the fix.
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 25_000 + 250,
        processingFeeCents: 18_000,
        processingFeePendingCount: 1,
        pendingFeePlatformFeeCents: 250,
      })
    );
    expect(income.netPlatformIncome.availableCents).toBe(7000);
    expect(income.netPlatformIncome.pendingResidualCents).toBe(250);
  });

  it('excludes a pending order REFUND from the available net too (never double-counted)', () => {
    // The pending order carries a 40c post-hoc refund. Because that order is not
    // in the available population, its refund must come out of the available
    // subtraction as well — otherwise the available net would be understated by
    // a refund belonging to money it never counted.
    const income = derivePlatformIncome(
      summaryRow({
        platformFeeCents: 340,
        processingFeeCents: 180,
        processingFeePendingCount: 1,
        pendingFeePlatformFeeCents: 90,
        refundedCents: 40,
        pendingFeeRefundedCents: 40,
      })
    );
    // (340 − 90) − 180 − (40 − 40) = 70, unchanged by the pending order's refund.
    expect(income.netPlatformIncome.availableCents).toBe(70);
    // The residual is the pending fee income net of its own recorded refund.
    expect(income.netPlatformIncome.pendingResidualCents).toBe(50);
  });

  it('reports a zero residual and zero pending count when every fee is captured', () => {
    const income = derivePlatformIncome(
      summaryRow({ platformFeeCents: 250, processingFeeCents: 180 })
    );
    expect(income.netPlatformIncome.pendingResidualCents).toBe(0);
    expect(income.netPlatformIncome.pendingOrderCount).toBe(0);
  });

  // ── ROOT FIX (review finding 3): non-entry refunds are visible and subtracted.
  it('reports non-entry charges NET of both refund kinds', () => {
    const income = derivePlatformIncome(
      summaryRow({
        nonEntryOrderCount: 3,
        nonEntryGrossCents: 7500,
        nonEntryRefundedCents: 4000,
        nonEntryMakeWholeRefundedCents: 250,
      })
    );
    expect(income.nonEntry.grossCents).toBe(7500);
    expect(income.nonEntry.refundedCents).toBe(4000);
    expect(income.nonEntry.makeWholeRefundedCents).toBe(250);
    // 7500 − 4000 − 250 = 3250.
    expect(income.nonEntry.netCents).toBe(3250);
  });

  it('reports a FULLY refunded one-time payment at $0 net, not at full gross', () => {
    // The exact regression: the gross-only figure reported this money forever.
    const income = derivePlatformIncome(
      summaryRow({
        nonEntryOrderCount: 1,
        nonEntryGrossCents: 4000,
        nonEntryRefundedCents: 4000,
      })
    );
    expect(income.nonEntry.grossCents).toBe(4000);
    expect(income.nonEntry.netCents).toBe(0);
  });

  it('keeps non-entry refunds OUT of the entry refund totals', () => {
    const income = derivePlatformIncome(
      summaryRow({ refundedCents: 0, nonEntryRefundedCents: 4000 })
    );
    expect(income.refundedCents).toBe(0);
    expect(income.nonEntry.refundedCents).toBe(4000);
  });

  it('subtracts BOTH refund kinds from online collected (both really left)', () => {
    // Net income excludes make-whole, but COLLECTED must not: that money was
    // charged and handed back, so the platform is not holding it either way.
    const income = derivePlatformIncome(
      summaryRow({ grossChargedCents: 5250, refundedCents: 1000, makeWholeRefundedCents: 0 })
    );
    expect(income.onlineCollectedCents).toBe(4250);

    const withBoth = derivePlatformIncome(
      summaryRow({ grossChargedCents: 9350, refundedCents: 25, makeWholeRefundedCents: 4000 })
    );
    // 9350 − 25 − 4000 = 5325.
    expect(withBoth.onlineCollectedCents).toBe(5325);
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
    // ...and the net income still reports a real available figure alongside it.
    expect(result.platformIncome.netPlatformIncome.pendingOrderCount).toBe(3);
    expect(typeof result.platformIncome.netPlatformIncome.availableCents).toBe('number');
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

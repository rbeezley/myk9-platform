import { describe, expect, it } from 'vitest';
import { derivePlatformAttention } from './platformAttention';
import { resolveOrderChargeVerification } from '../chargeVerification';
import type {
  FinancialReconciliationOrder,
  FinancialReconciliationPayout,
} from '../financialReconciliation';

function order(
  overrides: Partial<FinancialReconciliationOrder> = {}
): FinancialReconciliationOrder {
  return {
    orderId: 'order-1',
    showId: 'show-1',
    showName: 'Show 1',
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

function payout(
  overrides: Partial<FinancialReconciliationPayout> = {}
): FinancialReconciliationPayout {
  return {
    payoutId: 'payout-1',
    showId: 'show-1',
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

describe('derivePlatformAttention — genuine drift', () => {
  it('flags a genuine failed transfer (non-self-healing failure_reason)', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [payout({ status: 'failed', failureReason: 'account_closed' })],
      orders: [],
    });
    expect(attention.failedTransferCount).toBe(1);
    expect(attention.totalCount).toBe(1);
  });

  // ── ROOT FIX (review finding 3): a retried failure is history, not an open item.
  it('does NOT flag a failed transfer that was RETRIED and completed', () => {
    // cron-process-payouts leaves the failed row and INSERTs a new row for the
    // retry, so the show holds both. show_payouts_one_live_per_show guarantees at
    // most one non-failed row per show, so the presence of ANY live row means the
    // failure was superseded. Without this the show would show a permanent
    // attention item even though the club has been paid.
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [
        payout({
          payoutId: 'p-failed',
          showId: 'show-1',
          status: 'failed',
          failureReason: 'account_closed',
          createdAt: '2026-07-01T00:00:00Z',
        }),
        payout({
          payoutId: 'p-retry',
          showId: 'show-1',
          status: 'completed',
          createdAt: '2026-07-02T00:00:00Z',
        }),
      ],
      orders: [],
    });
    expect(attention.failedTransferCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('still flags a failed transfer whose show has NO live payout row', () => {
    // Another show's retry must not silence this show's genuine failure.
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [
        payout({
          payoutId: 'p-failed-1',
          showId: 'show-1',
          status: 'failed',
          failureReason: 'account_closed',
        }),
        payout({ payoutId: 'p-retry-1', showId: 'show-1', status: 'completed' }),
        payout({
          payoutId: 'p-failed-2',
          showId: 'show-2',
          status: 'failed',
          failureReason: 'account_closed',
        }),
      ],
      orders: [],
    });
    expect(attention.failedTransferCount).toBe(1);
  });

  it('does not flag a legitimate cart-overflow order as a charge mismatch', () => {
    // 9350 == 5000 + 350 + 4000 ties out once make-whole is in the check.
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [
        order({
          amountCents: 9350,
          entrySubtotalCents: 5000,
          platformFeeCents: 350,
          makeWholeRefundedCents: 4000,
        }),
      ],
    });
    expect(attention.chargeMismatchCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  // ── UN-PINNED (review finding 1). This case USED to assert
  // `unrecordedRefundCount === 1` for a 'succeeded' order carrying a partial
  // post-hoc refund — i.e. the most ordinary refund the product performs. That
  // assertion pinned the false red AS INTENDED BEHAVIOR, so no test could ever
  // have caught it. It is replaced by its inverse in the calm-states block below,
  // plus the genuine self-contradiction cases here.
  it('flags an order marked refunded whose refund ledger never recorded the money', () => {
    // status = 'refunded' means fully refunded (webhook refund-attribution
    // invariant), so a zero recorded total is a lost ledger write.
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ status: 'refunded', amountCents: 5000, refundedCents: 0 })],
    });
    expect(attention.refundLedgerDriftCount).toBe(1);
    expect(attention.totalCount).toBe(1);
  });

  it('flags an order marked refunded that is only PARTIALLY recorded as refunded', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ status: 'refunded', amountCents: 5000, refundedCents: 1500 })],
    });
    expect(attention.refundLedgerDriftCount).toBe(1);
  });

  it('flags a FULLY refunded order whose status was never flipped', () => {
    // The genuine drift the old rule was aiming at, now expressed so it cannot
    // fire on a partial: the refunds account for the ENTIRE charge, so the
    // status write was lost.
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ status: 'succeeded', amountCents: 5000, refundedCents: 5000 })],
    });
    expect(attention.refundLedgerDriftCount).toBe(1);
  });

  it('flags recorded refunds that EXCEED the amount charged', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [
        order({
          status: 'succeeded',
          amountCents: 5000,
          refundedCents: 4000,
          makeWholeRefundedCents: 2000,
        }),
      ],
    });
    expect(attention.refundLedgerDriftCount).toBe(1);
  });

  it('flags legacy orders with a permanently missing platform-fee snapshot', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 3,
      payouts: [],
      orders: [],
    });
    expect(attention.missingPlatformFeeSnapshotCount).toBe(3);
    expect(attention.totalCount).toBe(3);
  });

  it('flags a charge mismatch the club view also labels Mismatch (same helper)', () => {
    // amount 5000 but subtotal + fee = 4500 + 400 = 4900 → does not tie.
    const mismatching = order({
      amountCents: 5000,
      entrySubtotalCents: 4500,
      platformFeeCents: 400,
    });
    expect(resolveOrderChargeVerification(mismatching)).toBe('Mismatch');

    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [mismatching],
    });
    expect(attention.chargeMismatchCount).toBe(1);
    expect(attention.totalCount).toBe(1);
  });

  it('sums all four genuine categories together', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 2,
      payouts: [payout({ status: 'failed', failureReason: 'account_closed' })],
      orders: [
        // Fully refunded (5000 of 5000) but still 'succeeded' — genuine drift.
        order({ status: 'succeeded', amountCents: 5000, refundedCents: 5000 }),
        order({
          orderId: 'order-2',
          amountCents: 9000,
          entrySubtotalCents: 4500,
          platformFeeCents: 500,
        }),
      ],
    });
    expect(attention.failedTransferCount).toBe(1);
    expect(attention.refundLedgerDriftCount).toBe(1);
    expect(attention.chargeMismatchCount).toBe(1);
    expect(attention.missingPlatformFeeSnapshotCount).toBe(2);
    expect(attention.totalCount).toBe(5);
  });
});

describe('derivePlatformAttention — calm pending / self-healing states are NOT attention', () => {
  it('a self-healing failed payout (Retrying) is not counted as a failed transfer', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [
        payout({ status: 'failed', failureReason: 'insufficient_balance: retry tomorrow' }),
      ],
      orders: [],
    });
    expect(attention.failedTransferCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('a normal pending/scheduled payout is not counted as a failed transfer', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [payout({ status: 'pending' }), payout({ status: 'processing' })],
      orders: [],
    });
    expect(attention.failedTransferCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('a completed (Paid) payout is not counted as attention', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [payout({ status: 'completed' })],
      orders: [],
    });
    expect(attention.totalCount).toBe(0);
  });

  // ── ROOT FIX (review finding 1): a NORMAL refund is never attention. The old
  // rule (refundedCents > 0 && status !== 'refunded') fired on the single most
  // common in-app refund flow — a partial refund, which legitimately leaves the
  // order 'succeeded' — producing a permanent false red on the calm-oversight
  // surface. These four cases are the ordinary shapes of the app and Stripe
  // dashboard refund paths; all must stay silent.
  it('a NORMAL FULL refund (status flipped, whole amount recorded) is not attention', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ status: 'refunded', amountCents: 5000, refundedCents: 5000 })],
    });
    expect(attention.refundLedgerDriftCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('a NORMAL PARTIAL refund (order stays succeeded) is not attention', () => {
    // THE regression this fix exists for. $15.00 refunded on a $50.00 order: the
    // order is correctly still 'succeeded' because it is not fully refunded.
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ status: 'succeeded', amountCents: 5000, refundedCents: 1500 })],
    });
    expect(attention.refundLedgerDriftCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('a partial refund plus a cart-overflow make-whole refund is not attention', () => {
    // 1200 post-hoc + 4000 make-whole against a 9350 charge: still not full.
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [
        order({
          status: 'succeeded',
          amountCents: 9350,
          entrySubtotalCents: 5000,
          platformFeeCents: 350,
          refundedCents: 1200,
          makeWholeRefundedCents: 4000,
        }),
      ],
    });
    expect(attention.refundLedgerDriftCount).toBe(0);
  });

  it('a make-whole-only refund never implies a status flip', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [
        order({
          status: 'succeeded',
          amountCents: 4000,
          entrySubtotalCents: 0,
          platformFeeCents: 0,
          refundedCents: 0,
          makeWholeRefundedCents: 4000,
        }),
      ],
    });
    expect(attention.refundLedgerDriftCount).toBe(0);
  });

  it('an order with a not-yet-captured processing fee (pending, needs manual backfill) is not attention', () => {
    // processingFeePendingCount is surfaced through the PlatformIncomeSummary as a
    // calm "pending" net-income state, not through snapshotMissingCount/attention.
    // Calm, but NOT self-healing: nothing retries the fee capture, so clearing it
    // takes a manual backfill. It still never renders red.
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ stripeProcessingFeeCents: null, refundedCents: 0 })],
    });
    expect(attention.chargeMismatchCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('a tying order (subtotal + fee == amount) is not a charge mismatch', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ amountCents: 5000, entrySubtotalCents: 4500, platformFeeCents: 500 })],
    });
    expect(attention.chargeMismatchCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('an order with a null snapshot is counted once (server snapshot bucket), not also as a mismatch', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 1,
      payouts: [],
      orders: [order({ entrySubtotalCents: null, platformFeeCents: null })],
    });
    expect(attention.chargeMismatchCount).toBe(0);
    expect(attention.missingPlatformFeeSnapshotCount).toBe(1);
    expect(attention.totalCount).toBe(1);
  });

  it('no orders, no payouts, no missing snapshots produces zero attention', () => {
    const attention = derivePlatformAttention({ snapshotMissingCount: 0, payouts: [], orders: [] });
    expect(attention.totalCount).toBe(0);
  });
});

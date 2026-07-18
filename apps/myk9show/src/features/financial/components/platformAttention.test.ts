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
    status: 'succeeded',
    orderType: 'entry',
    amountCents: 5000,
    entrySubtotalCents: 4500,
    platformFeeCents: 500,
    platformFeeRate: 0.1,
    stripeProcessingFeeCents: 150,
    refundedCents: 0,
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

  it('flags an unrecorded refund: refundedCents > 0 but status never flipped to refunded', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ status: 'succeeded', refundedCents: 1500 })],
    });
    expect(attention.unrecordedRefundCount).toBe(1);
    expect(attention.totalCount).toBe(1);
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
        order({ status: 'succeeded', refundedCents: 500 }),
        order({
          orderId: 'order-2',
          amountCents: 9000,
          entrySubtotalCents: 4500,
          platformFeeCents: 500,
        }),
      ],
    });
    expect(attention.failedTransferCount).toBe(1);
    expect(attention.unrecordedRefundCount).toBe(1);
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

  it('a refunded order whose status IS flipped to refunded is not an unrecorded refund', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [],
      orders: [order({ status: 'refunded', refundedCents: 1500 })],
    });
    expect(attention.unrecordedRefundCount).toBe(0);
    expect(attention.totalCount).toBe(0);
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

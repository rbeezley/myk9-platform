import { describe, expect, it } from 'vitest';
import { derivePlatformAttention } from './platformAttention';
import type { FinancialReconciliationPayout } from '../financialReconciliation';

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

describe('derivePlatformAttention — recorded facts only', () => {
  it('flags a genuine failed transfer (non-self-healing failure_reason)', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [payout({ status: 'failed', failureReason: 'account_closed' })],
    });
    expect(attention.failedTransferCount).toBe(1);
    expect(attention.totalCount).toBe(1);
  });

  // ── A retried failure is history, not an open item.
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
    });
    expect(attention.failedTransferCount).toBe(1);
  });

  it('flags legacy orders with a permanently missing platform-fee snapshot', () => {
    const attention = derivePlatformAttention({ snapshotMissingCount: 3, payouts: [] });
    expect(attention.missingPlatformFeeSnapshotCount).toBe(3);
    expect(attention.totalCount).toBe(3);
  });

  it('sums the two remaining categories together', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 2,
      payouts: [payout({ status: 'failed', failureReason: 'account_closed' })],
    });
    expect(attention.failedTransferCount).toBe(1);
    expect(attention.missingPlatformFeeSnapshotCount).toBe(2);
    expect(attention.totalCount).toBe(3);
  });

  // ── THE DELETED CATEGORIES. `chargeMismatchCount` and `refundLedgerDriftCount`
  // were inferences over local rows. They could not distinguish genuine drift
  // from a legacy row, a cash/check desk refund, a partial refund, or rounding
  // residue on a proportional split, and each produced a false red on a normal
  // state. The summary no longer carries them at all, so nothing on the calm
  // oversight surface can be reddened by a guess about the numbers.
  it('exposes ONLY fact-grounded keys — no inferred drift categories remain', () => {
    const attention = derivePlatformAttention({ snapshotMissingCount: 0, payouts: [] });
    expect(Object.keys(attention).sort()).toEqual([
      'failedTransferCount',
      'missingPlatformFeeSnapshotCount',
      'totalCount',
    ]);
  });
});

describe('derivePlatformAttention — calm pending / self-healing states are NOT attention', () => {
  it('a self-healing failed payout (Retrying) is not counted as a failed transfer', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [
        payout({ status: 'failed', failureReason: 'insufficient_balance: retry tomorrow' }),
      ],
    });
    expect(attention.failedTransferCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('a normal pending/scheduled payout is not counted as a failed transfer', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [payout({ status: 'pending' }), payout({ status: 'processing' })],
    });
    expect(attention.failedTransferCount).toBe(0);
    expect(attention.totalCount).toBe(0);
  });

  it('a completed (Paid) payout is not counted as attention', () => {
    const attention = derivePlatformAttention({
      snapshotMissingCount: 0,
      payouts: [payout({ status: 'completed' })],
    });
    expect(attention.totalCount).toBe(0);
  });

  it('no payouts and no missing snapshots produces zero attention', () => {
    const attention = derivePlatformAttention({ snapshotMissingCount: 0, payouts: [] });
    expect(attention.totalCount).toBe(0);
  });
});

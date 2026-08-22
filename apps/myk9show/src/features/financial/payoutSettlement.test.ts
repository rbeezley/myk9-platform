import { describe, expect, it } from 'vitest';
import {
  resolvePayoutSettlement,
  settlementStateForBadge,
  summarizePayoutSettlement,
} from './payoutSettlement';
import type { FinancialReconciliationPayout } from './financialReconciliation';

function payout(overrides: Partial<FinancialReconciliationPayout>): FinancialReconciliationPayout {
  return {
    payoutId: 'payout-1',
    showId: 'show-1',
    showName: null,
    status: 'completed',
    amountCents: 10000,
    stripeTransferId: 'tr_123',
    scheduledDate: null,
    completedAt: '2026-07-17T00:00:00Z',
    failureReason: null,
    createdAt: '2026-07-16T00:00:00Z',
    ...overrides,
  };
}

describe('settlementStateForBadge', () => {
  it('maps the existing payout badge vocabulary to settlement buckets', () => {
    expect(settlementStateForBadge('Paid')).toBe('settled');
    expect(settlementStateForBadge('Sending')).toBe('in_progress');
    expect(settlementStateForBadge('Scheduled')).toBe('in_progress');
    expect(settlementStateForBadge('Waiting for account')).toBe('in_progress');
    expect(settlementStateForBadge('Retrying')).toBe('in_progress');
    expect(settlementStateForBadge('Needs attention')).toBe('attention');
  });
});

describe('resolvePayoutSettlement', () => {
  it('completed transfer is Paid / settled and carries the copyable transfer id', () => {
    const row = resolvePayoutSettlement(payout({ status: 'completed' }), 'enabled');
    expect(row.badgeLabel).toBe('Paid');
    expect(row.state).toBe('settled');
    expect(row.stripeTransferId).toBe('tr_123');
  });

  it('pending on an enabled club reads as Scheduled (in progress), not a failure', () => {
    const row = resolvePayoutSettlement(payout({ status: 'pending' }), 'enabled');
    expect(row.badgeLabel).toBe('Scheduled');
    expect(row.state).toBe('in_progress');
  });

  it('pending on a not-yet-onboarded club reads as Waiting for account', () => {
    const row = resolvePayoutSettlement(payout({ status: 'pending' }), 'not-enabled');
    expect(row.badgeLabel).toBe('Waiting for account');
    expect(row.state).toBe('in_progress');
  });

  it('self-healing failure reads as Retrying, not attention', () => {
    const row = resolvePayoutSettlement(
      payout({ status: 'failed', failureReason: 'insufficient_balance: retry tomorrow' }),
      'enabled'
    );
    expect(row.badgeLabel).toBe('Retrying');
    expect(row.state).toBe('in_progress');
  });

  it('genuine failure reads as Needs attention', () => {
    const row = resolvePayoutSettlement(
      payout({ status: 'failed', failureReason: 'account_closed' }),
      'enabled'
    );
    expect(row.badgeLabel).toBe('Needs attention');
    expect(row.state).toBe('attention');
  });
});

describe('summarizePayoutSettlement', () => {
  it('buckets settled vs in-progress cents and counts attention rows', () => {
    const summary = summarizePayoutSettlement(
      [
        payout({ payoutId: 'p1', status: 'completed', amountCents: 10000 }),
        payout({ payoutId: 'p2', status: 'pending', amountCents: 4000 }),
        payout({
          payoutId: 'p3',
          status: 'failed',
          failureReason: 'account_closed',
          amountCents: 500,
        }),
      ],
      'enabled'
    );
    expect(summary.settledCents).toBe(10000);
    expect(summary.inProgressCents).toBe(4000);
    expect(summary.attentionCount).toBe(1);
    expect(summary.rows).toHaveLength(3);
  });
});

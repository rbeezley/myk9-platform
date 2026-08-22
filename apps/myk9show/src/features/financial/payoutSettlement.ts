// Payout-settlement state resolver (unified-financial-dashboard, MYK9-54,
// task 2.3). Settlement is INDEPENDENT of charge verification: it answers "did
// money transfer toward the club?", never "does the charge tie to Stripe?".
//
// This reuses the EXISTING treasurer-facing payout badge vocabulary
// (resolvePayoutBadge): Paid / Sending / Scheduled / Waiting for account /
// Retrying / Needs attention. A pending or self-healing payout is NOT mislabeled
// as a financial failure — only 'Needs attention' is a real attention item.
//
// Pure TypeScript only. Money is integer cents.
import { resolvePayoutBadge, type PayoutsAccountState } from '@/features/payments/payoutBadge';
import type { ShowPayoutRow } from '@/features/payments/useClubStripeAccount';
import type { FinancialReconciliationPayout } from './financialReconciliation';

/** Coarse settlement bucket derived from the payout badge label. */
export type SettlementState = 'settled' | 'in_progress' | 'attention';

/** Map a payout badge label to a settlement bucket. `completed` → Paid → settled. */
export function settlementStateForBadge(badgeLabel: string): SettlementState {
  if (badgeLabel === 'Paid') return 'settled';
  if (badgeLabel === 'Needs attention') return 'attention';
  return 'in_progress';
}

export interface PayoutSettlementRow {
  payoutId: string;
  /** Existing payout badge label (Paid / Sending / Scheduled / ...). */
  badgeLabel: string;
  state: SettlementState;
  amountCents: number;
  /** Copyable Stripe transfer id for reconciling a completed transfer. */
  stripeTransferId: string | null;
  /**
   * When this payout settled, or when it started if it has not. Carried across
   * from the payout list this row replaced: a treasurer reconciling against a
   * bank statement needs the date, and it was the ONE field the merged row did
   * not already hold.
   */
  completedAt: string | null;
  createdAt: string;
}

type PayoutFacts = Pick<
  FinancialReconciliationPayout,
  | 'payoutId'
  | 'status'
  | 'amountCents'
  | 'stripeTransferId'
  | 'failureReason'
  | 'completedAt'
  | 'createdAt'
>;

/**
 * Resolve the settlement row for one payout, reusing resolvePayoutBadge.
 *
 * `accountState` is the discriminator the cron itself routes on: it decides
 * whether a `pending` row reads as "Scheduled" (onboarded club, transfer not yet
 * sent) or "Waiting for account" (club has not onboarded). Its third state,
 * `'unknown'`, must be passed through honestly rather than collapsed to
 * "not onboarded" — see PayoutsAccountState.
 */
export function resolvePayoutSettlement(
  payout: PayoutFacts,
  accountState: PayoutsAccountState
): PayoutSettlementRow {
  const badge = resolvePayoutBadge(
    // The reconciliation RPC types status as a plain string; it carries the same
    // show_payouts status domain resolvePayoutBadge expects.
    { status: payout.status as ShowPayoutRow['status'], failure_reason: payout.failureReason },
    accountState
  );
  return {
    payoutId: payout.payoutId,
    badgeLabel: badge.label,
    state: settlementStateForBadge(badge.label),
    amountCents: payout.amountCents,
    stripeTransferId: payout.stripeTransferId,
    completedAt: payout.completedAt,
    createdAt: payout.createdAt,
  };
}

export interface PayoutSettlementSummary {
  settledCents: number;
  inProgressCents: number;
  /** Count of rows a treasurer must act on (Needs attention). */
  attentionCount: number;
  rows: PayoutSettlementRow[];
}

/** Summarize a page of payout rows into settlement buckets by badge state. */
export function summarizePayoutSettlement(
  payouts: PayoutFacts[],
  accountState: PayoutsAccountState
): PayoutSettlementSummary {
  const rows = payouts.map(payout => resolvePayoutSettlement(payout, accountState));
  const summary: PayoutSettlementSummary = {
    settledCents: 0,
    inProgressCents: 0,
    attentionCount: 0,
    rows,
  };
  for (const row of rows) {
    if (row.state === 'settled') summary.settledCents += row.amountCents;
    else if (row.state === 'in_progress') summary.inProgressCents += row.amountCents;
    else summary.attentionCount += 1;
  }
  return summary;
}

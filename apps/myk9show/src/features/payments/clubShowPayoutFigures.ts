/**
 * MYK9-2454: a club's Collected, Refunded, owed and Paid per show, as the server computes them.
 *
 * club_show_payout_figures (migration 20261126183700) sums entries the way the payout run does
 * (_shared/payoutCalc.ts, cron-process-payouts/processShow.ts) and picks the canonical payout
 * row the way the owner's ledger does (payoutLedger.ts pickCanonicalPayout). This module only
 * maps its rows; it computes no money of its own. Change the four together.
 */
import type { PayoutStatus } from './payoutLedger';

/**
 * One row of club_show_payout_figures. Written by hand rather than taken from the generated
 * Functions type: the generator types every RETURNS TABLE column as non-null, but the payout_*
 * columns are NULL for a show with no payout row.
 */
export interface ClubShowPayoutFiguresRow {
  show_id: string;
  show_name: string | null;
  /** shows.end_date as stored (timestamptz, midnight UTC of the last trial day). */
  show_end_date: string | null;
  show_deleted: boolean;
  collected_cents: number;
  refunded_cents: number;
  owed_cents: number;
  payout_id: string | null;
  payout_status: string | null;
  payout_amount_cents: number | null;
  payout_failure_reason: string | null;
  payout_completed_at: string | null;
  payout_created_at: string | null;
  paid_cents: number;
}

/**
 * What reached, or is reaching, the club's bank. `sent` exists only for a completed payout
 * above $0: the payout run closes a fully refunded show's row as completed at $0, and that is
 * not a payment, so no consumer can print "Paid $0.00" for it.
 */
export type ClubShowPaid =
  { kind: 'sent'; cents: number } | { kind: 'in-flight'; cents: number } | { kind: 'none' };

export interface ClubShowPayout {
  id: string;
  /** 'unknown' for a status this build does not know; it never counts as paid. */
  status: PayoutStatus | 'unknown';
  /** show_payouts.amount_cents as stored. */
  amountCents: number;
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

export interface ClubShowPayoutFigures {
  showId: string;
  showName: string | null;
  showEndDate: string | null;
  /** The show was soft-deleted; its money is still real and still counted. */
  showDeleted: boolean;
  /** Online entry fees charged, before refunds (sumOnlineCollectedCents). */
  collectedCents: number;
  /** Refunded against those entries (sumRefundedCents). */
  refundedCents: number;
  /** What the payout run sends: each entry's fee less its refund, floored at 0. */
  owedCents: number;
  /** The canonical payout row; null when the show has none. */
  payout: ClubShowPayout | null;
  paid: ClubShowPaid;
  /** Nothing owed because refunds took it all, and no payment went out. */
  fullyRefunded: boolean;
}

const KNOWN_PAYOUT_STATUSES: ReadonlySet<string> = new Set<PayoutStatus>([
  'pending',
  'processing',
  'completed',
  'failed',
  'awaiting_approval',
  'approved',
  'held',
]);

function toPayoutStatus(status: string): PayoutStatus | 'unknown' {
  return KNOWN_PAYOUT_STATUSES.has(status) ? (status as PayoutStatus) : 'unknown';
}

function toPayout(row: ClubShowPayoutFiguresRow): ClubShowPayout | null {
  if (row.payout_id === null || row.payout_status === null) return null;
  return {
    id: row.payout_id,
    status: toPayoutStatus(row.payout_status),
    amountCents: row.payout_amount_cents ?? 0,
    failureReason: row.payout_failure_reason,
    completedAt: row.payout_completed_at,
    createdAt: row.payout_created_at,
  };
}

function toPaid(payout: ClubShowPayout | null): ClubShowPaid {
  if (payout?.status === 'completed' && payout.amountCents > 0) {
    return { kind: 'sent', cents: payout.amountCents };
  }
  if (payout?.status === 'processing') return { kind: 'in-flight', cents: payout.amountCents };
  return { kind: 'none' };
}

export function toClubShowPayoutFigures(row: ClubShowPayoutFiguresRow): ClubShowPayoutFigures {
  const payout = toPayout(row);
  const paid = toPaid(payout);
  return {
    showId: row.show_id,
    showName: row.show_name,
    showEndDate: row.show_end_date,
    showDeleted: row.show_deleted,
    collectedCents: row.collected_cents,
    refundedCents: row.refunded_cents,
    owedCents: row.owed_cents,
    payout,
    paid,
    fullyRefunded: row.owed_cents === 0 && row.refunded_cents > 0 && paid.kind !== 'sent',
  };
}

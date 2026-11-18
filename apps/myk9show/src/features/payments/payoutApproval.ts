/**
 * MYK9-2171: pure rules for the payout brake's operator screen.
 *
 * The server (approve_show_payout / hold_show_payout, MYK9-2170) decides; this
 * module only chooses which rows to offer, counts the evidence for switching
 * the brake off, and turns the server's refusals into plain copy.
 */
import { STEP_UP_SQLSTATE } from '@/features/step-up/stepUpFetch';
import type { LedgerPayoutDetail, LedgerRow, PayoutStatus } from './payoutLedger';

export const HOLD_REASON_MAX = 500;

/** Why a hold reason cannot be sent, in the server's own words; null when it can. */
export function holdReasonProblem(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return 'Say why the payout is held';
  if (trimmed.length > HOLD_REASON_MAX) {
    return `Keep the reason under ${HOLD_REASON_MAX} characters`;
  }
  return null;
}

/** A ledger row the approval list shows: it has a payout row in a brake state. */
export type QueuedPayoutRow = LedgerRow & {
  payout: LedgerPayoutDetail;
  payoutStatus: PayoutStatus;
};

/** A payout Approve applies to: waiting for approval, or held. */
export function canApprovePayout(row: LedgerRow): row is QueuedPayoutRow {
  return (
    row.payout !== null && (row.payoutStatus === 'awaiting_approval' || row.payoutStatus === 'held')
  );
}

/**
 * The approval list: every payout the brake is holding back, including one
 * already approved but not yet sent by the nightly run (it can still be held).
 */
export function payoutsInApprovalQueue(rows: LedgerRow[]): QueuedPayoutRow[] {
  return rows.filter(
    (row): row is QueuedPayoutRow =>
      canApprovePayout(row) || (row.payout !== null && row.payoutStatus === 'approved')
  );
}

export interface ApprovalTally {
  approved: number;
  matchedStripe: number;
}

/**
 * "N payouts approved, M matched Stripe" (owner decision, 2026-11-18): a
 * payout counts as approved when it carries an approval; it matched Stripe when
 * it completed with a Stripe transfer id AND the amount recorded for that
 * transfer equals the amount approved. The reconciliation job records Stripe's
 * actual amount on the row (MYK9-2183), so a transfer for a different amount
 * shows up here as approved but not matched.
 */
export function tallyApprovals(rows: LedgerRow[]): ApprovalTally {
  let approved = 0;
  let matchedStripe = 0;
  for (const row of rows) {
    const payout = row.payout;
    if (!payout || payout.approvedAt === null || payout.approvedAmountCents === null) continue;
    approved += 1;
    if (
      row.payoutStatus === 'completed' &&
      row.stripeTransferId !== null &&
      payout.amountCents === payout.approvedAmountCents
    ) {
      matchedStripe += 1;
    }
  }
  return { approved, matchedStripe };
}

export function formatApprovalTally({ approved, matchedStripe }: ApprovalTally): string {
  return `${approved} ${approved === 1 ? 'payout' : 'payouts'} approved, ${matchedStripe} matched Stripe`;
}

function errorParts(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return {
      code: typeof code === 'string' ? code : '',
      message: typeof message === 'string' ? message : '',
    };
  }
  return { code: '', message: '' };
}

/**
 * Plain copy for a refusal of approve, hold or the brake switch. The server's
 * own sentences are passed through where they are already plain; the ones that
 * carry raw cents or account ids are reworded. The ledger reloads after every
 * approve or hold (the hooks invalidate it), so a "review it again" refusal is
 * answered by the new figures appearing, never by a retry with the old ones.
 */
export function describePayoutActionError(
  action: 'approve' | 'hold' | 'brake-off' | 'brake-on',
  error: unknown
): string {
  const { code, message } = errorParts(error);
  const nothingDone =
    action === 'approve'
      ? 'Nothing was approved.'
      : action === 'hold'
        ? 'The payout was not held.'
        : 'The brake was not changed.';

  if (code === STEP_UP_SQLSTATE) return `${nothingDone} Confirm your password to continue.`;
  if (code === '42501') return `${nothingDone} Only a site admin can do this.`;
  if (message.startsWith('The amount is now')) {
    return `${nothingDone} The amount changed since you looked. The new amount is shown; review it again.`;
  }
  if (message.startsWith("The club's bank account changed")) {
    return `${nothingDone} The club's bank account changed since you looked. Review it again.`;
  }
  if (message.startsWith('This payout is already approved for')) {
    return `${nothingDone} This payout is already approved for a different amount or bank account.`;
  }
  if (code === 'P0002') return `${nothingDone} This payout no longer exists.`;
  if (code === '22023' && message) return `${nothingDone} ${message}.`;
  return `${nothingDone} Something went wrong. Try again.`;
}

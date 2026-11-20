/**
 * MYK9-2171: pure rules for the payout brake's operator screen.
 *
 * The server (approve_show_payout / hold_show_payout, MYK9-2170) decides; this
 * module only chooses which rows to offer, counts the evidence for switching
 * the brake off, and turns the server's refusals into plain copy.
 */
import { STEP_UP_SQLSTATE } from '@/features/step-up/stepUpFetch';
import type { LedgerPayout, LedgerPayoutDetail, LedgerRow, PayoutStatus } from './payoutLedger';

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
 * "N payouts approved, M matched Stripe" (owner decisions, 2026-11-18),
 * counted over EVERY payout row, failed attempts included: a failed approved
 * send keeps its approval, so it stays counted as approved and unmatched after
 * the next run creates a replacement.
 *
 * Matched Stripe: completed, with a Stripe transfer id, the amount recorded for
 * that transfer equals the amount approved, and the account Stripe reported
 * paying (recorded by the nightly run, MYK9-2195) is the approved account. A
 * destination the run could not check, or a transfer recorded before the run
 * kept it, never counts as matched.
 */
export function tallyApprovals(payouts: LedgerPayout[]): ApprovalTally {
  let approved = 0;
  let matchedStripe = 0;
  for (const payout of payouts) {
    const approval = payout.approval;
    if (!approval || approval.approvedAt === null || approval.approvedAmountCents === null) {
      continue;
    }
    approved += 1;
    if (
      payout.status === 'completed' &&
      payout.stripe_transfer_id !== null &&
      payout.amount_cents === approval.approvedAmountCents &&
      payout.paid_destination_checked === true &&
      approval.approvedStripeAccountId !== null &&
      payout.paid_stripe_account_id === approval.approvedStripeAccountId
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

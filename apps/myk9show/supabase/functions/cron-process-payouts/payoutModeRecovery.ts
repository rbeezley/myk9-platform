// The operator's recovery for a payout held because the run could not confirm
// the earlier attempt's Stripe mode (MYK9-2187). One copy, used by the alert;
// docs/operations/stripe-platform-setup.md carries the same procedure.
//
// Smallest safe procedure: the operator checks Stripe in the mode(s) the run
// cannot see and records only that check, and the run (in its own mode)
// records any transfer it can see itself. Only a live transfer in the mode
// the run cannot see is recorded by hand, with the cron's own rules
// (payoutReconcile.ts lookUpShowTransfer and recordStripeTransfer).

import { escapeHtml } from '../_shared/clubMoneyEmails.ts';

/**
 * The failure_reason an operator sets after checking, in the attempt's own
 * Stripe mode, that no transfer went out. The run then trusts that check and
 * asks Stripe only in its own mode.
 */
export const MODE_CHECKED_REASON = 'mode_checked_by_operator';

export type UnconfirmedMode = 'mismatch' | 'no_account' | 'read_error';

/** Only a row still unresolved, with no transfer recorded, may be changed by hand. */
const UNRESOLVED_GUARD = `status in ('processing', 'failed') and stripe_transfer_id is null`;

export function modeCheckedSql(rowId: string): string {
  return `update public.show_payouts set status = 'failed', failure_reason = '${MODE_CHECKED_REASON}' where id = '${rowId}' and ${UNRESOLVED_GUARD};`;
}

export function recordTransferSql(rowId: string): string {
  return `update public.show_payouts set status = 'completed', stripe_transfer_id = '<tr_ id>', amount_cents = <the transfer's amount in cents>, completed_at = now(), paid_stripe_account_id = '<acct_ id it went to>', paid_destination_checked = true where id = '${rowId}' and ${UNRESOLVED_GUARD};`;
}

function modeName(live: boolean): string {
  return live ? 'live' : 'test';
}

/** The recovery steps for the hold alert, as HTML. */
export function attemptModeRecoveryHtml(
  mode: UnconfirmedMode,
  stripeLivemode: boolean,
  showId: string,
  rowId: string
): string {
  const run = modeName(stripeLivemode);
  const other = modeName(!stripeLivemode);
  const where =
    mode === 'mismatch'
      ? `in <strong>${other} mode</strong>, the mode the earlier attempt used`
      : `in <strong>both ${other} mode and ${run} mode</strong>: the run could not tell which
         mode the earlier attempt used, so check both before changing anything`;
  return `<p>To clear the hold, look up transfer group <code>${escapeHtml(showId)}</code> in the
     Stripe dashboard ${where}. A transfer Stripe shows as reversed, or whose reversed amount
     equals its amount, returned the money: it is not a payment.</p>
     <ul>
     <li>If ${other} mode has no transfer for this show that is not fully reversed, record only
     the check: <code>${escapeHtml(modeCheckedSql(rowId))}</code> The next run asks Stripe in ${run} mode,
     records a transfer it finds there itself, and otherwise queues the payout again.</li>
     <li>If ${other} mode has a transfer that is not fully reversed, record it by hand with
     Stripe's own figures (its id, its amount even if partly reversed, and the account it went
     to): <code>${escapeHtml(recordTransferSql(rowId))}</code> More than one such transfer, in either mode, is a
     possible double payment: record the newest and reverse the others in the Stripe dashboard.</li>
     </ul>
     <p>Each statement must report exactly one row changed (UPDATE 1). UPDATE 0 means the row is
     no longer unresolved or already has a transfer: change nothing and read the row again.
     Until then every run holds it. Runbook: docs/operations/stripe-platform-setup.md.</p>`;
}

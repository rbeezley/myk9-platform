// The operator's recovery for a payout held because the run could not confirm
// the earlier attempt's Stripe mode (MYK9-2187). One copy, used by the alert;
// docs/operations/stripe-platform-setup.md carries the same procedure.
//
// The operator never records a transfer and never moves a row's status by
// hand. They check Stripe in the mode(s) the run cannot see and, only when
// nothing there moved money, mark the held row as checked. The row stays
// 'processing' (refunds blocked) and the run then settles it through its own
// path in its own mode: lookUpShowTransfer, and recordStripeTransfer for a
// transfer it finds (Stripe's amount, destination and the account link), or
// failed for retry when there is none. Anything found in the other mode is
// escalated, not fixed by hand.

import { escapeHtml } from '../_shared/clubMoneyEmails.ts';

/**
 * The failure_reason an operator sets on a held 'processing' row after
 * checking, in the mode(s) the run cannot see, that no transfer moved money.
 * checkAttemptMode then treats the row as checkable in the run's own mode.
 */
export const MODE_CHECKED_REASON = 'mode_checked_by_operator';

export type UnconfirmedMode = 'mismatch' | 'no_account' | 'read_error';

/**
 * The only hand statement: marks the check and nothing else. The guard changes
 * only a row still held as processing with no transfer recorded.
 */
export function modeCheckedSql(rowId: string): string {
  return `update public.show_payouts set failure_reason = '${MODE_CHECKED_REASON}' where id = '${rowId}' and status = 'processing' and stripe_transfer_id is null and failure_reason is distinct from '${MODE_CHECKED_REASON}';`;
}

export type StripeMode = 'live' | 'test';

/**
 * The modes the run cannot see for this hold, which alone decide the
 * operator's step: the other mode on a mismatch; both modes when the
 * attempt's mode could not be established.
 */
export function modesRunCannotSee(mode: UnconfirmedMode, stripeLivemode: boolean): StripeMode[] {
  const other: StripeMode = stripeLivemode ? 'test' : 'live';
  return mode === 'mismatch' ? [other] : ['test', 'live'];
}

/**
 * The operator's one decision: escalate (change nothing) when a mode the run
 * cannot see has a transfer that is not fully reversed; otherwise mark the
 * row checked and let the run reconcile its own mode. A transfer only in the
 * run's own mode never decides it, since the run records that one itself.
 */
export function recoveryAction(
  mode: UnconfirmedMode,
  stripeLivemode: boolean,
  unreversedTransferIn: Record<StripeMode, boolean>
): 'mark_checked' | 'escalate' {
  return modesRunCannotSee(mode, stripeLivemode).some(m => unreversedTransferIn[m])
    ? 'escalate'
    : 'mark_checked';
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
  const unseen = modesRunCannotSee(mode, stripeLivemode);
  const unseenText =
    unseen.length === 1 ? `${unseen[0]} mode` : `${unseen[0]} mode or ${unseen[1]} mode`;
  const where =
    mode === 'mismatch'
      ? `in <strong>${unseenText}</strong>, the mode the earlier attempt used`
      : `in <strong>both test mode and live mode</strong>: the run could not tell which mode
         the earlier attempt used, so both count as modes it cannot see`;
  return `<p>To clear the hold, look up transfer group <code>${escapeHtml(showId)}</code> in the
     Stripe dashboard ${where}. A transfer Stripe shows as reversed, or whose reversed amount
     equals its amount, returned the money: it is not a payment. Decide only on what you find
     in ${unseenText}.</p>
     <ul>
     <li>If ${unseenText} has a transfer that is not fully reversed, change nothing: the row
     stays held and refunds stay blocked. Forward this alert to the myK9Show developer, with the
     transfer id, to reconcile it.</li>
     <li>Otherwise, mark the row checked: <code>${escapeHtml(modeCheckedSql(rowId))}</code> It
     should report exactly one row changed (UPDATE 1). UPDATE 0 means the check was already
     recorded or the row has moved on: change nothing. The row stays processing, so refunds stay
     blocked. Once it has been processing for a day after this update, the run asks Stripe in
     ${run} mode: it records a transfer it finds there, with Stripe's figures, or fails the
     payout for retry when there is none.</li>
     </ul>
     <p>Never mark the row completed or failed by hand. Until it is checked, every run holds it.
     Runbook: docs/operations/stripe-platform-setup.md.</p>`;
}

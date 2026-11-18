// The payout brake (MYK9-2170): the rules cron-process-payouts applies while
// platform_settings.payouts_require_approval is on, kept free of Deno, Stripe
// and database imports so each rule is testable under vitest.
//
// - The run works out the amount exactly as before. Where it would send, it
//   records the payout as 'awaiting_approval' instead.
// - Only a site admin's approval (approve_show_payout) lets a payout through
//   while the brake is on, and the run then sends it on its one send path:
//   money lock, recalculation after the claim, transfer_group guard.
// - An approval covers one destination account and at most one amount; a
//   different destination or a larger amount needs approving again.
// - A 'held' payout keeps its amount refreshed and is not sent until approved.
// - Each payout awaiting approval reminds the operator once a day.

import { escapeHtml } from './clubMoneyEmails.ts';

/** show_payouts statuses the brake adds (migration 20261118211700). */
export type PayoutApprovalStatus = 'awaiting_approval' | 'approved' | 'held';

/** operator_alerts.source the cron writes; the RPCs resolve reminders by it. */
export const PAYOUT_ALERT_SOURCE = 'cron-process-payouts';

/**
 * A reminder is due when the last one is older than this. Under a day, so a
 * nightly run that starts a little earlier than yesterday's still reminds;
 * over half a day, so a manual re-run the same day does not.
 */
export const PAYOUT_REMINDER_INTERVAL_HOURS = 20;

/** Dedupe key of a payout's reminder alert. The approve and hold RPCs resolve
 * the alert by this exact key, so the two must not drift. */
export function awaitingApprovalDedupeKey(payoutId: string): string {
  return `payout-awaiting-approval-${payoutId}`;
}

/**
 * Whether the run looks at a show at all, given its live (non-failed) payout
 * row. No row, a parked 'pending' row, a row awaiting approval (its amount is
 * refreshed, or it sends once the brake is off), an approved row and a held
 * row (its amount is refreshed, nothing else) are worked; a row being sent or
 * settled is left alone.
 */
export function shouldEvaluateShow(liveStatus: string | null): boolean {
  return (
    liveStatus === null ||
    liveStatus === 'pending' ||
    liveStatus === 'awaiting_approval' ||
    liveStatus === 'approved' ||
    liveStatus === 'held'
  );
}

/** What an approval covers (show_payouts.approved_*). */
export interface PayoutApproval {
  approvedAt: string;
  amountCents: number;
  stripeAccountId: string;
}

/** The approval stored on a row, or null when it carries none. */
export function approvalOnRow(row: {
  approved_at: string | null;
  approved_amount_cents: number | null;
  approved_stripe_account_id: string | null;
}): PayoutApproval | null {
  if (!row.approved_at || row.approved_amount_cents === null || !row.approved_stripe_account_id) {
    return null;
  }
  return {
    approvedAt: row.approved_at,
    amountCents: row.approved_amount_cents,
    stripeAccountId: row.approved_stripe_account_id,
  };
}

/**
 * Whether an approval still covers the transfer the run is about to make: the
 * same destination, and no more than was approved (refunds may lower it).
 * Returns the reason it does not, or null when it does.
 */
export function approvalMismatch(
  approval: PayoutApproval,
  transfer: { amountCents: number; stripeAccountId: string }
): string | null {
  if (transfer.stripeAccountId !== approval.stripeAccountId) {
    return `the destination account changed from ${approval.stripeAccountId} to ${transfer.stripeAccountId} since approval`;
  }
  if (transfer.amountCents > approval.amountCents) {
    return `the amount rose from ${dollars(approval.amountCents)} to ${dollars(transfer.amountCents)} since approval`;
  }
  return null;
}

/**
 * At the point the run would send: send, or record the payout as waiting.
 * An approved row sends whatever the brake says, because a person approved it.
 * So does a retry of an approved attempt that failed for a self-healing
 * reason (`carriedApprovalAt`, see carriedApprovalFrom).
 * With the brake off nothing waits, including a row recorded while it was on.
 */
export function sendOrWait(input: {
  brakeOn: boolean;
  liveStatus: string | null;
  carriedApprovalAt: string | null;
}): 'send' | 'wait_for_approval' {
  if (input.liveStatus === 'approved') return 'send';
  if (input.carriedApprovalAt) return 'send';
  return input.brakeOn ? 'wait_for_approval' : 'send';
}

/**
 * Whether an approved attempt that failed keeps its approval for the retry.
 * Only the run's self-healing failures do: a card-clearing balance delay, a
 * stale 'processing' row reopened for retry, or an entries read that failed
 * after the claim (nothing reached Stripe). Any other failure (a closed or
 * changed bank account, a Stripe rejection) means the facts the approval was
 * given on may have changed, so the retry waits for approval again.
 * Same set as payoutBadge.ts's isSelfHealingFailure.
 */
export function approvalSurvivesFailure(failureReason: string | null | undefined): boolean {
  if (!failureReason) return false;
  return (
    failureReason.startsWith('insufficient_balance') ||
    failureReason === 'stale_processing' ||
    failureReason === 'entries_load_failed_post_claim'
  );
}

/**
 * The approval a retry row inherits from the show's latest attempt: that
 * attempt's approval when it failed for a self-healing reason, else null.
 */
export function carriedApprovalFrom(
  latest: {
    status: string;
    approved_at: string | null;
    approved_amount_cents: number | null;
    approved_stripe_account_id: string | null;
    failure_reason: string | null;
  } | null
): PayoutApproval | null {
  if (!latest || latest.status !== 'failed') return null;
  const approval = approvalOnRow(latest);
  if (!approval) return null;
  return approvalSurvivesFailure(latest.failure_reason) ? approval : null;
}

export type BrakeSetting = { ok: true; on: boolean } | { ok: false; message: string };

/**
 * Read the brake from a platform_settings select. Anything but a clear
 * boolean is not ok: the caller stops the run, so a broken read can neither
 * send an unapproved payout nor park payouts the owner switched the brake off for.
 */
export function parseBrakeSetting(result: {
  data: { payouts_require_approval?: unknown } | null;
  error: { message?: string } | null;
}): BrakeSetting {
  if (result.error) {
    return { ok: false, message: result.error.message ?? 'platform_settings read failed' };
  }
  const value = result.data?.payouts_require_approval;
  if (typeof value !== 'boolean') {
    return { ok: false, message: 'platform_settings.payouts_require_approval is missing' };
  }
  return { ok: true, on: value };
}

/** last_reminded_at older than this (or never) means a reminder is due. */
export function reminderCutoffIso(nowMs: number): string {
  return new Date(nowMs - PAYOUT_REMINDER_INTERVAL_HOURS * 3600 * 1000).toISOString();
}

export interface AwaitingPayout {
  id: string;
  showId: string;
  showName: string | null;
  amountCents: number;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function awaitingApprovalAlert(payout: AwaitingPayout): {
  subject: string;
  html: string;
  dedupeKey: string;
} {
  // The subject is plain text; the show name is the club's own text, so it is
  // escaped in the HTML body.
  const show = payout.showName ?? payout.showId;
  return {
    subject: `Payout waiting for your approval: ${show}`,
    html: `<p>The payout of ${dollars(payout.amountCents)} for <strong>${escapeHtml(show)}</strong>
      (show <code>${payout.showId}</code>, payout <code>${payout.id}</code>) is waiting
      for your approval.</p>
      <p>Payouts wait for approval while the payout brake is on. It will not be sent
      until you approve it, and this reminder repeats daily until you approve or hold it.
      The amount is worked out again when it is sent.</p>`,
    dedupeKey: awaitingApprovalDedupeKey(payout.id),
  };
}

export interface ReminderDeps {
  /** Atomically stamp last_reminded_at on every awaiting payout whose last
   * reminder is older than `cutoffIso` (or never), returning the stamped rows.
   * null on a database error. */
  claimDueReminders: (cutoffIso: string) => Promise<AwaitingPayout[] | null>;
  alert: (subject: string, html: string, dedupeKey: string) => Promise<void>;
}

/** Remind the operator about each payout awaiting approval, at most once a day
 * each. Returns how many reminders were raised, or null when the claim failed
 * (the caller reports that; it is not the same as none being due). */
export async function remindAwaitingApprovals(
  deps: ReminderDeps,
  nowMs: number
): Promise<number | null> {
  const due = await deps.claimDueReminders(reminderCutoffIso(nowMs));
  if (!due) return null;
  for (const payout of due) {
    const { subject, html, dedupeKey } = awaitingApprovalAlert(payout);
    await deps.alert(subject, html, dedupeKey);
  }
  return due.length;
}

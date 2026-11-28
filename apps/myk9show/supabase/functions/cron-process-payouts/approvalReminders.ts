// The payout brake's daily reminder (MYK9-2182): every payout waiting for a
// site admin's approval raises its one operator alert once a day through the
// shared alertAdmin, until it is approved or held.
//
// - One alert per payout: source 'cron-process-payouts', dedupe key
//   'payout-awaiting-approval-<payout id>'. A database trigger refreshes the
//   open alert instead of adding a second one, and resolves it whenever the
//   payout leaves awaiting_approval, whatever the route
//   (20261126034519_myk9_2182_payout_approval_reminders.sql).
// - Once a day: show_payouts.approval_reminded_at. A payout is claimed by
//   stamping it, only while it is still waiting and due, right before its
//   reminder is raised; so two runs never both remind it, and one that stops
//   partway leaves the rest due.
// - Bounded: due payouts are read least recently reminded first (never
//   reminded before any), then by id, in batches keyed on that pair, at most
//   maxBatches per run. Anything past that stays due and comes first next
//   run, so a backlog bigger than one run never starves its tail. A payout
//   claimed this run is stamped past the cutoff and one whose reminder failed
//   is put back behind the cursor, so neither is read twice in a run.
// - A payout approved or held between its claim and its alert has the alert
//   stored already resolved; alertAdmin then sends no email and reports
//   storedResolved, which is neither reminded nor failed (MYK9-2456).
// - A reminder that was not saved, or whose email failed or was skipped (no
//   RESEND_API_KEY), is counted, its stamp is put
//   back so the next run tries again, and the run raises one alert with the count.
//
// Free of Deno and database imports; approvalReminderStore.ts is the database side.

import { escapeHtml, formatDollars } from '../_shared/clubMoneyEmails.ts';
import { alertWasEmailed, type RunAlertAdminResult } from '../_shared/alertAdminCore.ts';

/** Under a day, so a nightly run that starts a little earlier than yesterday's
 * still reminds; over half a day, so a manual re-run the same day does not. */
export const REMINDER_INTERVAL_HOURS = 20;
export const REMINDER_BATCH_SIZE = 50;
export const REMINDER_MAX_BATCHES = 20;

/** The trigger in the MYK9-2182 migration matches this exact key. */
export function awaitingApprovalDedupeKey(payoutId: string): string {
  return `payout-awaiting-approval-${payoutId}`;
}

/** Last reminded before this (or never) means a reminder is due. */
export function reminderCutoffIso(nowMs: number): string {
  return new Date(nowMs - REMINDER_INTERVAL_HOURS * 3600 * 1000).toISOString();
}

export interface WaitingPayout {
  id: string;
  showId: string;
  showName: string | null;
  amountCents: number;
  /** approval_reminded_at as listed; put back when the reminder fails. */
  remindedAt: string | null;
}

/** The shared alertAdmin's result. */
export type ReminderAlertResult = RunAlertAdminResult;

export type ReminderAlert = (
  subject: string,
  html: string,
  opts: { dedupeKey: string; severity: 'warn' | 'error' }
) => Promise<ReminderAlertResult>;

export type ReminderClaim = 'claimed' | 'gone' | 'error';

/** The last payout of a batch, by the stamp it was listed with. */
export interface ReminderCursor {
  remindedAt: string | null;
  id: string;
}

export interface ReminderDeps {
  /** Due payouts ordered by (remindedAt, never reminded first; id), strictly after
   * `after`, at most `limit`. null on a read error. */
  listDue(input: {
    cutoffIso: string;
    after: ReminderCursor | null;
    limit: number;
  }): Promise<WaitingPayout[] | null>;
  /** Stamp the payout reminded at `stampIso` if it is still waiting and due. */
  claim(
    payout: WaitingPayout,
    input: { cutoffIso: string; stampIso: string }
  ): Promise<ReminderClaim>;
  /** Put the listed stamp back if this run's stamp is still on it. */
  release(payout: WaitingPayout, stampIso: string): Promise<boolean>;
  alertAdmin: ReminderAlert;
  siteUrl: string | undefined;
}

export interface ReminderOutcome {
  reminded: number;
  /** Reminders claimed or due that could not be sent. */
  failed: number;
  /** The due payouts could not be read, so how many were missed is unknown. */
  listFailed: boolean;
  /** The batch limit was reached; the rest stay due for the next run. */
  deferred: boolean;
}

function payoutsLink(siteUrl: string | undefined): string {
  if (!siteUrl) return 'on the Payouts page in admin';
  const url = `${siteUrl.replace(/\/+$/, '')}/admin/payouts`;
  return `on the <a href="${escapeHtml(url)}">Payouts page</a>`;
}

export function awaitingApprovalAlert(
  payout: WaitingPayout,
  siteUrl: string | undefined
): { subject: string; html: string } {
  // The subject is plain text; the show name is the club's own text, so the
  // HTML body escapes it.
  const show = payout.showName ?? payout.showId;
  return {
    subject: `Payout waiting for your approval: ${show}`,
    html: `<p>The ${formatDollars(payout.amountCents)} payout for
      <strong>${escapeHtml(show)}</strong> (show <code>${escapeHtml(payout.showId)}</code>,
      payout <code>${escapeHtml(payout.id)}</code>) is waiting for your approval. Nothing is
      sent to the club until you approve it.</p>
      <p>Approve or hold it ${payoutsLink(siteUrl)}. This reminder comes once a day until you
      do. The amount follows any refunds and is worked out again when the payout is sent.</p>`,
  };
}

/** A reminder counts only when its alert was saved and its email really went out:
 * a skipped send (no RESEND_API_KEY) is a failure too, so it is retried next run. */
function reminderFailed(result: ReminderAlertResult): boolean {
  return !alertWasEmailed(result);
}

/** Remind the operator about each waiting payout that is due. Never throws on a store error. */
export async function remindAwaitingApprovals(
  deps: ReminderDeps,
  nowMs: number,
  limits: { batchSize: number; maxBatches: number } = {
    batchSize: REMINDER_BATCH_SIZE,
    maxBatches: REMINDER_MAX_BATCHES,
  }
): Promise<ReminderOutcome> {
  const cutoffIso = reminderCutoffIso(nowMs);
  const stampIso = new Date(nowMs).toISOString();
  const outcome: ReminderOutcome = { reminded: 0, failed: 0, listFailed: false, deferred: false };
  let after: ReminderCursor | null = null;

  for (let batch = 0; batch < limits.maxBatches; batch++) {
    const due = await deps.listDue({ cutoffIso, after, limit: limits.batchSize });
    if (!due) {
      outcome.listFailed = true;
      return outcome;
    }
    for (const payout of due) {
      const claim = await deps.claim(payout, { cutoffIso, stampIso });
      if (claim === 'gone') continue; // approved, held or reminded by another run
      if (claim === 'error') {
        outcome.failed++;
        continue;
      }
      const { subject, html } = awaitingApprovalAlert(payout, deps.siteUrl);
      const result = await deps.alertAdmin(subject, html, {
        dedupeKey: awaitingApprovalDedupeKey(payout.id),
        severity: 'warn',
      });
      // Approved or held between the claim and the alert: the trigger stored the
      // alert already resolved and no email went out. Nothing to send or retry,
      // so the stamp stays (MYK9-2456).
      if (result.storedResolved) continue;
      if (reminderFailed(result)) {
        outcome.failed++;
        if (!(await deps.release(payout, stampIso))) {
          console.error(`Payout ${payout.id}: reminder failed and its stamp could not be put back`);
        }
      } else {
        outcome.reminded++;
      }
    }
    if (due.length < limits.batchSize) return outcome;
    const last = due[due.length - 1];
    after = { remindedAt: last.remindedAt, id: last.id };
  }
  outcome.deferred = true;
  return outcome;
}

/** One alert for the run when any reminder could not be sent; nothing otherwise. */
export async function reportReminderFailures(
  deps: Pick<ReminderDeps, 'alertAdmin' | 'siteUrl'>,
  outcome: ReminderOutcome
): Promise<void> {
  if (outcome.failed === 0 && !outcome.listFailed) return;
  const what = outcome.listFailed
    ? `<p>The payout run could not read which payouts are waiting for approval, so no
       reminder went out for them${outcome.reminded > 0 ? ' past the ones already sent' : ''}.</p>`
    : '';
  const noun = outcome.failed === 1 ? 'reminder' : 'reminders';
  const count =
    outcome.failed > 0
      ? `<p>${outcome.failed} ${noun} for payouts waiting for approval could not be sent this run.
         A reminder counts as not sent when its alert could not be saved or its email failed or
         was skipped, for example when RESEND_API_KEY is not set.</p>`
      : '';
  await deps.alertAdmin(
    'Payout approval reminders could not be sent',
    `${what}${count}
     <p>Nothing was paid: those payouts still wait for approval. Check them
     ${payoutsLink(deps.siteUrl)}. The next run tries the reminders again; if this repeats,
     read the cron-process-payouts logs.</p>`,
    { dedupeKey: 'payout-approval-reminders-failed', severity: 'error' }
  );
}

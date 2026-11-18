// One show's payout: the decision flow of cron-process-payouts, with every
// database, Stripe, lock and email call injected so processShow.test.ts can
// drive it end to end and watch the Stripe calls (MYK9-2170). index.ts wires
// the real clients. The money-safety rules are unchanged from before the
// split; see index.ts's header for them.
//
// MYK9-2170 payout brake:
// - Where the run would send, a payout that is not approved is recorded as
//   'awaiting_approval' instead (unless the brake is off).
// - An approved payout is sent only to the destination it was approved for and
//   for no more than it was approved for; otherwise it goes back for approval.
// - The claim itself re-reads the brake (claim_show_payout_for_send), so a
//   brake switched on mid-run stops every transfer not yet claimed.
// - Before a show with a failed attempt is queued for approval, Stripe is
//   asked whether that attempt's transfer went out after all; if it did, it is
//   recorded, not queued.
// - A held payout only has its amount refreshed.

import {
  approvalMismatch,
  approvalOnRow,
  carriedApprovalFrom,
  sendOrWait,
  shouldEvaluateShow,
  type PayoutApproval,
} from '../_shared/payoutApproval.ts';
import { escapeHtml } from '../_shared/clubMoneyEmails.ts';
import { transferFailureOutcome, type PayoutFailureOwner } from '../_shared/payoutFailureOwner.ts';
import type { ShowMoneyLock } from '../_shared/showMoneyLock.ts';
import type { ClubStripeAccount, LivePayoutRow, PayoutStore } from './payoutStore.ts';
import { dollars, type EligibleShow } from './runSupport.ts';

export type AlertSeverity = 'info' | 'warn' | 'error';
export type Alert = (
  subject: string,
  html: string,
  opts?: { dedupeKey?: string; severity?: AlertSeverity }
) => Promise<unknown>;

export interface StripeTransfers {
  list(params: {
    transfer_group: string;
    limit: number;
  }): Promise<{ data: Array<{ id: string; amount: number }> }>;
  create(
    params: {
      amount: number;
      currency: string;
      destination: string;
      transfer_group: string;
      metadata: Record<string, string>;
    },
    options: { idempotencyKey: string }
  ): Promise<{ id: string }>;
}

export interface ClubRef {
  id: string;
  name: string;
  email: string | null;
}

export interface ClubNotices {
  cannotReceiveYet(input: {
    club: ClubRef;
    show: EligibleShow;
    amountCents: number;
    accountOnboarded: boolean;
  }): Promise<void>;
  payoutSent(input: { club: ClubRef; show: EligibleShow; amountCents: number }): Promise<void>;
  transferFailed(input: {
    club: ClubRef;
    show: EligibleShow;
    amountCents: number;
    failedRowId: string;
    owner: PayoutFailureOwner;
  }): Promise<void>;
}

export interface ProcessShowDeps {
  store: PayoutStore;
  transfers: StripeTransfers;
  stripeLivemode: boolean;
  /** The brake as read at the start of the run; the claim re-reads it. */
  brakeOn: boolean;
  alert: Alert;
  acquireLock: (showId: string) => Promise<ShowMoneyLock>;
  notices: ClubNotices;
}

export type RunSummary = Record<string, number>;

function bump(summary: RunSummary, key: string) {
  summary[key] = (summary[key] ?? 0) + 1;
}

/** Report a payout the run could not put in the approval queue. */
async function reportQueueError(deps: ProcessShowDeps, show: EligibleShow, what: string) {
  await deps.alert(
    `Payout could not be queued for approval: ${show.name}`,
    `<p>The payout run could not ${what} for <strong>${escapeHtml(show.name)}</strong>
     (show <code>${show.id}</code>). Nothing was sent. The next run tries again; check the
     function logs if this repeats.</p>`,
    { dedupeKey: `payout-queue-error-${show.id}`, severity: 'error' }
  );
}

/** An approved payout whose destination or amount changed goes back for approval. */
async function reopen(
  deps: ProcessShowDeps,
  summary: RunSummary,
  show: EligibleShow,
  input: {
    rowId: string;
    fromStatus: 'approved' | 'processing';
    amountCents: number;
    accountId: string;
    reason: string;
  }
) {
  const result = await deps.store.reopenApproval(input);
  if (result === 'error') {
    bump(summary, 'approval_queue_errors');
    await reportQueueError(deps, show, 'send an approved payout back for approval');
    return;
  }
  if (result === 'raced') return;
  bump(summary, 'approval_reopened');
  await deps.alert(
    `Payout needs approving again: ${show.name}`,
    `<p>The approved payout for <strong>${escapeHtml(show.name)}</strong> (show
     <code>${show.id}</code>) was not sent: ${escapeHtml(input.reason)}. It is waiting
     for approval again at ${dollars(input.amountCents)}.</p>`,
    { dedupeKey: `payout-approval-reopened-${input.rowId}`, severity: 'warn' }
  );
}

/**
 * Before queueing a show whose latest attempt failed: did that attempt's
 * transfer go out after all (a lost Stripe response, a crash after sending)?
 * If so, record it as completed and return true. Under the money lock, like
 * every other look at the show's transfers. A busy lock also returns true:
 * the show is left for the next run.
 */
async function reconcileBeforeQueueing(
  deps: ProcessShowDeps,
  summary: RunSummary,
  show: EligibleShow,
  live: LivePayoutRow | null,
  account: ClubStripeAccount,
  amountCents: number
): Promise<boolean> {
  const lock = await deps.acquireLock(show.id);
  if (!lock.ok) {
    bump(summary, 'money_lock_busy');
    return true;
  }
  try {
    const existing = await deps.transfers.list({ transfer_group: show.id, limit: 1 });
    const prior = existing.data[0];
    if (!prior) return false;
    if (live) {
      await deps.store.markCompleted(live.id, { transferId: prior.id, amountCents: prior.amount });
    } else {
      const written = await deps.store.insertReconciledCompleted({
        showId: show.id,
        accountId: account.id,
        amountCents: prior.amount,
        transferId: prior.id,
      });
      if (written === 'error') {
        bump(summary, 'approval_queue_errors');
        await reportQueueError(
          deps,
          show,
          `record transfer ${prior.id}, which Stripe already made`
        );
        return true;
      }
    }
    bump(summary, 'completed');
    await deps.alert(
      `Payout found already sent: ${show.name}`,
      `<p>Show <code>${show.id}</code>'s last payout attempt failed, but Stripe shows transfer
       <code>${prior.id}</code> for ${dollars(prior.amount)} went out. It is recorded as paid
       and was not queued for approval. Today's recalculation says ${dollars(amountCents)} is
       owed; if that differs, check the transfer in the Stripe dashboard.</p>`,
      { dedupeKey: `payout-reconciled-before-queue-${show.id}`, severity: 'warn' }
    );
    return true;
  } catch (err) {
    // Cannot tell whether money already went out: queue nothing this run.
    console.error(`Transfer lookup failed for show ${show.id}:`, err);
    bump(summary, 'failed');
    return true;
  } finally {
    await lock.release();
  }
}

export async function processShow(
  deps: ProcessShowDeps,
  show: EligibleShow,
  summary: RunSummary
): Promise<void> {
  const { store } = deps;
  // Existing live row decides the path: completed/processing → done elsewhere;
  // pending/awaiting_approval/approved/held → reuse the row (recompute); none →
  // create. Checked BEFORE the entries fetch: eligibility is date-driven, so
  // every settled show stays eligible forever, and without this early exit
  // each historical show would re-pay the full entries query nightly.
  const live = await store.loadLiveRow(show.id);
  if (live === 'error') return;
  if (live && !shouldEvaluateShow(live.status)) return;

  // Recompute the amount from entries at this moment; never trust stored
  // figures. This PRE-claim figure only decides routing; the amount actually
  // transferred is recomputed again after the claim, when validateRefund's
  // payout_in_progress check is already rejecting new refunds.
  const amountCents = await store.computePayoutCents(show.id);
  if (amountCents === null) return;

  if (amountCents <= 0) {
    // A parked row whose show has since been fully refunded would otherwise
    // show the club money that will never arrive: close it out.
    if (live) await store.closeOutZero(live.id, live.status);
    bump(summary, 'skipped_no_online_money');
    return;
  }

  // Held: keep the amount owed current, nothing else (MYK9-2170).
  if (live?.status === 'held') {
    if (live.amount_cents !== amountCents) {
      await store.updateLiveAmount(live.id, 'held', amountCents);
    }
    bump(summary, 'held');
    return;
  }

  if (!show.club_id) {
    console.error(`Show ${show.id} has no club, cannot pay out`);
    return;
  }

  const accounts = await store.loadAccounts(show.club_id);
  const account = accounts.find(row => row.livemode === deps.stripeLivemode);
  const mismatchedAccount = accounts.find(row => row.livemode !== deps.stripeLivemode);
  const clubRow = await store.loadClub(show.club_id);
  const club: ClubRef | null = clubRow ? { id: show.club_id, ...clubRow } : null;

  if (!account && mismatchedAccount) {
    bump(summary, 'mode_mismatch');
    await deps.alert(
      `Payout skipped for Stripe mode mismatch: ${show.name}`,
      `<p>Show <code>${show.id}</code> has payable online money, but club
       <code>${show.club_id}</code> only has a ${
         mismatchedAccount.livemode ? 'live' : 'test'
       } Stripe account row while cron is running with a ${
         deps.stripeLivemode ? 'live' : 'test'
       } key.</p>
       <p>No transfer was attempted. Recovery: complete Connect onboarding in the
       matching Stripe mode or rotate the function secret back to the intended mode.</p>`,
      { dedupeKey: `payout-mode-mismatch-${show.id}` }
    );
    return;
  }

  // Club can't receive money yet: park (or keep) a pending row; nudge only on creation.
  if (!account?.payouts_enabled) {
    if (live) {
      await store.updateLiveAmount(live.id, live.status, amountCents);
    } else if ((await store.insertPending(show.id, account?.id ?? null, amountCents)) && club) {
      // An onboarded account with payouts off needs fixing, not connecting (MYK9-1986).
      await deps.notices.cannotReceiveYet({
        club,
        show,
        amountCents,
        accountOnboarded: !!account?.onboarding_complete,
      });
    }
    bump(summary, 'pending_not_onboarded');
    return;
  }

  // MYK9-2170 payout brake. The approval this send would rest on: the live
  // row's own, or (no live row, brake on) the latest failed attempt's when it
  // failed for a self-healing reason.
  const latest = !live && deps.brakeOn ? await store.loadLatestAttempt(show.id) : null;
  const transferFacts = { amountCents, stripeAccountId: account.stripe_account_id };
  let approval: PayoutApproval | null = null;
  if (live?.status === 'approved') {
    approval = approvalOnRow(live);
    const mismatch = approval
      ? approvalMismatch(approval, transferFacts)
      : 'the approval record is incomplete';
    if (mismatch) {
      await reopen(deps, summary, show, {
        rowId: live.id,
        fromStatus: 'approved',
        amountCents,
        accountId: account.id,
        reason: mismatch,
      });
      return;
    }
  } else {
    const carried = carriedApprovalFrom(latest);
    // A carried approval for another destination or a smaller amount does not
    // carry: the retry waits for a new approval.
    approval = carried && !approvalMismatch(carried, transferFacts) ? carried : null;
  }

  const decision = sendOrWait({
    brakeOn: deps.brakeOn,
    liveStatus: live?.status ?? null,
    carriedApprovalAt: live ? null : (approval?.approvedAt ?? null),
  });
  if (decision === 'wait_for_approval') {
    if (latest?.status === 'failed') {
      const settled = await reconcileBeforeQueueing(
        deps,
        summary,
        show,
        live,
        account,
        amountCents
      );
      if (settled) return;
    }
    const liveRef = live ? { id: live.id, status: live.status } : null;
    const written = await store.recordAwaitingApproval({
      liveRow: liveRef,
      showId: show.id,
      accountId: account.id,
      amountCents,
    });
    if (written === 'recorded') bump(summary, 'awaiting_approval');
    if (written === 'error') {
      bump(summary, 'approval_queue_errors');
      await reportQueueError(deps, show, 'record the payout as waiting for approval');
    }
    return;
  }

  const moneyLock = await deps.acquireLock(show.id);
  if (!moneyLock.ok) {
    bump(summary, 'money_lock_busy');
    console.log(`Skipping show ${show.id}: money lock ${moneyLock.reason}`);
    return;
  }

  let rowId: string | null = null;
  try {
    // Claim (claim_show_payout_for_send): the live row or a new row →
    // processing, refused when the brake is now on and this payout is not
    // approved for this destination and amount, or another run owns the show.
    const claimed = await store.claimForSend({
      showId: show.id,
      liveRow: live ? { id: live.id, status: live.status } : null,
      accountId: account.id,
      destination: account.stripe_account_id,
      amountCents,
      carried: live ? null : approval,
    });
    if (claimed === 'error') {
      bump(summary, 'claim_errors');
      return;
    }
    if (claimed === null) {
      bump(summary, 'claim_refused');
      console.log(`Skipping show ${show.id}: claim refused (raced, or the brake is on)`);
      return;
    }
    rowId = claimed;

    // Authoritative amount: recomputed AFTER the claim. From the moment the
    // row is 'processing', validateRefund rejects new refunds
    // (payout_in_progress), so a refund committed between the routing
    // computation above and the claim is caught here instead of overpaying
    // the club.
    const finalAmountCents = await store.computePayoutCents(show.id);
    if (finalAmountCents === null) {
      // Can't verify the amount: release the claim for tomorrow's run.
      await store.markFailed(rowId, 'entries_load_failed_post_claim');
      bump(summary, 'failed');
      return;
    }
    if (finalAmountCents <= 0) {
      // Fully refunded since routing: nothing to send, close the row out.
      await store.markCompleted(rowId, { transferId: null, amountCents: 0 });
      bump(summary, 'skipped_no_online_money');
      return;
    }
    if (approval && finalAmountCents > approval.amountCents) {
      await reopen(deps, summary, show, {
        rowId,
        fromStatus: 'processing',
        amountCents: finalAmountCents,
        accountId: account.id,
        reason: `the amount rose from ${dollars(approval.amountCents)} to ${dollars(finalAmountCents)} since approval`,
      });
      return;
    }
    if (finalAmountCents !== amountCents) {
      await store.setAmount(rowId, finalAmountCents);
    }

    // Double-pay guard (PR #625 HIGH finding): a row stuck in 'processing'
    // usually means the run crashed AFTER the transfer succeeded, and Stripe
    // idempotency keys expire (~24h) BEFORE the stale recovery fires, so the
    // key alone cannot prevent a re-send. Ask Stripe directly: at most one
    // transfer per show, ever (transfer_group = show id).
    const existing = await deps.transfers.list({ transfer_group: show.id, limit: 1 });
    if (existing.data.length > 0) {
      const priorTransfer = existing.data[0];
      await store.markCompleted(rowId, { transferId: priorTransfer.id });
      bump(summary, 'completed');
      console.log(`Reconciled existing transfer ${priorTransfer.id} for show ${show.id}`);
      if (priorTransfer.amount !== finalAmountCents) {
        // A refund that landed during the crash window means the club already
        // received more than today's recompute says it is owed (round-11
        // review). Reconciling silently would hide the discrepancy.
        await deps.alert(
          `Reconciled payout amount mismatch: ${show.name}`,
          `<p>Show <code>${show.id}</code> was reconciled to existing transfer
           <code>${priorTransfer.id}</code> for ${dollars(priorTransfer.amount)}, but
           today's recompute from entries says ${dollars(finalAmountCents)} is owed.</p>
           <p>Most likely a refund landed after the original transfer was sent. If the
           club was overpaid, recover the difference with a transfer reversal from the
           Stripe dashboard (Connect → Transfers → ${priorTransfer.id} → Reverse).</p>`,
          { dedupeKey: `payout-reconcile-mismatch-${show.id}` }
        );
      }
      return;
    }

    const transfer = await deps.transfers.create(
      {
        amount: finalAmountCents,
        currency: 'usd',
        destination: account.stripe_account_id,
        transfer_group: show.id,
        metadata: { show_id: show.id, show_name: show.name },
      },
      // Per-ROW key, not per-show: Stripe caches the first response for a key
      // (including failures) for ~24h. A per-show key replayed the original
      // insufficient_balance error on every same-day retry even after funds
      // arrived (2026-06-10 walkthrough). Each retry creates a fresh row, so
      // a fresh key; the transfers.list(transfer_group) guard above remains
      // the at-most-one-transfer-per-show authority.
      { idempotencyKey: `show-payout-row-${rowId}` }
    );

    await store.markCompleted(rowId, { transferId: transfer.id });
    bump(summary, 'completed');
    console.log(`Paid out ${dollars(finalAmountCents)} for show ${show.id} (${transfer.id})`);

    if (club) await deps.notices.payoutSent({ club, show, amountCents: finalAmountCents });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown Stripe error';
    const benign = /insufficient.*balance|balance.*insufficient/i.test(reason);
    // MYK9-1986: whose failure this is; only the club's own emails the club, once per episode.
    const { owner, failureReason } = transferFailureOutcome(err, reason, benign);
    if (rowId) {
      await store.markFailed(rowId, failureReason);
      if (club) {
        await deps.notices.transferFailed({ club, show, amountCents, failedRowId: rowId, owner });
      }
    }
    bump(summary, 'failed');
    console.error(`Transfer failed for show ${show.id}: ${reason}`);
    await deps.alert(
      benign ? `Payout deferred (benign): ${show.name}` : `Payout FAILED: ${show.name}`,
      `<p>Transfer of ${dollars(amountCents)} for <strong>${show.name}</strong> failed:</p>
       <pre>${reason}</pre>
       ${
         benign
           ? '<p>This is the expected card-clearing delay — show-day payments take ~2 business days to become available. Tomorrow’s run retries automatically; no action needed.</p>'
           : '<p>This will retry tomorrow, but a non-balance failure usually needs a look: check the show_payouts row and the Stripe dashboard.</p>'
       }`,
      {
        dedupeKey: benign
          ? `payout-insufficient-balance-${show.id}`
          : `payout-transfer-failed-${show.id}`,
      }
    );
  } finally {
    await moneyLock.release();
  }
}

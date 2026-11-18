// The payout run's per-show flow, moved out of index.ts (MYK9-2170) so it can
// be tested with the Stripe transfer calls observed. index.ts builds the deps;
// the money-safety notes for this flow are at the top of index.ts.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { calculateShowPayoutCents } from '../_shared/payoutCalc.ts';
import type { ShowMoneyLock } from '../_shared/showMoneyLock.ts';
import {
  bankNeedsAttentionEmail,
  clubPaymentsUrl,
  connectAccountEmail,
  escapeHtml,
  payoutSentEmail,
} from '../_shared/clubMoneyEmails.ts';
import {
  emailClub,
  loadPreviousPayoutAttempt,
  notifyClubOfTransferFailure,
  type ClubNoticeDeps,
} from '../_shared/payoutClubNotices.ts';
import { transferFailureOutcome } from '../_shared/payoutFailureOwner.ts';
import { claimShowPayoutForSend, exceedsApproval } from '../_shared/payoutSendClaim.ts';

// Live rows the run still works on. 'held' is included so its amount stays
// current (the claim refreshes it and keeps the hold, MYK9-2170); 'processing'
// and 'completed' are another run's or done.
const WORKABLE_LIVE_STATUSES = ['pending', 'awaiting_approval', 'approved', 'held'];

export interface EligibleShow {
  id: string;
  name: string;
  club_id: string | null;
  end_date: string;
}

interface ClubStripeAccount {
  id: string;
  stripe_account_id: string;
  payouts_enabled: boolean;
  onboarding_complete: boolean;
  livemode: boolean;
}

/** The two Stripe calls this flow makes. */
export interface StripeTransfers {
  transfers: {
    list(params: {
      transfer_group: string;
      limit: number;
    }): PromiseLike<{ data: Array<{ id: string; amount: number }> }>;
    create(
      params: {
        amount: number;
        currency: string;
        destination: string;
        transfer_group: string;
        metadata: Record<string, string>;
      },
      options: { idempotencyKey: string }
    ): PromiseLike<{ id: string }>;
  };
}

export interface ProcessShowDeps {
  supabase: SupabaseClient;
  stripe: StripeTransfers;
  stripeLivemode: boolean;
  /** platform_settings.payouts_require_approval, read once per run (alert copy only). */
  brakeOn: boolean;
  alertAdmin: (subject: string, html: string, opts?: { dedupeKey?: string }) => Promise<unknown>;
  clubNoticeDeps: (clubId: string, contactEmail: string | null | undefined) => ClubNoticeDeps;
  acquireMoneyLock: (showId: string) => Promise<ShowMoneyLock>;
  siteUrl: string | undefined;
}

const WAITS_AGAIN =
  'The next run recalculates this payout and it waits for approval again; nothing is sent until a site admin approves it.';

/**
 * What happens after a failed attempt, true in both brake modes: with the
 * brake on, the retry row is recalculated and waits for approval again.
 */
export function payoutRetryNote(
  kind: 'balance_delay' | 'transfer_failed' | 'stale_processing',
  brakeOn: boolean
): string {
  if (kind === 'balance_delay') {
    const delay =
      'This is the expected card-clearing delay. Show-day payments take ~2 business days to become available.';
    return brakeOn
      ? `<p>${delay} ${WAITS_AGAIN}</p>`
      : `<p>${delay} Tomorrow’s run retries automatically; no action needed.</p>`;
  }
  if (kind === 'transfer_failed') {
    const look =
      'A non-balance failure usually needs a look: check the show_payouts row and the Stripe dashboard.';
    return brakeOn
      ? `<p>${WAITS_AGAIN} ${look}</p>`
      : '<p>This will retry tomorrow, but a non-balance failure usually needs a look: check the show_payouts row and the Stripe dashboard.</p>';
  }
  const reconcile =
    'checks Stripe for an existing transfer for this show (transfer_group) and reconciles instead of paying twice.';
  return brakeOn
    ? `<p>${WAITS_AGAIN} Before any send, the run ${reconcile}</p>`
    : `<p>Before re-sending, the next run ${reconcile} No action needed unless it recurs.</p>`;
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Sum the show's payable online entry money from entries, in cents.
 * Returns null on a load error (caller skips the show this run).
 * Paginated: PostgREST caps responses at max_rows (1000, config.toml) — an
 * unpaginated select would silently TRUNCATE a big show's entries and
 * underpay the club with no error (round-11 review). */
async function computePayoutCents(
  supabase: SupabaseClient,
  showId: string
): Promise<number | null> {
  const PAGE = 1000;
  let totalCents = 0;
  for (let from = 0; ; from += PAGE) {
    const { data: entries, error } = await supabase
      .from('entries')
      .select('entry_fee, payment_method, payment_status, refund_amount')
      .eq('show_id', showId)
      .order('id')
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`Entries load failed for show ${showId}:`, error);
      return null;
    }
    totalCents += calculateShowPayoutCents(entries ?? []);
    if ((entries?.length ?? 0) < PAGE) break;
  }
  return totalCents;
}

export async function processShow(
  show: EligibleShow,
  summary: Record<string, number>,
  deps: ProcessShowDeps
): Promise<void> {
  const { supabase, stripe, stripeLivemode, alertAdmin, clubNoticeDeps, siteUrl } = deps;
  // Existing live row decides the path: completed/processing → done elsewhere,
  // pending → reuse the row (recompute), none → create. Checked BEFORE the
  // entries fetch: eligibility is date-driven, so every settled show stays
  // eligible forever — without this early exit each historical show would
  // re-pay the full entries query nightly, unbounded (review finding #2).
  const { data: liveRow } = await supabase
    .from('show_payouts')
    .select('id, status')
    .eq('show_id', show.id)
    .neq('status', 'failed')
    .maybeSingle();

  if (liveRow && !WORKABLE_LIVE_STATUSES.includes(liveRow.status)) {
    return; // completed, in flight, or held
  }

  // Recompute the amount from entries at this moment — never trust stored
  // figures. This PRE-claim figure only decides routing (skip / park /
  // proceed); the amount actually transferred is recomputed again after the
  // claim below, when validateRefund's payout_in_progress check is already
  // rejecting new refunds.
  const amountCents = await computePayoutCents(supabase, show.id);
  if (amountCents === null) return;

  if (amountCents <= 0) {
    if (liveRow) {
      // A parked pending row whose show has since been fully refunded would
      // otherwise show the club money that will never arrive — close it out.
      await supabase
        .from('show_payouts')
        .update({ amount_cents: 0, status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', liveRow.id)
        .in('status', WORKABLE_LIVE_STATUSES);
    }
    summary.skipped_no_online_money++;
    return;
  }

  if (!show.club_id) {
    console.error(`Show ${show.id} has no club — cannot pay out`);
    return;
  }
  const clubId = show.club_id;

  const { data: accounts } = await supabase
    .from('club_stripe_accounts')
    .select('id, stripe_account_id, payouts_enabled, onboarding_complete, livemode')
    .eq('club_id', show.club_id)
    .limit(2);
  const account = ((accounts ?? []) as ClubStripeAccount[]).find(
    row => row.livemode === stripeLivemode
  );
  const mismatchedAccount = ((accounts ?? []) as ClubStripeAccount[]).find(
    row => row.livemode !== stripeLivemode
  );

  const { data: club } = await supabase
    .from('clubs')
    .select('name, email')
    .eq('id', show.club_id)
    .single();

  if (!account && mismatchedAccount) {
    summary.mode_mismatch++;
    await alertAdmin(
      `Payout skipped for Stripe mode mismatch: ${show.name}`,
      `<p>Show <code>${show.id}</code> has payable online money, but club
       <code>${show.club_id}</code> only has a ${
         mismatchedAccount.livemode ? 'live' : 'test'
       } Stripe account row while cron is running with a ${
         stripeLivemode ? 'live' : 'test'
       } key.</p>
       <p>No transfer was attempted. Recovery: complete Connect onboarding in the
       matching Stripe mode or rotate the function secret back to the intended mode.</p>`,
      { dedupeKey: `payout-mode-mismatch-${show.id}` }
    );
    return;
  }

  // Club can't receive money yet: park (or keep) a pending row; nudge only on creation.
  if (!account?.payouts_enabled) {
    if (liveRow) {
      await supabase
        .from('show_payouts')
        .update({ amount_cents: amountCents })
        .eq('id', liveRow.id);
    } else {
      const { error: insertError } = await supabase.from('show_payouts').insert({
        show_id: show.id,
        club_stripe_account_id: account?.id ?? null,
        amount_cents: amountCents,
        status: 'pending',
        scheduled_date: new Date().toISOString().slice(0, 10),
      });
      if (!insertError && club) {
        // An onboarded account with payouts off needs fixing, not connecting (MYK9-1986).
        const notice = account?.onboarding_complete ? bankNeedsAttentionEmail : connectAccountEmail;
        await emailClub(
          clubNoticeDeps(clubId, club.email),
          notice({
            clubName: club.name,
            showName: show.name,
            amountCents,
            paymentsUrl: clubPaymentsUrl(siteUrl, clubId),
          })
        );
      }
    }
    summary.pending_not_onboarded++;
    return;
  }

  const moneyLock = await deps.acquireMoneyLock(show.id);
  if (!moneyLock.ok) {
    summary.money_lock_busy++;
    console.log(`Skipping show ${show.id}: money lock ${moneyLock.reason}`);
    return;
  }

  let rowId: string | null = null;
  try {
    // Claim through the brake (MYK9-2170): with it on, this records the payout
    // as awaiting_approval and sends nothing; only an approved row (or, with it
    // off, a pending or new one) comes back 'claimed', now 'processing'.
    const claim = await claimShowPayoutForSend(supabase, {
      showId: show.id,
      accountId: account.id,
      destination: account.stripe_account_id,
      amountCents,
    });
    if (!claim) {
      // Nothing sends, but the run must not read as clean: counted and alerted
      // like a failed transfer (MYK9-2170).
      summary.claim_errors++;
      console.error(`Payout claim failed for show ${show.id}; nothing sent`);
      await alertAdmin(
        `Payout could not be checked: ${show.name}`,
        `<p>The payout run could not record or claim the ${dollars(amountCents)} payout for
         <strong>${escapeHtml(show.name)}</strong> (show <code>${show.id}</code>). Nothing was sent.</p>
         <p>The next run tries again. If this repeats, check that claim_show_payout_for_send
         exists in the database and read the cron-process-payouts logs.</p>`,
        { dedupeKey: `payout-claim-error-${show.id}` }
      );
      return;
    }
    if (claim.outcome !== 'claimed' || !claim.payoutId) {
      if (claim.outcome === 'awaiting_approval' || claim.outcome === 'approval_reset') {
        summary.awaiting_approval++;
      }
      console.log(`Show ${show.id}: payout not sent (${claim.outcome})`);
      return;
    }
    rowId = claim.payoutId;

    // Authoritative amount: recomputed AFTER the claim. From the moment the
    // row is 'processing', validateRefund rejects new refunds
    // (payout_in_progress), so a refund committed between the routing
    // computation above and the claim is caught here instead of overpaying
    // the club. (A refund whose validation read 'pending' just before our
    // claim and whose stamp lands after this read can still slip through —
    // that residual window is the duration of one Stripe refund call,
    // accepted for v1.)
    const finalAmountCents = await computePayoutCents(supabase, show.id);
    if (finalAmountCents === null) {
      // Can't verify the amount — release the claim for tomorrow's run.
      await supabase
        .from('show_payouts')
        .update({ status: 'failed', failure_reason: 'entries_load_failed_post_claim' })
        .eq('id', rowId);
      summary.failed++;
      return;
    }
    if (finalAmountCents <= 0) {
      // Fully refunded since routing: nothing to send, close the row out.
      await supabase
        .from('show_payouts')
        .update({ amount_cents: 0, status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', rowId);
      summary.skipped_no_online_money++;
      return;
    }
    if (exceedsApproval(claim, finalAmountCents)) {
      // More than was approved: nothing sends; it waits for a new approval.
      const { error: resetError } = await supabase
        .from('show_payouts')
        .update({
          status: 'awaiting_approval',
          amount_cents: finalAmountCents,
          approved_at: null,
          approved_by: null,
          approved_amount_cents: null,
          approved_stripe_account_id: null,
          approval_reset_reason: `The amount rose to ${finalAmountCents} cents after approval`,
        })
        .eq('id', rowId)
        .eq('status', 'processing');
      if (resetError) {
        // Nothing was sent either way; the row stays 'processing' until the
        // stale-processing recovery fails it and the next run asks again.
        console.error(`Approval reset failed for payout ${rowId}; nothing sent`, resetError);
      }
      summary.awaiting_approval++;
      return;
    }
    if (finalAmountCents !== amountCents) {
      await supabase
        .from('show_payouts')
        .update({ amount_cents: finalAmountCents })
        .eq('id', rowId);
    }

    // Double-pay guard (PR #625 HIGH finding): a row stuck in 'processing'
    // usually means the run crashed AFTER the transfer succeeded — and Stripe
    // idempotency keys expire (~24h) BEFORE the stale recovery fires, so the
    // key alone cannot prevent a re-send. Ask Stripe directly: at most one
    // transfer per show, ever (transfer_group = show id).
    const existing = await stripe.transfers.list({ transfer_group: show.id, limit: 1 });
    if (existing.data.length > 0) {
      const priorTransfer = existing.data[0];
      await supabase
        .from('show_payouts')
        .update({
          status: 'completed',
          stripe_transfer_id: priorTransfer.id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', rowId);
      summary.completed++;
      console.log(
        `Reconciled existing transfer ${priorTransfer.id} for show ${show.id} — no new transfer sent`
      );
      if (priorTransfer.amount !== finalAmountCents) {
        // A refund that landed during the crash window means the club already
        // received more than today's recompute says it is owed (round-11
        // review). Reconciling silently would hide the discrepancy.
        await alertAdmin(
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

    const transfer = await stripe.transfers.create(
      {
        amount: finalAmountCents,
        currency: 'usd',
        destination: account.stripe_account_id,
        transfer_group: show.id,
        metadata: { show_id: show.id, show_name: show.name },
      },
      // Per-ROW key, not per-show: Stripe caches the first response for a key
      // — including failures — for ~24h. A per-show key replayed the original
      // insufficient_balance error on every same-day retry even after funds
      // arrived (2026-06-10 walkthrough). Each retry creates a fresh row, so
      // a fresh key; the transfers.list(transfer_group) guard above remains
      // the at-most-one-transfer-per-show authority.
      { idempotencyKey: `show-payout-row-${rowId}` }
    );

    await supabase
      .from('show_payouts')
      .update({
        status: 'completed',
        stripe_transfer_id: transfer.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', rowId);

    summary.completed++;
    console.log(`Paid out ${dollars(finalAmountCents)} for show ${show.id} (${transfer.id})`);

    if (club) {
      await emailClub(
        clubNoticeDeps(clubId, club.email),
        payoutSentEmail({ clubName: club.name, showName: show.name, amountCents: finalAmountCents })
      );
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown Stripe error';
    const benign = /insufficient.*balance|balance.*insufficient/i.test(reason);
    // MYK9-1986: whose failure this is; only the club's own emails the club, once per episode.
    const { owner, failureReason } = transferFailureOutcome(err, reason, benign);
    if (rowId) {
      const failedRowId = rowId;
      await supabase
        .from('show_payouts')
        .update({ status: 'failed', failure_reason: failureReason })
        .eq('id', failedRowId);
      if (club) {
        await notifyClubOfTransferFailure(clubNoticeDeps(clubId, club.email), {
          owner,
          clubName: club.name,
          showName: show.name,
          amountCents,
          paymentsUrl: clubPaymentsUrl(siteUrl, clubId),
          loadPreviousAttempt: () => loadPreviousPayoutAttempt(supabase, show.id, failedRowId),
        });
      }
    }
    summary.failed++;
    console.error(`Transfer failed for show ${show.id}: ${reason}`);
    await alertAdmin(
      benign ? `Payout deferred (benign): ${show.name}` : `Payout FAILED: ${show.name}`,
      `<p>Transfer of ${dollars(amountCents)} for <strong>${escapeHtml(show.name)}</strong> failed:</p>
       <pre>${escapeHtml(reason)}</pre>
       ${payoutRetryNote(benign ? 'balance_delay' : 'transfer_failed', deps.brakeOn)}`,
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

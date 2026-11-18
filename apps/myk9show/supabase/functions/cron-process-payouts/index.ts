// Daily payout run: transfer each closed show's online entry fees to the
// club's Stripe Express account, 3 days after the show ends.
//
// Money-safety properties (see docs/plans/2026-06-09-stripe-connect-implementation.md):
// - Caller auth via x-function-secret (pg_cron / manual curl), never JWT.
// - Stale 'processing' rows are failed for retry FIRST each run; the per-show
//   idempotency key makes the retry safe even if the original transfer
//   actually succeeded (Stripe returns the cached transfer for ~24h).
// - 'pending' rows (club not onboarded) are RECOMPUTED before sending —
//   refunds may have shrunk the amount since the row was created.
// - Per-show isolation: one show's failure never blocks the others.
// - Every 'failed' row alerts the platform admin by email.
// - Payout brake (MYK9-2170): every move into 'processing' goes through
//   claim_show_payout_for_send, which reads platform_settings
//   .payouts_require_approval in the same transaction. While it is on, the run
//   records the payout as 'awaiting_approval' and sends only rows a site admin
//   approved, never more than the approved amount nor to another account.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { calculateShowPayoutCents } from '../_shared/payoutCalc.ts';
import { isStripeLiveMode } from '../_shared/stripeMode.ts';
import { acquireShowMoneyLock } from '../_shared/showMoneyLock.ts';
import { alertAdmin as sharedAlertAdmin } from '../_shared/alertAdmin.ts';
import { loadClubMoneyRecipients } from '../_shared/clubMoneyRecipients.ts';
import {
  bankNeedsAttentionEmail,
  clubPaymentsUrl,
  connectAccountEmail,
  createResendSender,
  payoutSentEmail,
} from '../_shared/clubMoneyEmails.ts';
import {
  emailClub,
  loadPreviousPayoutAttempt,
  notifyClubOfTransferFailure,
} from '../_shared/payoutClubNotices.ts';
import { transferFailureOutcome } from '../_shared/payoutFailureOwner.ts';
import { claimShowPayoutForSend, exceedsApproval } from '../_shared/payoutSendClaim.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const cronSecret = Deno.env.get('PAYOUT_CRON_SECRET')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');

if (!supabaseUrl || !supabaseServiceKey || !stripeSecret || !cronSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'myK9Show', version: '1.0.0' },
});
const stripeLivemode = isStripeLiveMode(stripeSecret);

const PAYOUT_DELAY_DAYS = 3;
const STALE_PROCESSING_HOURS = 24;
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
// Live rows the run still works on. 'held' waits for a site admin; 'processing'
// and 'completed' are another run's or done.
const WORKABLE_LIVE_STATUSES = ['pending', 'awaiting_approval', 'approved'];

interface EligibleShow {
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

const sendEmail = createResendSender(resendApiKey, FROM_EMAIL);
const siteUrl = Deno.env.get('SITE_URL');

// MYK9-1986: every money email to a club goes to each active club admin and the
// club's contact address, one message per address.
function clubNoticeDeps(clubId: string, contactEmail: string | null | undefined) {
  return {
    loadRecipients: () => loadClubMoneyRecipients(supabase, clubId, contactEmail),
    send: sendEmail,
  };
}

// Wraps the shared, persist-then-email alertAdmin (MP-08) with this
// function's identity so operator_alerts.source reads 'cron-process-payouts'
// instead of the generic default. dedupeKey pairs with source against the
// DB's partial unique index so a persistent condition (e.g. a show's balance
// staying insufficient for days) updates nothing on re-runs instead of
// inserting a fresh unresolved row every day.
function alertAdmin(subject: string, html: string, opts: { dedupeKey?: string } = {}) {
  return sharedAlertAdmin(subject, html, {
    source: 'cron-process-payouts',
    dedupeKey: opts.dedupeKey,
  });
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Fail processing rows older than the stale threshold so the unique index
 * reopens for a retry row. Double-pay is prevented by the transfers.list
 * (transfer_group) check before any send, not by the idempotency key.
 * Staleness keys on updated_at (touched by the set_updated_at trigger on the
 * pending→processing claim) — created_at would false-flag a row that sat
 * pending for days before being claimed minutes ago (review finding #1). */
async function recoverStaleProcessing(summary: Record<string, number>) {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_HOURS * 3600 * 1000).toISOString();
  const { data: stale, error } = await supabase
    .from('show_payouts')
    .update({ status: 'failed', failure_reason: 'stale_processing' })
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
    .select('id, show_id, amount_cents');

  if (error) {
    console.error('Stale-processing recovery failed:', error);
    return;
  }
  for (const row of stale ?? []) {
    summary.stale_recovered++;
    console.error(`Stale processing payout ${row.id} (show ${row.show_id}) failed for retry`);
    await alertAdmin(
      'Stale payout recovered for retry',
      `<p>Payout row ${row.id} for show ${row.show_id} (${dollars(row.amount_cents)}) was stuck
       in 'processing' for over ${STALE_PROCESSING_HOURS}h and has been failed for automatic retry.
       Before re-sending, the next run checks Stripe for an existing transfer for this show
       (transfer_group) and reconciles instead of paying twice. No action needed unless it recurs.</p>`,
      { dedupeKey: `payout-stale-recovered-${row.id}` }
    );
  }
}

/** Sum the show's payable online entry money from entries, in cents.
 * Returns null on a load error (caller skips the show this run).
 * Paginated: PostgREST caps responses at max_rows (1000, config.toml) — an
 * unpaginated select would silently TRUNCATE a big show's entries and
 * underpay the club with no error (round-11 review). */
async function computePayoutCents(showId: string): Promise<number | null> {
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

async function processShow(show: EligibleShow, summary: Record<string, number>) {
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
  const amountCents = await computePayoutCents(show.id);
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

  const moneyLock = await acquireShowMoneyLock(supabase, show.id, {
    holder: 'cron-process-payouts',
    ttlMs: 15 * 60 * 1000,
  });
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
      console.error(`Payout claim failed for show ${show.id}; nothing sent`);
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
    const finalAmountCents = await computePayoutCents(show.id);
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

// Constant-time secret check: hash both sides so the comparison cost is
// independent of how many leading bytes match (SA-002).
async function secretMatches(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(cronSecret)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!(await secretMatches(req.headers.get('x-function-secret')))) {
    return new Response('Forbidden', { status: 403 });
  }

  const summary = {
    eligible_shows: 0,
    completed: 0,
    pending_not_onboarded: 0,
    failed: 0,
    skipped_no_online_money: 0,
    stale_recovered: 0,
    mode_mismatch: 0,
    money_lock_busy: 0,
    awaiting_approval: 0,
  };

  try {
    await recoverStaleProcessing(summary);

    const cutoff = new Date(Date.now() - PAYOUT_DELAY_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    // Date-driven eligibility: shows rarely get flipped to a terminal status,
    // so the trigger is end_date + 3 days, excluding only draft/cancelled.
    // Newest-first with an explicit cap: eligibility is permanent, so without
    // ordering PostgREST's max-rows would someday truncate ARBITRARY rows and
    // silently drop new shows. Ordered, the rows that fall off the end are the
    // oldest — long-settled shows whose live payout row makes processShow a
    // one-query no-op anyway.
    const { data: shows, error: showsError } = await supabase
      .from('shows')
      .select('id, name, club_id, end_date')
      .lte('end_date', cutoff)
      .not('status', 'in', '("draft","cancelled")')
      .order('end_date', { ascending: false })
      .limit(1000);

    if (showsError) {
      console.error('Eligible-shows query failed:', showsError);
      return Response.json({ error: showsError.message }, { status: 500 });
    }

    summary.eligible_shows = shows?.length ?? 0;
    for (const show of shows ?? []) {
      await processShow(show as EligibleShow, summary);
    }

    console.log('Payout run summary:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('cron-process-payouts error:', message);
    return Response.json({ error: message, ...summary }, { status: 500 });
  }
});

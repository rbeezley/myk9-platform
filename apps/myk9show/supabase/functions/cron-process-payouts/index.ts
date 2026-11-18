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
// - Payout brake (MYK9-2170, platform_settings.payouts_require_approval): while
//   on, a payout the run would send is recorded as 'awaiting_approval' instead,
//   reminds the operator daily, and sends only once a site admin approves it.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
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
import {
  PAYOUT_ALERT_SOURCE,
  remindAwaitingApprovals,
  sendOrWait,
  shouldEvaluateShow,
} from '../_shared/payoutApproval.ts';
import {
  claimDueReminders,
  loadCarriedApproval,
  loadPayoutBrake,
  recordAwaitingApproval,
} from './approvalGate.ts';
import {
  computePayoutCents,
  dollars,
  loadEligibleShows,
  recoverStaleProcessing,
  secretMatches,
  type EligibleShow,
} from './runSupport.ts';

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

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

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
    source: PAYOUT_ALERT_SOURCE,
    dedupeKey: opts.dedupeKey,
  });
}

async function processShow(show: EligibleShow, summary: Record<string, number>, brakeOn: boolean) {
  // Existing live row decides the path: completed/processing/held → done
  // elsewhere, pending/awaiting_approval/approved → reuse the row (recompute),
  // none → create (shouldEvaluateShow, MYK9-2170). Checked BEFORE the
  // entries fetch: eligibility is date-driven, so every settled show stays
  // eligible forever — without this early exit each historical show would
  // re-pay the full entries query nightly, unbounded (review finding #2).
  const { data: liveRow } = await supabase
    .from('show_payouts')
    .select('id, status')
    .eq('show_id', show.id)
    .neq('status', 'failed')
    .maybeSingle();

  if (liveRow && !shouldEvaluateShow(liveRow.status)) {
    return; // completed, in-flight or held
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
        .eq('status', liveRow.status);
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

  // MYK9-2170 payout brake: where the run would send, an unapproved payout is
  // recorded as waiting for approval instead. Approved rows go on to the one
  // send path below.
  const carriedApprovalAt =
    liveRow || !brakeOn ? null : await loadCarriedApproval(supabase, show.id);
  const liveStatus = liveRow?.status ?? null;
  if (sendOrWait({ brakeOn, liveStatus, carriedApprovalAt }) === 'wait_for_approval') {
    const input = { liveRow, showId: show.id, accountId: account.id, amountCents };
    if (await recordAwaitingApproval(supabase, input)) summary.awaiting_approval++;
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
    // Claim: the live row (pending, approved, or awaiting with the brake off)
    // → processing with the fresh amount, or insert processing.
    if (liveRow) {
      const { data: claimed, error: claimError } = await supabase
        .from('show_payouts')
        .update({
          status: 'processing',
          amount_cents: amountCents,
          club_stripe_account_id: account.id,
        })
        .eq('id', liveRow.id)
        .eq('status', liveRow.status)
        .select('id');
      if (claimError || !claimed?.length) return; // raced by another run
      rowId = claimed[0].id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('show_payouts')
        .insert({
          show_id: show.id,
          club_stripe_account_id: account.id,
          amount_cents: amountCents,
          status: 'processing',
          scheduled_date: new Date().toISOString().slice(0, 10),
          // A retry of an approved attempt keeps its approval (MYK9-2170).
          ...(carriedApprovalAt ? { approved_at: carriedApprovalAt } : {}),
        })
        .select('id')
        .single();
      if (insertError || !inserted) {
        // Unique-index conflict = another run already owns this show.
        console.log(`Skipping show ${show.id}: live payout row already exists`);
        return;
      }
      rowId = inserted.id;
    }

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

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!(await secretMatches(req.headers.get('x-function-secret'), cronSecret))) {
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
    approval_reminders: 0,
  };

  try {
    // Fail closed: without a clear reading of the brake, nothing is sent or parked.
    const brake = await loadPayoutBrake(supabase);
    if (!brake.ok) {
      console.error('Payout brake read failed:', brake.message);
      return Response.json({ error: brake.message, ...summary }, { status: 500 });
    }

    await recoverStaleProcessing(supabase, alertAdmin, summary);

    const eligible = await loadEligibleShows(supabase);
    if ('error' in eligible) {
      return Response.json({ error: eligible.error }, { status: 500 });
    }
    const shows = eligible.shows;

    summary.eligible_shows = shows.length;
    for (const show of shows) {
      await processShow(show, summary, brake.on);
    }

    summary.approval_reminders = await remindAwaitingApprovals(
      {
        claimDueReminders: cutoffIso => claimDueReminders(supabase, cutoffIso),
        alert: (subject, html, dedupeKey) => alertAdmin(subject, html, { dedupeKey }),
      },
      Date.now()
    );

    console.log('Payout run summary:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('cron-process-payouts error:', message);
    return Response.json({ error: message, ...summary }, { status: 500 });
  }
});

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
//   reminds the operator daily, and sends only once a site admin approves it,
//   to the approved destination and for no more than the approved amount.
//
// The per-show flow lives in processShow.ts (dependencies injected, tested in
// processShow.test.ts); this file wires the real clients.

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
import { PAYOUT_ALERT_SOURCE, remindAwaitingApprovals } from '../_shared/payoutApproval.ts';
import { processShow, type Alert, type ClubNotices, type ClubRef } from './processShow.ts';
import { createSupabasePayoutStore } from './payoutStore.ts';
import {
  loadEligibleShows,
  loadPayoutBrake,
  recoverStaleProcessing,
  secretMatches,
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
const store = createSupabasePayoutStore(supabase);

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
const sendEmail = createResendSender(resendApiKey, FROM_EMAIL);
const siteUrl = Deno.env.get('SITE_URL');

// MYK9-1986: every money email to a club goes to each active club admin and the
// club's contact address, one message per address.
function clubNoticeDeps(club: ClubRef) {
  return {
    loadRecipients: () => loadClubMoneyRecipients(supabase, club.id, club.email),
    send: sendEmail,
  };
}

const notices: ClubNotices = {
  async cannotReceiveYet({ club, show, amountCents, accountOnboarded }) {
    // An onboarded account with payouts off needs fixing, not connecting (MYK9-1986).
    const notice = accountOnboarded ? bankNeedsAttentionEmail : connectAccountEmail;
    await emailClub(
      clubNoticeDeps(club),
      notice({
        clubName: club.name,
        showName: show.name,
        amountCents,
        paymentsUrl: clubPaymentsUrl(siteUrl, club.id),
      })
    );
  },
  async payoutSent({ club, show, amountCents }) {
    await emailClub(
      clubNoticeDeps(club),
      payoutSentEmail({ clubName: club.name, showName: show.name, amountCents })
    );
  },
  async transferFailed({ club, show, amountCents, failedRowId, owner }) {
    await notifyClubOfTransferFailure(clubNoticeDeps(club), {
      owner,
      clubName: club.name,
      showName: show.name,
      amountCents,
      paymentsUrl: clubPaymentsUrl(siteUrl, club.id),
      loadPreviousAttempt: () => loadPreviousPayoutAttempt(supabase, show.id, failedRowId),
    });
  },
};

// Wraps the shared, persist-then-email alertAdmin (MP-08) with this
// function's identity so operator_alerts.source reads 'cron-process-payouts'
// instead of the generic default. dedupeKey pairs with source against the
// DB's partial unique index so a persistent condition (e.g. a show's balance
// staying insufficient for days) updates nothing on re-runs instead of
// inserting a fresh unresolved row every day. Severity defaults to 'error';
// routine approval reminders pass 'warn' so they do not count as failures.
const alertAdmin: Alert = (subject, html, opts = {}) =>
  sharedAlertAdmin(subject, html, {
    source: PAYOUT_ALERT_SOURCE,
    dedupeKey: opts.dedupeKey,
    severity: opts.severity,
  });

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!(await secretMatches(req.headers.get('x-function-secret'), cronSecret))) {
    return new Response('Forbidden', { status: 403 });
  }

  const summary: Record<string, number> = {
    eligible_shows: 0,
    completed: 0,
    pending_not_onboarded: 0,
    failed: 0,
    skipped_no_online_money: 0,
    stale_recovered: 0,
    mode_mismatch: 0,
    money_lock_busy: 0,
    awaiting_approval: 0,
    held: 0,
    approval_reopened: 0,
    approval_queue_errors: 0,
    claim_refused: 0,
    claim_errors: 0,
    approval_reminders: 0,
    approval_reminder_errors: 0,
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

    const deps = {
      store,
      transfers: stripe.transfers,
      stripeLivemode,
      brakeOn: brake.on,
      alert: alertAdmin,
      acquireLock: (showId: string) =>
        acquireShowMoneyLock(supabase, showId, {
          holder: 'cron-process-payouts',
          ttlMs: 15 * 60 * 1000,
        }),
      notices,
    };
    summary.eligible_shows = eligible.shows.length;
    for (const show of eligible.shows) {
      await processShow(deps, show, summary);
    }

    const reminded = await remindAwaitingApprovals(
      {
        claimDueReminders: cutoffIso => store.claimDueReminders(cutoffIso),
        alert: (subject, html, dedupeKey) =>
          alertAdmin(subject, html, { dedupeKey, severity: 'warn' }).then(() => undefined),
      },
      Date.now()
    );
    if (reminded === null) {
      summary.approval_reminder_errors++;
      await alertAdmin(
        'Payout approval reminders could not be sent',
        `<p>The payout run could not read which payouts are waiting for approval, so no
         reminder went out today. Payouts still wait for approval; the next run tries again.</p>`,
        { dedupeKey: 'payout-approval-reminder-claim-failed', severity: 'error' }
      );
    } else {
      summary.approval_reminders = reminded;
    }

    console.log('Payout run summary:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('cron-process-payouts error:', message);
    return Response.json({ error: message, ...summary }, { status: 500 });
  }
});

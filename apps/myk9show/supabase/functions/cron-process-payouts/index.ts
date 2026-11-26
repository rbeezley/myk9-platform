// Daily payout run: transfer each closed show's online entry fees to the
// club's Stripe Express account, 3 days after the show ends.
//
// Money-safety properties (see docs/plans/2026-06-09-stripe-connect-implementation.md):
// - Caller auth via x-function-secret (pg_cron / manual curl), never JWT.
// - Stale 'processing' rows are checked with Stripe FIRST each run (MYK9-2183):
//   a transfer Stripe has is recorded as sent with Stripe's amount; none means
//   the row is failed for retry; a lookup error leaves it 'processing', which
//   keeps refunds blocked. A show whose last attempt failed is checked the same
//   way before anything is queued for it (payoutReconcile.ts).
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
import { stripeKeyMode } from '../_shared/stripeMode.ts';
import { acquireShowMoneyLock } from '../_shared/showMoneyLock.ts';
import { alertAdmin as sharedAlertAdmin } from '../_shared/alertAdmin.ts';
import { loadClubMoneyRecipients } from '../_shared/clubMoneyRecipients.ts';
import { createResendSender } from '../_shared/clubMoneyEmails.ts';
import { processShow, type ProcessShowDeps } from './processShow.ts';
import { recoverStaleProcessing } from './payoutReconcile.ts';
import { loadEligibleShows } from './eligibleShows.ts';
import { refuseUnknownKeyMode } from './payoutAlerts.ts';
import type { PayoutAlertOptions } from './payoutTypes.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Not required at boot (MYK9-2187): a missing or unrecognised key reaches the
// operator alert in the handler instead of failing the function silently.
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const cronSecret = Deno.env.get('PAYOUT_CRON_SECRET')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');

if (!supabaseUrl || !supabaseServiceKey || !cronSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
// MYK9-2187: an unknown key stops the run with an alert, never reads as test.
const stripeMode = stripeKeyMode(stripeSecret);
// Built on first use, after the key's mode is known.
let stripeClient: Stripe | null = null;
function stripeFor(secret: string): Stripe {
  stripeClient ??= new Stripe(secret, { appInfo: { name: 'myK9Show', version: '1.0.0' } });
  return stripeClient;
}

const PAYOUT_DELAY_DAYS = 3;
const STALE_PROCESSING_HOURS = 24;
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

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
function alertAdmin(subject: string, html: string, opts: PayoutAlertOptions = {}) {
  return sharedAlertAdmin(subject, html, {
    source: 'cron-process-payouts',
    dedupeKey: opts.dedupeKey,
    severity: opts.severity,
  });
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
    claim_errors: 0,
    // MYK9-2183: a transfer Stripe already had, recorded as sent.
    reconciled: 0,
    // Stripe could not be asked; nothing was queued for the show.
    transfer_lookup_errors: 0,
    // Stripe moved money but the payout record could not say so.
    reconciliation_errors: 0,
    // A payout record write failed before any money moved.
    ledger_write_errors: 0,
    // The club or its Stripe account could not be read; nothing was queued (MYK9-2339).
    club_read_errors: 0,
    // Stripe gave no clear answer to a transfer request; the row stays processing.
    uncertain_transfers: 0,
  };

  if ((await refuseUnknownKeyMode({ alertAdmin }, stripeMode)) || !stripeSecret) {
    return Response.json({ error: 'Stripe key mode unknown', ...summary }, { status: 500 });
  }

  try {
    // Read once per run for the alert copy only; the claim RPC re-reads the
    // brake in its own transaction before any send. Unreadable reads as on.
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('payouts_require_approval')
      .eq('id', true)
      .maybeSingle();
    const brakeOn = settings?.payouts_require_approval !== false;
    const deps: ProcessShowDeps = {
      supabase,
      stripe: stripeFor(stripeSecret),
      stripeLivemode: stripeMode === 'live',
      brakeOn,
      alertAdmin,
      clubNoticeDeps,
      acquireMoneyLock: showId =>
        acquireShowMoneyLock(supabase, showId, {
          holder: 'cron-process-payouts',
          ttlMs: 15 * 60 * 1000,
        }),
      siteUrl,
    };

    const staleBefore = new Date(Date.now() - STALE_PROCESSING_HOURS * 3600 * 1000).toISOString();
    await recoverStaleProcessing(deps, summary, staleBefore);

    const cutoff = new Date(Date.now() - PAYOUT_DELAY_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    // Newest 1,000 date-eligible shows plus every show still owed a payout
    // (eligibleShows.ts), so none falls past the cutoff (MYK9-2183).
    const loaded = await loadEligibleShows(supabase, cutoff);
    if (!loaded.ok) {
      console.error('Eligible-shows query failed:', loaded.error);
      return Response.json({ error: loaded.error }, { status: 500 });
    }
    const shows = loaded.shows;

    summary.eligible_shows = shows.length;
    for (const show of shows) {
      await processShow(show, summary, deps);
    }

    console.log('Payout run summary:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('cron-process-payouts error:', message);
    return Response.json({ error: message, ...summary }, { status: 500 });
  }
});

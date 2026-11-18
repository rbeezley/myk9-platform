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
import { isStripeLiveMode } from '../_shared/stripeMode.ts';
import { acquireShowMoneyLock } from '../_shared/showMoneyLock.ts';
import { alertAdmin as sharedAlertAdmin } from '../_shared/alertAdmin.ts';
import { loadClubMoneyRecipients } from '../_shared/clubMoneyRecipients.ts';
import { createResendSender } from '../_shared/clubMoneyEmails.ts';
import {
  dollars,
  payoutRetryNote,
  processShow,
  type EligibleShow,
  type ProcessShowDeps,
} from './processShow.ts';

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

/** Fail processing rows older than the stale threshold so the unique index
 * reopens for a retry row. Double-pay is prevented by the transfers.list
 * (transfer_group) check before any send, not by the idempotency key.
 * Staleness keys on updated_at (touched by the set_updated_at trigger on the
 * pending→processing claim) — created_at would false-flag a row that sat
 * pending for days before being claimed minutes ago (review finding #1). */
async function recoverStaleProcessing(summary: Record<string, number>, brakeOn: boolean) {
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
       in 'processing' for over ${STALE_PROCESSING_HOURS}h and has been failed for retry.</p>
       ${payoutRetryNote('stale_processing', brakeOn)}`,
      { dedupeKey: `payout-stale-recovered-${row.id}` }
    );
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
    claim_errors: 0,
  };

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
      stripe,
      stripeLivemode,
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

    await recoverStaleProcessing(summary, brakeOn);

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
      await processShow(show as EligibleShow, summary, deps);
    }

    console.log('Payout run summary:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('cron-process-payouts error:', message);
    return Response.json({ error: message, ...summary }, { status: 500 });
  }
});

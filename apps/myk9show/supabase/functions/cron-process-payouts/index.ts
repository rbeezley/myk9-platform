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

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { calculateShowPayoutCents } from '../_shared/payoutCalc.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const cronSecret = Deno.env.get('PAYOUT_CRON_SECRET')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const alertEmail = Deno.env.get('PLATFORM_ALERT_EMAIL') ?? 'richardbeezley1@gmail.com';

if (!supabaseUrl || !supabaseServiceKey || !stripeSecret || !cronSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'myK9Show', version: '1.0.0' },
});

const PAYOUT_DELAY_DAYS = 3;
const STALE_PROCESSING_HOURS = 24;
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

interface EligibleShow {
  id: string;
  name: string;
  club_id: string | null;
  end_date: string;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!resendApiKey) {
    console.log(`Email skipped (no RESEND_API_KEY): ${subject} -> ${to}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`Email send failed (${res.status}): ${subject} -> ${to}`);
    }
  } catch (err) {
    console.error(`Email send error: ${subject} -> ${to}`, err);
  }
}

function alertAdmin(subject: string, html: string) {
  return sendEmail(alertEmail, `[myK9Show payouts] ${subject}`, html);
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
       (transfer_group) and reconciles instead of paying twice. No action needed unless it recurs.</p>`
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

  if (liveRow && liveRow.status !== 'pending') {
    return; // completed or in-flight
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
        .eq('status', 'pending');
    }
    summary.skipped_no_online_money++;
    return;
  }

  if (!show.club_id) {
    console.error(`Show ${show.id} has no club — cannot pay out`);
    return;
  }

  const { data: account } = await supabase
    .from('club_stripe_accounts')
    .select('id, stripe_account_id, payouts_enabled')
    .eq('club_id', show.club_id)
    .maybeSingle();

  const { data: club } = await supabase
    .from('clubs')
    .select('name, email')
    .eq('id', show.club_id)
    .single();

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
      if (!insertError && club?.email) {
        await sendEmail(
          club.email,
          `Action needed: connect ${club.name}'s payment account`,
          `<p>${show.name} has ${dollars(amountCents)} in online entry fees ready to send to
           ${club.name} — but your club hasn't connected its bank account yet.</p>
           <p>A club admin can set this up in about 10 minutes: sign in to myK9Show and go to
           <strong>My Club → Payments</strong>. The money waits safely until you do.</p>`
        );
      }
    }
    summary.pending_not_onboarded++;
    return;
  }

  // Claim: pending → processing with the fresh amount, or insert processing.
  let rowId: string;
  if (liveRow) {
    const { data: claimed, error: claimError } = await supabase
      .from('show_payouts')
      .update({
        status: 'processing',
        amount_cents: amountCents,
        club_stripe_account_id: account.id,
      })
      .eq('id', liveRow.id)
      .eq('status', 'pending')
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

  try {
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
           Stripe dashboard (Connect → Transfers → ${priorTransfer.id} → Reverse).</p>`
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

    if (club?.email) {
      await sendEmail(
        club.email,
        `${dollars(finalAmountCents)} on its way to ${club.name}`,
        `<p>Entry fees for <strong>${show.name}</strong> — ${dollars(finalAmountCents)} — have been
         sent to ${club.name}'s bank account and typically arrive within 2 business days.</p>
         <p>Questions about the amount? Your show secretary can see the entry-by-entry detail
         in myK9Show.</p>`
      );
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown Stripe error';
    const benign = /insufficient.*balance|balance.*insufficient/i.test(reason);
    await supabase
      .from('show_payouts')
      .update({
        status: 'failed',
        failure_reason: benign ? `insufficient_balance: ${reason}` : reason,
      })
      .eq('id', rowId);
    summary.failed++;
    console.error(`Transfer failed for show ${show.id}: ${reason}`);
    await alertAdmin(
      benign
        ? `Payout deferred (benign): ${show.name}`
        : `Payout FAILED: ${show.name}`,
      `<p>Transfer of ${dollars(amountCents)} for <strong>${show.name}</strong> failed:</p>
       <pre>${reason}</pre>
       ${
         benign
           ? '<p>This is the expected card-clearing delay — show-day payments take ~2 business days to become available. Tomorrow’s run retries automatically; no action needed.</p>'
           : '<p>This will retry tomorrow, but a non-balance failure usually needs a look: check the show_payouts row and the Stripe dashboard.</p>'
       }`
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

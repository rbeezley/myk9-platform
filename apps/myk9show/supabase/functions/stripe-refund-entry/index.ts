import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { validateRefund } from '../_shared/refundValidation.ts';
import {
  buildEntryRefundStamp,
  findReusableRefund,
  refundAttemptCount,
} from '../_shared/refundReuse.ts';
import { alertAdmin } from '../_shared/alertAdmin.ts';
import {
  resolveWithdrawalRefundCents,
  type WithdrawalPolicy,
} from '../_shared/withdrawalPolicy.ts';
import { acquireShowMoneyLock } from '../_shared/showMoneyLock.ts';
import { decideRefundStampGuard, entryHasRefundStamp } from '../_shared/entryRefundStampGuard.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !stripeSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'myK9Show', version: '1.0.0' },
});

// CORS configuration — same origins as the other stripe functions
const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function corsResponse(
  corsHeaders: Record<string, string>,
  body: string | object | null,
  status = 200
) {
  if (status === 204) {
    return new Response(null, { status, headers: corsHeaders });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface RefundRequest {
  entry_id: string;
  /** Omitted = full refund of the entry fee. */
  amount_cents?: number;
  /** True = derive the amount from entries.withdrawal_policy_snapshot. */
  use_policy_snapshot?: boolean;
  notes?: string;
}

Deno.serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    if (req.method === 'OPTIONS') {
      return corsResponse(corsHeaders, {}, 204);
    }
    if (req.method !== 'POST') {
      return corsResponse(corsHeaders, { error: 'Method not allowed' }, 405);
    }

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsResponse(corsHeaders, { error: 'Missing Authorization header' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return corsResponse(corsHeaders, { error: 'Authentication failed' }, 401);
    }

    const body: RefundRequest = await req.json();
    const { entry_id, amount_cents, notes } = body;
    if (!entry_id) {
      return corsResponse(corsHeaders, { error: 'Missing required parameter: entry_id' }, 400);
    }

    // entries carry show_id directly (denormalized alongside class_id/trial_id).
    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select(
        `
        id,
        entry_fee,
        payment_status,
        payment_method,
        stripe_payment_intent_id,
        refunded_at,
        withdrawal_policy_snapshot,
        withdrawn_at,
        trial:trial_id(timezone),
        show:show_id(id, club_id)
      `
      )
      .eq('id', entry_id)
      .single();

    if (entryError || !entry || !entry.show) {
      console.error('Entry not found or missing show:', entryError);
      return corsResponse(corsHeaders, { error: 'Entry not found' }, 404);
    }

    // Keep the nullable shape while legacy audit shows are cleaned up. New
    // club deletion is RESTRICTed, so it cannot create additional orphans.
    const show = entry.show as unknown as { id: string; club_id: string | null };

    // Authorize: show-scoped secretary, the club's admin, or site admin —
    // evaluated AS THE CALLER via the canonical SQL predicates.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const [secretaryRes, clubAdminRes, siteAdminRes] = await Promise.all([
      userClient.rpc('is_show_secretary', { check_show_id: show.id }),
      // is_club_admin(NULL) means "admin of ANY club" (round-8 RLS finding) —
      // for a clubless show, any club admin could refund entries they have no
      // stake in. No club, no club-admin path (round-14 P2).
      show.club_id
        ? userClient.rpc('is_club_admin', { check_club_id: show.club_id })
        : Promise.resolve({ data: false }),
      userClient.rpc('is_site_admin'),
    ]);
    const authorized =
      secretaryRes.data === true || clubAdminRes.data === true || siteAdminRes.data === true;
    if (!authorized) {
      return corsResponse(
        corsHeaders,
        { error: 'Not authorized to refund entries for this show' },
        403
      );
    }

    // Live payout state for the show (the unique partial index guarantees at
    // most one non-failed row). This pre-lock read gives the secretary a fast,
    // clear rejection; the authoritative check is repeated INSIDE the money
    // lock below (MP-18) — the cron could claim + complete a payout between
    // this read and lock acquisition, and a refund issued after the transfer
    // would silently come out of the platform's pocket.
    const { data: payout, error: payoutError } = await supabase
      .from('show_payouts')
      .select('status')
      .eq('show_id', show.id)
      .neq('status', 'failed')
      .maybeSingle();
    if (payoutError) {
      // "No payout row" (refund freely) and "couldn't READ the payout row"
      // have opposite safety properties — a swallowed error here would let a
      // refund through after the club was already paid (round-13 review).
      console.error(`Payout state read failed for show ${show.id}:`, payoutError);
      return corsResponse(
        corsHeaders,
        { error: 'Could not verify the show’s payout state — try again in a moment.' },
        500
      );
    }

    // entries.entry_fee is DECIMAL dollars; all validation runs in cents.
    const entryFeeCents = Math.round((entry.entry_fee ?? 0) * 100);
    let requestedCents = amount_cents;
    if (body.use_policy_snapshot === true) {
      const snapshot = (entry.withdrawal_policy_snapshot ?? null) as WithdrawalPolicy | null;
      if (!snapshot) {
        return corsResponse(corsHeaders, { error: 'policy_snapshot_unavailable' }, 422);
      }

      const rawTrial = entry.trial as
        { timezone?: string | null } | { timezone?: string | null }[] | null;
      const trial = Array.isArray(rawTrial) ? rawTrial[0] : rawTrial;
      const withdrawnAt = entry.withdrawn_at ? new Date(entry.withdrawn_at as string) : new Date();
      const suggestion = resolveWithdrawalRefundCents(
        snapshot,
        entryFeeCents,
        withdrawnAt,
        trial?.timezone || 'America/New_York'
      );
      if (suggestion.requiresManual) {
        return corsResponse(corsHeaders, { error: 'policy_snapshot_manual_review' }, 422);
      }
      requestedCents = suggestion.refundCents;
    }

    const validation = validateRefund({
      entryFeeCents,
      requestedCents,
      paymentStatus: entry.payment_status,
      paymentMethod: entry.payment_method,
      stripePaymentIntentId: entry.stripe_payment_intent_id,
      payoutStatus: payout?.status ?? null,
    });

    if ('error' in validation) {
      console.log(`Refund for entry ${entry_id} rejected: ${validation.error}`);
      return corsResponse(corsHeaders, { error: validation.error }, 422);
    }

    const moneyLock = await acquireShowMoneyLock(supabase, show.id, {
      holder: 'stripe-refund-entry',
      ttlMs: 5 * 60 * 1000,
    });
    if (!moneyLock.ok) {
      return corsResponse(
        corsHeaders,
        {
          error:
            moneyLock.reason === 'locked' ? 'money_operation_in_progress' : 'money_lock_failed',
        },
        moneyLock.reason === 'locked' ? 409 : 500
      );
    }

    // One refund per entry. The idempotency key covers fast retries, but
    // Stripe keys expire (~24h) — a retry after that (e.g. the entry-update
    // below failed, so payment_status never flipped to 'refunded') would
    // create a SECOND refund. Ask Stripe directly, same as the payout cron's
    // transfers.list guard: metadata.entry_id is stamped on creation, so a
    // LIVE refund for this entry is reused, not repeated. Dead refunds
    // (failed/canceled — round-9 review) are ignored: honoring one would
    // stamp the entry refunded and shrink the payout while the customer was
    // never paid. The attempt-count key suffix keeps a retry after a failure
    // from replaying the cached failure (same lesson as the cron's per-row
    // key); refunds.list remains the at-most-one-live-refund authority.
    try {
      // MP-18: re-check payout state now that we hold the lock. The pre-lock
      // read above races the payout cron (it could claim, transfer, and
      // release in the gap); once completed, the next cron run early-returns
      // without a reconcile pass, so a refund landing here would be a silent
      // platform loss. Mirrors the per-intent in-lock re-check in
      // stripe-refund-show. Lives inside the try so a THROWN query failure
      // still releases the lock via the finally (Codex P2).
      const { data: payoutInLock, error: payoutInLockError } = await supabase
        .from('show_payouts')
        .select('status')
        .eq('show_id', show.id)
        .neq('status', 'failed')
        .maybeSingle();
      if (payoutInLockError) {
        console.error(`In-lock payout state read failed for show ${show.id}:`, payoutInLockError);
        return corsResponse(
          corsHeaders,
          { error: 'Could not verify the show’s payout state — try again in a moment.' },
          500
        );
      }
      if (payoutInLock?.status === 'completed' || payoutInLock?.status === 'processing') {
        return corsResponse(
          corsHeaders,
          {
            error:
              payoutInLock.status === 'completed' ? 'payout_already_sent' : 'payout_in_progress',
          },
          422
        );
      }

      const prior = await stripe.refunds.list({
        payment_intent: entry.stripe_payment_intent_id!,
        limit: 100,
      });
      const existingRefund = findReusableRefund(prior.data, entry_id);
      const refund =
        existingRefund ??
        (await stripe.refunds.create(
          {
            payment_intent: entry.stripe_payment_intent_id!,
            amount: validation.amountCents,
            metadata: { entry_id },
          },
          // Attempt count for THIS entry only: an intent-wide count would let a
          // sibling entry's refund shift the key between two concurrent
          // same-entry requests, defeating the dedupe (round-11 review).
          { idempotencyKey: `refund-entry-${entry_id}-${refundAttemptCount(prior.data, entry_id)}` }
        ));
      if (existingRefund) {
        console.log(
          `Reusing existing refund ${existingRefund.id} for entry ${entry_id} — no new refund created`
        );
      }

      // Entry-level refund columns (NUMERIC dollars), added alongside migration
      // 176's enrollment-level columns which track manual desk refunds.
      // refund.amount, not validation.amountCents: when an existing refund is
      // reused, Stripe's recorded amount is the authoritative one.
      const { data: stamped, error: updateError } = await supabase
        .from('entries')
        .update(buildEntryRefundStamp(refund.amount, notes, new Date().toISOString()))
        .eq('id', entry_id)
        .eq('payment_status', 'paid')
        .or('refund_amount.is.null,refund_amount.eq.0')
        .select('id');

      // A zero-row match is only benign if the entry really was stamped by a
      // concurrent refund. Re-read it to distinguish that race from a deleted
      // entry or a status change without a stamp — both of which leave the
      // Stripe refund with no local accounting record. A re-read error fails
      // closed (record_failure) rather than assuming the benign race.
      let reread: { found: boolean; hasRefundStamp: boolean } | undefined;
      if (!updateError && (stamped?.length ?? 0) === 0) {
        const { data: rereadRow, error: rereadError } = await supabase
          .from('entries')
          .select('id, payment_status, refund_amount')
          .eq('id', entry_id)
          .maybeSingle();
        reread = rereadError
          ? { found: false, hasRefundStamp: false }
          : {
              found: !!rereadRow,
              hasRefundStamp: !!rereadRow && entryHasRefundStamp(rereadRow),
            };
      }

      const stampDecision = decideRefundStampGuard({
        hasUpdateError: !!updateError,
        matchedEntryCount: stamped?.length ?? 0,
        reread,
      });

      if (stampDecision.action === 'record_failure') {
        // The Stripe refund DID happen; until the entry is stamped, the payout
        // cron will overpay the club by this amount. Email, don't just log.
        const failureDetail =
          updateError?.message ??
          (reread && !reread.found
            ? `entry ${entry_id} no longer exists — the refund has no accounting record`
            : `entry ${entry_id} was not stamped and carries no existing refund stamp`);
        console.error(
          `CRITICAL: refund ${refund.id} created for entry ${entry_id} but the entry update failed:`,
          failureDetail
        );
        await alertAdmin(
          'Refund issued but not recorded — payout will overpay',
          `<p>Stripe refund <code>${refund.id}</code> (${(refund.amount / 100).toFixed(2)} USD)
           was issued for entry <code>${entry_id}</code>, but stamping the entry failed:</p>
           <pre>${failureDetail}</pre>
           <p>Until the entry's refund columns are set, the payout cron computes the
           show's transfer WITHOUT this refund. Recovery: retry the refund from the
           entries page (it reuses the existing Stripe refund — no double refund), or
           stamp the entry manually.</p>`,
          { source: 'stripe-refund-entry', dedupeKey: `entry-refund-not-recorded-${entry_id}` }
        );
        return corsResponse(
          corsHeaders,
          {
            error: 'Refund issued but recording it failed — contact support',
            refund_id: refund.id,
          },
          500
        );
      }

      if (stampDecision.action === 'already_stamped_elsewhere') {
        // MP-09: a concurrent process (most commonly a bulk show-cancellation
        // refund via stamp_show_refund_entries) already flipped this entry's
        // payment_status/refund_amount between our initial read and this
        // UPDATE. That existing stamp is authoritative — the Stripe refund we
        // just created/reused already has an accounting home, so this is a
        // benign no-op, not a failure. Log and continue without overwriting.
        console.log(
          `Refund ${refund.id} for entry ${entry_id} matched zero rows on the payment_status='paid' ` +
            `stamp guard — the entry was already stamped by a concurrent refund. Leaving the existing stamp in place.`
        );
        return corsResponse(corsHeaders, { refund_id: refund.id, amount_cents: refund.amount });
      }

      // refund.amount, not validation.amountCents: on a reused refund the
      // requested amount may differ from what Stripe actually refunded, and the
      // dialog toast reports this number.
      console.log(
        `Refunded ${refund.amount} cents for entry ${entry_id} (${refund.id}) by ${user.id}`
      );
      return corsResponse(corsHeaders, { refund_id: refund.id, amount_cents: refund.amount });
    } finally {
      await moneyLock.release();
    }
  } catch (error: unknown) {
    // MP-20: log the detail (Stripe SDK messages embed intent/charge ids and
    // internal phrasing) but return a generic body to the caller.
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stripe-refund-entry error:', message);
    return corsResponse(corsHeaders, { error: 'refund_failed' }, 500);
  }
});

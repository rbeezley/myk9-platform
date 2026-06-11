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

let _corsHeaders: Record<string, string> = getCorsHeaders(null);

function corsResponse(body: string | object | null, status = 200) {
  if (status === 204) {
    return new Response(null, { status, headers: _corsHeaders });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ..._corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface RefundRequest {
  entry_id: string;
  /** Omitted = full refund of the entry fee. */
  amount_cents?: number;
  notes?: string;
}

Deno.serve(async req => {
  _corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    if (req.method === 'OPTIONS') {
      return corsResponse({}, 204);
    }
    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsResponse({ error: 'Missing Authorization header' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return corsResponse({ error: 'Authentication failed' }, 401);
    }

    const body: RefundRequest = await req.json();
    const { entry_id, amount_cents, notes } = body;
    if (!entry_id) {
      return corsResponse({ error: 'Missing required parameter: entry_id' }, 400);
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
        show:show_id(id, club_id)
      `
      )
      .eq('id', entry_id)
      .single();

    if (entryError || !entry || !entry.show) {
      console.error('Entry not found or missing show:', entryError);
      return corsResponse({ error: 'Entry not found' }, 404);
    }

    const show = entry.show as unknown as { id: string; club_id: string };

    // Authorize: show-scoped secretary, the club's admin, or site admin —
    // evaluated AS THE CALLER via the canonical SQL predicates.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const [secretaryRes, clubAdminRes, siteAdminRes] = await Promise.all([
      userClient.rpc('is_show_secretary', { check_show_id: show.id }),
      userClient.rpc('is_club_admin', { check_club_id: show.club_id }),
      userClient.rpc('is_site_admin'),
    ]);
    const authorized =
      secretaryRes.data === true || clubAdminRes.data === true || siteAdminRes.data === true;
    if (!authorized) {
      return corsResponse({ error: 'Not authorized to refund entries for this show' }, 403);
    }

    // Live payout state for the show (the unique partial index guarantees at
    // most one non-failed row). Accepted TOCTOU: the cron could claim
    // pending → processing between this read and the refund write; the window
    // is sub-second on a daily cadence, and the cron recomputes amounts from
    // entries at transfer time, so a committed refund still drops out.
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
        { error: 'Could not verify the show’s payout state — try again in a moment.' },
        500
      );
    }

    // entries.entry_fee is DECIMAL dollars; all validation runs in cents.
    const validation = validateRefund({
      entryFeeCents: Math.round((entry.entry_fee ?? 0) * 100),
      requestedCents: amount_cents,
      paymentStatus: entry.payment_status,
      paymentMethod: entry.payment_method,
      stripePaymentIntentId: entry.stripe_payment_intent_id,
      payoutStatus: payout?.status ?? null,
    });

    if ('error' in validation) {
      console.log(`Refund for entry ${entry_id} rejected: ${validation.error}`);
      return corsResponse({ error: validation.error }, 422);
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
    const { error: updateError } = await supabase
      .from('entries')
      .update(buildEntryRefundStamp(refund.amount, notes, new Date().toISOString()))
      .eq('id', entry_id);

    if (updateError) {
      // The Stripe refund DID happen; until the entry is stamped, the payout
      // cron will overpay the club by this amount. Email, don't just log.
      console.error(
        `CRITICAL: refund ${refund.id} created for entry ${entry_id} but the entry update failed:`,
        updateError
      );
      await alertAdmin(
        'Refund issued but not recorded — payout will overpay',
        `<p>Stripe refund <code>${refund.id}</code> (${(refund.amount / 100).toFixed(2)} USD)
         was issued for entry <code>${entry_id}</code>, but stamping the entry failed:</p>
         <pre>${updateError.message}</pre>
         <p>Until the entry's refund columns are set, the payout cron computes the
         show's transfer WITHOUT this refund. Recovery: retry the refund from the
         entries page (it reuses the existing Stripe refund — no double refund), or
         stamp the entry manually.</p>`
      );
      return corsResponse(
        { error: 'Refund issued but recording it failed — contact support', refund_id: refund.id },
        500
      );
    }

    // refund.amount, not validation.amountCents: on a reused refund the
    // requested amount may differ from what Stripe actually refunded, and the
    // dialog toast reports this number.
    console.log(
      `Refunded ${refund.amount} cents for entry ${entry_id} (${refund.id}) by ${user.id}`
    );
    return corsResponse({ refund_id: refund.id, amount_cents: refund.amount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stripe-refund-entry error:', message);
    return corsResponse({ error: message }, 500);
  }
});

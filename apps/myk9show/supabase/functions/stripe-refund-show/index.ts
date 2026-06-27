import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { buildEntryRefundStamp } from '../_shared/refundReuse.ts';
import {
  buildShowRefundPlan,
  type ShowRefundEntry,
  type ShowRefundIntentGroup,
} from '../_shared/showRefundPlan.ts';
import { findReusableShowRefund, showRefundAttemptCount } from '../_shared/showRefundReuse.ts';
import { alertAdmin } from '../_shared/alertAdmin.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !stripeSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecret, { appInfo: { name: 'myK9Show', version: '1.0.0' } });

// At most this many Stripe refunds in flight at once — make-whole refunds a
// whole show, so a 200-entry cancellation must not fire 200 parallel calls
// (Stripe rate limits, and a burst risks partial failure mid-flight).
const CONCURRENCY = 5;
const ENTRY_PAGE = 1000;

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
  if (status === 204) return new Response(null, { status, headers: _corsHeaders });
  return new Response(JSON.stringify(body), {
    status,
    headers: { ..._corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ShowRefundRequest {
  show_id: string;
  notes?: string;
}

interface RefundedResult {
  paymentIntentId: string;
  amountCents: number;
  entryIds: string[];
}
interface SkippedResult {
  entryId: string;
  reason: string;
}
interface FailedResult {
  paymentIntentId: string;
  entryIds: string[];
  error: string;
}

/** Run async tasks with a bounded number in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchShowEntries(showId: string): Promise<ShowRefundEntry[] | null> {
  const all: ShowRefundEntry[] = [];
  for (let from = 0; ; from += ENTRY_PAGE) {
    const { data, error } = await supabase
      .from('entries')
      .select('id, entry_fee, payment_method, payment_status, refund_amount, stripe_payment_intent_id')
      .eq('show_id', showId)
      .order('id')
      .range(from, from + ENTRY_PAGE - 1);
    if (error) {
      console.error(`Entries load failed for show ${showId}:`, error);
      return null;
    }
    all.push(...((data ?? []) as ShowRefundEntry[]));
    if ((data?.length ?? 0) < ENTRY_PAGE) break;
  }
  return all;
}

/**
 * Identify which of the planned intents also have entries OUTSIDE this show.
 * A make-whole full-intent refund on such an intent would refund the other
 * show's entries too, so those are skipped for manual handling rather than
 * over-refunded. Returns the set of cross-show intent ids.
 */
async function findCrossShowIntents(intentIds: string[], showId: string): Promise<Set<string>> {
  const cross = new Set<string>();
  for (let from = 0; from < intentIds.length; from += ENTRY_PAGE) {
    const batch = intentIds.slice(from, from + ENTRY_PAGE);
    const { data, error } = await supabase
      .from('entries')
      .select('stripe_payment_intent_id, show_id')
      .in('stripe_payment_intent_id', batch)
      .neq('show_id', showId);
    if (error) {
      // Fail safe: if we can't prove an intent is single-show, treat ALL of this
      // batch as cross-show (skip) rather than risk an over-refund.
      console.error('Cross-show intent check failed:', error);
      batch.forEach(id => cross.add(id));
      continue;
    }
    for (const row of data ?? []) {
      const id = (row as { stripe_payment_intent_id: string | null }).stripe_payment_intent_id;
      if (id) cross.add(id);
    }
  }
  return cross;
}

async function refundIntent(
  group: ShowRefundIntentGroup,
  showId: string,
  notes: string | undefined
): Promise<{ refunded?: RefundedResult; failed?: FailedResult }> {
  const intentId = group.paymentIntentId;
  try {
    const prior = await stripe.refunds.list({ payment_intent: intentId, limit: 100 });
    const existing = findReusableShowRefund(prior.data, showId);

    let amountCents = existing?.amount ?? 0;
    if (!existing) {
      try {
        // No amount → Stripe refunds the full REMAINING charge (entry fees +
        // platform fee = make-whole). Tagged so a re-run reuses it.
        const refund = await stripe.refunds.create(
          { payment_intent: intentId, metadata: { show_refund: showId } },
          { idempotencyKey: `refund-show-${showId}-${intentId}-${showRefundAttemptCount(prior.data, showId)}` }
        );
        amountCents = refund.amount;
      } catch (err) {
        // Already fully refunded elsewhere (e.g. a per-entry refund covered it):
        // not a failure — the customer has their money. Fall through to stamping
        // so the payout cron still zeroes the club's share.
        const code = (err as { code?: string })?.code;
        if (code !== 'charge_already_refunded') {
          const message = err instanceof Error ? err.message : 'Refund failed';
          return { failed: { paymentIntentId: intentId, entryIds: group.entryIds, error: message } };
        }
      }
    }

    // Stamp each entry with its OWN fee (not the intent total): the payout cron
    // deducts refund_amount per entry, zeroing only what the club was owed.
    const nowIso = new Date().toISOString();
    for (const entryId of group.entryIds) {
      const feeCents = Math.round((group.stampByEntry[entryId] ?? 0) * 100);
      const { error: stampError } = await supabase
        .from('entries')
        .update(buildEntryRefundStamp(feeCents, notes ?? 'Show cancelled — full refund', nowIso))
        .eq('id', entryId);
      if (stampError) {
        // The Stripe refund DID happen; an unstamped entry makes the payout cron
        // overpay the club. Alert, and report the intent as failed so the UI
        // surfaces it (a re-run reuses the refund and only re-stamps).
        console.error(
          `CRITICAL: show refund for intent ${intentId} succeeded but stamping entry ${entryId} failed:`,
          stampError
        );
        await alertAdmin(
          'Show refund issued but an entry was not recorded — payout may overpay',
          `<p>A make-whole refund for show <code>${showId}</code> (intent <code>${intentId}</code>)
           succeeded, but stamping entry <code>${entryId}</code> failed:</p>
           <pre>${stampError.message}</pre>
           <p>Re-run the show refund (it reuses the existing Stripe refund — no double
           refund) or stamp the entry manually.</p>`
        );
        return {
          failed: {
            paymentIntentId: intentId,
            entryIds: group.entryIds,
            error: `recorded refund but entry ${entryId} stamp failed`,
          },
        };
      }
    }

    return { refunded: { paymentIntentId: intentId, amountCents, entryIds: group.entryIds } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refund failed';
    return { failed: { paymentIntentId: intentId, entryIds: group.entryIds, error: message } };
  }
}

Deno.serve(async req => {
  _corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    if (req.method === 'OPTIONS') return corsResponse({}, 204);
    if (req.method !== 'POST') return corsResponse({ error: 'Method not allowed' }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return corsResponse({ error: 'Missing Authorization header' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return corsResponse({ error: 'Authentication failed' }, 401);

    const body: ShowRefundRequest = await req.json();
    const { show_id, notes } = body;
    if (!show_id) return corsResponse({ error: 'Missing required parameter: show_id' }, 400);

    const { data: show, error: showError } = await supabase
      .from('shows')
      .select('id, club_id')
      .eq('id', show_id)
      .single();
    if (showError || !show) return corsResponse({ error: 'Show not found' }, 404);
    const club_id = (show as { club_id: string | null }).club_id;

    // Authorize AS THE CALLER via the canonical SQL predicates (same set as
    // stripe-refund-entry). No club → no club-admin path (a clubless show must
    // not be refundable by an admin of any unrelated club).
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const [secretaryRes, clubAdminRes, siteAdminRes] = await Promise.all([
      userClient.rpc('is_show_secretary', { check_show_id: show_id }),
      club_id
        ? userClient.rpc('is_club_admin', { check_club_id: club_id })
        : Promise.resolve({ data: false }),
      userClient.rpc('is_site_admin'),
    ]);
    if (!(secretaryRes.data === true || clubAdminRes.data === true || siteAdminRes.data === true)) {
      return corsResponse({ error: 'Not authorized to refund entries for this show' }, 403);
    }

    // Payout guard: once the club has been (or is being) paid, refunds can't be
    // clawed back automatically — settle with the club directly.
    const { data: payout, error: payoutError } = await supabase
      .from('show_payouts')
      .select('status')
      .eq('show_id', show_id)
      .neq('status', 'failed')
      .maybeSingle();
    if (payoutError) {
      console.error(`Payout state read failed for show ${show_id}:`, payoutError);
      return corsResponse(
        { error: 'Could not verify the show’s payout state — try again in a moment.' },
        500
      );
    }
    if (payout?.status === 'completed') return corsResponse({ error: 'payout_already_sent' }, 422);
    if (payout?.status === 'processing') return corsResponse({ error: 'payout_in_progress' }, 422);

    const entries = await fetchShowEntries(show_id);
    if (entries === null) {
      return corsResponse({ error: 'Could not load the show’s entries — try again.' }, 500);
    }

    const plan = buildShowRefundPlan(entries);
    const skipped: SkippedResult[] = [...plan.skipped];

    // Single-show guard: drop intents that also paid for OTHER shows' entries
    // (a full-intent refund would over-refund them); list for manual handling.
    const crossShow = await findCrossShowIntents(
      plan.intents.map(i => i.paymentIntentId),
      show_id
    );
    const refundable = plan.intents.filter(group => {
      if (crossShow.has(group.paymentIntentId)) {
        group.entryIds.forEach(entryId => skipped.push({ entryId, reason: 'intent_spans_shows' }));
        return false;
      }
      return true;
    });

    const outcomes = await mapWithConcurrency(refundable, CONCURRENCY, group =>
      refundIntent(group, show_id, notes)
    );

    const refunded = outcomes.flatMap(o => (o.refunded ? [o.refunded] : []));
    const failed = outcomes.flatMap(o => (o.failed ? [o.failed] : []));

    const refundedEntryCount = refunded.reduce((n, r) => n + r.entryIds.length, 0);
    console.log(
      `Show ${show_id} make-whole refund by ${user.id}: ` +
        `${refunded.length} intents / ${refundedEntryCount} entries refunded, ` +
        `${skipped.length} skipped, ${failed.length} failed`
    );

    return corsResponse({
      refunded,
      skipped,
      failed,
      summary: {
        intentsRefunded: refunded.length,
        entriesRefunded: refundedEntryCount,
        skipped: skipped.length,
        failed: failed.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stripe-refund-show error:', message);
    return corsResponse({ error: message }, 500);
  }
});

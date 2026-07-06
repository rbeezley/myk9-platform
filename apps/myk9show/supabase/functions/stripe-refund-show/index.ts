import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  buildShowRefundPlan,
  type ShowRefundEntry,
  type ShowRefundIntentGroup,
} from '../_shared/showRefundPlan.ts';
import { findReusableShowRefund, showRefundAttemptCount } from '../_shared/showRefundReuse.ts';
import { alertAdmin } from '../_shared/alertAdmin.ts';
import { acquireShowMoneyLock } from '../_shared/showMoneyLock.ts';

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
      .select(
        'id, entry_fee, payment_method, payment_status, refund_amount, stripe_payment_intent_id'
      )
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
const INTENT_IN_BATCH = 200;

async function findCrossShowIntents(intentIds: string[], showId: string): Promise<Set<string>> {
  const cross = new Set<string>();
  for (let i = 0; i < intentIds.length; i += INTENT_IN_BATCH) {
    const batch = intentIds.slice(i, i + INTENT_IN_BATCH);
    let failed = false;
    // Paginate the RESULT: an intent can have many other-show entries, and a
    // single unpaginated select silently truncates at PostgREST's 1000-row cap
    // — a truncated cross-show row would leave its intent un-flagged and get it
    // refunded in full, over-refunding the other show (review #974, finding 2).
    for (let from = 0; ; from += ENTRY_PAGE) {
      const { data, error } = await supabase
        .from('entries')
        .select('stripe_payment_intent_id')
        .in('stripe_payment_intent_id', batch)
        .neq('show_id', showId)
        .order('stripe_payment_intent_id')
        .range(from, from + ENTRY_PAGE - 1);
      if (error) {
        console.error('Cross-show intent check failed:', error);
        failed = true;
        break;
      }
      for (const row of data ?? []) {
        const id = (row as { stripe_payment_intent_id: string | null }).stripe_payment_intent_id;
        if (id) cross.add(id);
      }
      if ((data?.length ?? 0) < ENTRY_PAGE) break;
    }
    // Fail safe: if we couldn't fully verify this batch, treat ALL of it as
    // cross-show (skip) rather than risk an over-refund.
    if (failed) batch.forEach(id => cross.add(id));
  }
  return cross;
}

/** Read the show's live payout state; returns a blocking 422 code or null.
 * Re-used at request start AND before each intent's refund (the bulk run spans
 * many seconds, so a single up-front check leaves a wide race vs the payout
 * cron claiming the show — review #974, finding 3). */
async function readPayoutBlock(
  showId: string
): Promise<{ code: 'payout_already_sent' | 'payout_in_progress' } | { error: true } | null> {
  const { data: payout, error } = await supabase
    .from('show_payouts')
    .select('status')
    .eq('show_id', showId)
    .neq('status', 'failed')
    .maybeSingle();
  if (error) {
    console.error(`Payout state read failed for show ${showId}:`, error);
    return { error: true };
  }
  if (payout?.status === 'completed') return { code: 'payout_already_sent' };
  if (payout?.status === 'processing') return { code: 'payout_in_progress' };
  return null;
}

async function refundIntent(
  group: ShowRefundIntentGroup,
  showId: string,
  notes: string | undefined
): Promise<{ refunded?: RefundedResult; failed?: FailedResult }> {
  const intentId = group.paymentIntentId;
  try {
    // Re-check the payout state just before issuing money: if the cron claimed
    // this show mid-run, stop refunding (the club is being/has been paid).
    const block = await readPayoutBlock(showId);
    if (block) {
      const reason = 'error' in block ? 'payout state unverifiable' : block.code;
      return { failed: { paymentIntentId: intentId, entryIds: group.entryIds, error: reason } };
    }

    const prior = await stripe.refunds.list({ payment_intent: intentId, limit: 100 });
    const existing = findReusableShowRefund(prior.data, showId);

    let amountCents = existing?.amount ?? 0;
    if (!existing) {
      try {
        // No amount → Stripe refunds the full REMAINING charge (entry fees +
        // platform fee = make-whole). Tagged so a re-run reuses it.
        const refund = await stripe.refunds.create(
          { payment_intent: intentId, metadata: { show_refund: showId } },
          {
            idempotencyKey: `refund-show-${showId}-${intentId}-${showRefundAttemptCount(prior.data, showId)}`,
          }
        );
        amountCents = refund.amount;
      } catch (err) {
        // Already fully refunded elsewhere (e.g. a per-entry refund covered it):
        // not a failure — the customer has their money. Report the dollars that
        // ARE already refunded on the intent (not 0), and fall through to
        // stamping so the payout cron still zeroes the club's share.
        const code = (err as { code?: string })?.code;
        if (code !== 'charge_already_refunded') {
          const message = err instanceof Error ? err.message : 'Refund failed';
          return {
            failed: { paymentIntentId: intentId, entryIds: group.entryIds, error: message },
          };
        }
        amountCents = prior.data
          .filter(r => r.status !== 'failed' && r.status !== 'canceled')
          .reduce((sum, r) => sum + r.amount, 0);
      }
    }

    // Stamp ALL of the intent's entries ATOMICALLY (single statement) so a
    // partial stamp can never half-complete and strand a sibling on a re-run
    // (review #974, P1b). Each entry's refund_amount is set to its OWN
    // entry_fee inside the RPC; the payout cron deducts that per entry.
    const { error: stampError } = await supabase.rpc('stamp_show_refund_entries', {
      p_entry_ids: group.entryIds,
      p_notes: notes ?? null,
    });
    if (stampError) {
      // The Stripe refund DID happen; until the entries are stamped the payout
      // cron overpays the club. Alert; a re-run reuses the refund (no double
      // refund) and re-stamps atomically.
      console.error(
        `CRITICAL: show refund for intent ${intentId} succeeded but stamping failed:`,
        stampError
      );
      await alertAdmin(
        'Show refund issued but entries were not recorded — payout may overpay',
        `<p>A make-whole refund for show <code>${showId}</code> (intent <code>${intentId}</code>)
         succeeded, but stamping its ${group.entryIds.length} entr${group.entryIds.length === 1 ? 'y' : 'ies'} failed:</p>
         <pre>${stampError.message}</pre>
         <p>Re-run the show refund (it reuses the existing Stripe refund — no double
         refund) or stamp the entries manually.</p>`
      );
      return {
        failed: {
          paymentIntentId: intentId,
          entryIds: group.entryIds,
          error: 'recorded refund but entry stamping failed',
        },
      };
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
      .select('id, club_id, status')
      .eq('id', show_id)
      .single();
    if (showError || !show) return corsResponse({ error: 'Show not found' }, 404);
    const club_id = (show as { club_id: string | null }).club_id;
    const status = (show as { status: string | null }).status;

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

    // Cancellation gate: a bulk make-whole refund is a SHOW-CANCELLATION action.
    // Requiring shows.status = 'cancelled' (set deliberately first) stops an
    // authorized manager from refunding every paid entry of a live/upcoming show
    // by accident or abuse (PR #974 review, finding P1a).
    if (status !== 'cancelled') {
      return corsResponse({ error: 'show_not_cancelled' }, 422);
    }

    const moneyLock = await acquireShowMoneyLock(supabase, show_id, {
      holder: 'stripe-refund-show',
      ttlMs: 15 * 60 * 1000,
    });
    if (!moneyLock.ok) {
      return corsResponse(
        {
          error:
            moneyLock.reason === 'locked' ? 'money_operation_in_progress' : 'money_lock_failed',
        },
        moneyLock.reason === 'locked' ? 409 : 500
      );
    }

    try {
      // Payout guard: once the club has been (or is being) paid, refunds can't be
      // clawed back automatically — settle with the club directly. (Re-checked
      // per-intent in refundIntent for the mid-run race.)
      const block = await readPayoutBlock(show_id);
      if (block && 'error' in block) {
        return corsResponse(
          { error: 'Could not verify the show’s payout state — try again in a moment.' },
          500
        );
      }
      if (block) return corsResponse({ error: block.code }, 422);

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
          group.entryIds.forEach(entryId =>
            skipped.push({ entryId, reason: 'intent_spans_shows' })
          );
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
    } finally {
      await moneyLock.release();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stripe-refund-show error:', message);
    return corsResponse({ error: message }, 500);
  }
});

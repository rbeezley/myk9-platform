/**
 * withdraw-waitlist-offer (MYK9-1001): the show's secretary takes back an open
 * wait list offer from the Waitlist tab. The decision lives in
 * ../_shared/withdrawWaitlistOffer.ts; this file only wires it to Supabase and
 * Stripe. Deploy with --no-verify-jwt: the caller is authenticated here.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  expireWaitlistOffer,
  type WaitlistExpirationStripe,
  type WaitlistExpirationSupabase,
} from '../_shared/waitlistExpiration.ts';
import {
  dispatchQueuedWaitlistEvents,
  enqueueWaitlistEvent,
} from '../_shared/waitlistNotificationDispatch.ts';
import {
  WITHDRAW_MESSAGES,
  withdrawWaitlistOffer,
  type WithdrawableOffer,
} from '../_shared/withdrawWaitlistOffer.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
// The waitlist email/push dispatcher's secret (as cron-waitlist-expiration uses it).
const pushWebhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !stripeSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'myK9Show', version: '1.0.0' },
});

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

interface OfferRow {
  id: string;
  status: string | null;
  promoted_entry_id: string | null;
  offer_expires_at: string | null;
  class: { trial: { show: { id: string; club_id: string | null } | null } | null } | null;
}

Deno.serve(async request => {
  const corsHeaders = getCorsHeaders(request.headers.get('origin'));
  const response = (body: object | null, status = 200): Response => {
    if (status === 204) return new Response(null, { status, headers: corsHeaders });
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  };

  try {
    if (request.method === 'OPTIONS') return response({}, 204);
    if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

    const authorization = request.headers.get('Authorization');
    if (!authorization) return response({ error: 'Missing Authorization header' }, 401);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authorization.replace('Bearer ', ''));
    if (authError || !user) return response({ error: 'Authentication failed' }, 401);

    const { waitlist_entry_id } = (await request.json()) as { waitlist_entry_id?: string };
    if (!waitlist_entry_id) {
      return response({ error: 'Missing required parameter: waitlist_entry_id' }, 400);
    }

    // Authorize AS THE CALLER through the canonical SQL predicates, the same
    // three promote_waitlist_entry checks (mirrors stripe-payment-link).
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const result = await withdrawWaitlistOffer(
      {
        loadOffer: async id => {
          const { data, error } = await supabase
            .from('waitlist_entries')
            .select(
              'id, status, promoted_entry_id, offer_expires_at, class:class_id(trial:trial_id(show:show_id(id, club_id)))'
            )
            .eq('id', id)
            .maybeSingle();
          if (error) {
            console.error('Could not load waitlist offer for withdrawal:', error);
            return 'error';
          }
          if (!data) return null;
          const row = data as unknown as OfferRow;
          const show = row.class?.trial?.show ?? null;
          return {
            id: row.id,
            status: row.status,
            promoted_entry_id: row.promoted_entry_id,
            offer_expires_at: row.offer_expires_at,
            show_id: show?.id ?? null,
            club_id: show?.club_id ?? null,
          } satisfies WithdrawableOffer;
        },
        canManageShow: async (showId, clubId) => {
          const [secretary, clubAdmin, siteAdmin] = await Promise.all([
            userClient.rpc('is_show_secretary', { check_show_id: showId }),
            // No club, no club-admin path: is_club_admin(NULL) would mean any club.
            clubId
              ? userClient.rpc('is_club_admin', { check_club_id: clubId })
              : Promise.resolve({ data: false }),
            userClient.rpc('is_site_admin'),
          ]);
          return secretary.data === true || clubAdmin.data === true || siteAdmin.data === true;
        },
        recheckOpenOffer: async (id, nowIso) => {
          const { data, error } = await supabase
            .from('waitlist_entries')
            .select('id, promoted_entry_id')
            .eq('id', id)
            .eq('status', 'offered')
            .gt('offer_expires_at', nowIso)
            .maybeSingle();
          if (error) {
            console.error('Could not recheck the open waitlist offer:', error);
            return 'error';
          }
          return data ?? null;
        },
        expire: (offer, terminalStatus) =>
          expireWaitlistOffer({
            supabase: supabase as unknown as WaitlistExpirationSupabase,
            stripe: stripe as unknown as WaitlistExpirationStripe,
            offer,
            nowIso: new Date().toISOString(),
            terminalStatus,
          }),
        // The offer's own channels, only after the row is closed (owner decision 2026-10-05).
        notify: async (id, event) => {
          let notified = true;
          if (event === 'withdrawn') {
            // In-app, from the secretary who withdrew (as a manual offer's message is).
            const { data: outcome, error: messageError } = await supabase.rpc(
              'send_waitlist_withdrawal_message_internal',
              { p_waitlist_entry_id: id, p_sender_auth_user_id: user.id }
            );
            if (messageError || outcome !== 'sent') {
              console.error(
                `withdraw-waitlist-offer: in-app notice for ${id} not sent:`,
                messageError?.message ?? outcome
              );
              notified = false;
            }
          }
          // Email + push: a durable event; a failed dispatch is retried by
          // cron-waitlist-expiration, so only a failed enqueue counts as not told.
          const queued = await enqueueWaitlistEvent({
            supabase,
            waitlistEntryId: id,
            eventType: event,
          });
          if (!queued) {
            console.error(`withdraw-waitlist-offer: ${event} email/push for ${id} not queued`);
            return false;
          }
          const delivery = await dispatchQueuedWaitlistEvents({
            events: [queued],
            supabaseUrl,
            pushWebhookSecret,
          });
          if (delivery.errors.length > 0) {
            console.error(
              `withdraw-waitlist-offer: ${event} email/push for ${id} left for retry:`,
              delivery.errors.join('; ')
            );
          }
          return notified;
        },
      },
      waitlist_entry_id,
      new Date().toISOString()
    );

    return response(result.body, result.httpStatus);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('withdraw-waitlist-offer error:', message);
    return response({ error: WITHDRAW_MESSAGES.failed }, 500);
  }
});

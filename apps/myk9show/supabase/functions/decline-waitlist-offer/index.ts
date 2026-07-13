import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  expireWaitlistOffer,
  type ExpiredWaitlistOffer,
  type WaitlistExpirationStripe,
  type WaitlistExpirationSupabase,
} from '../_shared/waitlistExpiration.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;

if (!supabaseUrl || !supabaseServiceKey || !stripeSecret) {
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

interface DeclineWaitlistOfferRequest {
  waitlist_entry_id: string;
}

interface OwnedWaitlistOffer extends ExpiredWaitlistOffer {
  exhibitor_id: string;
  status: string;
  offer_expires_at: string | null;
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

    const token = authorization.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return response({ error: 'Authentication failed' }, 401);

    const { waitlist_entry_id }: DeclineWaitlistOfferRequest = await request.json();
    if (!waitlist_entry_id) {
      return response({ error: 'Missing required parameter: waitlist_entry_id' }, 400);
    }

    const { data: exhibitorProfile, error: exhibitorError } = await supabase
      .from('exhibitor_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (exhibitorError) {
      console.error('Could not load exhibitor profile for waitlist decline:', exhibitorError);
      return response({ error: 'Could not verify this waitlist offer' }, 500);
    }
    if (!exhibitorProfile) return response({ error: 'Waitlist offer not found' }, 404);

    const { data: offer, error: offerError } = await supabase
      .from('waitlist_entries')
      .select('id, exhibitor_id, status, promoted_entry_id, offer_expires_at')
      .eq('id', waitlist_entry_id)
      .eq('exhibitor_id', exhibitorProfile.id)
      .maybeSingle();
    if (offerError) {
      console.error('Could not load waitlist offer for decline:', offerError);
      return response({ error: 'Could not verify this waitlist offer' }, 500);
    }
    if (!offer) return response({ error: 'Waitlist offer not found' }, 404);

    const ownedOffer = offer as OwnedWaitlistOffer;
    const nowIso = new Date().toISOString();
    if (ownedOffer.status === 'expired' || ownedOffer.status === 'declined') {
      return response({ status: 'expired', already_closed: true });
    }
    if (
      ownedOffer.status !== 'offered' ||
      !ownedOffer.promoted_entry_id ||
      !ownedOffer.offer_expires_at
    ) {
      return response(
        { error: 'This waitlist offer is already being reconciled. Refresh My Entries shortly.' },
        409
      );
    }
    if (ownedOffer.offer_expires_at <= nowIso) {
      const lapsedResult = await expireWaitlistOffer({
        supabase: supabase as WaitlistExpirationSupabase,
        stripe: stripe as WaitlistExpirationStripe,
        offer: ownedOffer,
        nowIso,
        terminalStatus: 'expired',
      });
      if (lapsedResult === 'paid') {
        return response(
          { error: 'Payment is being reconciled; refresh My Entries shortly.' },
          409
        );
      }
      if (lapsedResult === 'error') {
        return response({ error: 'We could not expire this offer. Please try again.' }, 500);
      }
      return response({ status: 'expired', already_closed: true });
    }

    // Recheck the offered state immediately before touching Stripe. This keeps
    // a concurrent webhook or expiry from being overwritten by a stale read.
    const { data: activeOffer, error: activeOfferError } = await supabase
      .from('waitlist_entries')
      .select('id, promoted_entry_id')
      .eq('id', waitlist_entry_id)
      .eq('exhibitor_id', exhibitorProfile.id)
      .eq('status', 'offered')
      .gt('offer_expires_at', nowIso)
      .maybeSingle();
    if (activeOfferError) {
      console.error('Could not recheck active waitlist offer:', activeOfferError);
      return response({ error: 'Could not verify this waitlist offer' }, 500);
    }
    if (!activeOffer) return response({ status: 'expired', already_closed: true });

    const result = await expireWaitlistOffer({
      supabase: supabase as WaitlistExpirationSupabase,
      stripe: stripe as WaitlistExpirationStripe,
      offer: activeOffer as ExpiredWaitlistOffer,
      nowIso,
      terminalStatus: 'declined',
    });
    if (result === 'paid') {
      return response(
        { error: 'Payment is being reconciled; refresh My Entries shortly.' },
        409
      );
    }
    if (result === 'error') {
      return response({ error: 'We could not decline this offer. Please try again.' }, 500);
    }

    return response({ status: 'expired', already_closed: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('decline-waitlist-offer error:', message);
    return response({ error: 'We could not decline this offer. Please try again.' }, 500);
  }
});

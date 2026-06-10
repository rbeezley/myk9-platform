import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

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

// CORS configuration — same origins as stripe-checkout / stripe-customer-portal
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

interface OnboardRequest {
  club_id: string;
  return_path: string; // app-relative, e.g. "/club-admin/payments"
}

/** Build an absolute URL on the request's (allowed) origin from an app-relative path. */
function buildRedirectUrl(requestOrigin: string | null, path: string): string | null {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : null;
  if (!origin) return null;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return `${origin}${path}`;
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

    const body: OnboardRequest = await req.json();
    const { club_id, return_path } = body;
    if (!club_id || !return_path) {
      return corsResponse({ error: 'Missing required parameters: club_id, return_path' }, 400);
    }

    // Verify the caller is a club admin for this club (or site admin) using
    // the canonical SQL predicates, evaluated AS THE CALLER so auth.uid()
    // resolves to them. This avoids re-implementing RBAC against user_roles,
    // whose column shape has two generations in this schema (migrations 009 vs 163).
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const [{ data: isClubAdmin, error: clubAdminError }, { data: isSiteAdmin }] =
      await Promise.all([
        userClient.rpc('is_club_admin', { check_club_id: club_id }),
        userClient.rpc('is_site_admin'),
      ]);
    if (clubAdminError) {
      console.error('Authorization check failed:', clubAdminError);
      return corsResponse({ error: 'Authorization check failed' }, 500);
    }
    if (isClubAdmin !== true && isSiteAdmin !== true) {
      return corsResponse({ error: 'Not authorized for this club' }, 403);
    }

    // Redirect URLs must land back on an allowed origin
    const requestOrigin = req.headers.get('origin');
    const returnUrl = buildRedirectUrl(requestOrigin, `${return_path}?connect=return`);
    const refreshUrl = buildRedirectUrl(requestOrigin, `${return_path}?connect=refresh`);
    if (!returnUrl || !refreshUrl) {
      return corsResponse({ error: 'Invalid return path or origin' }, 400);
    }

    // Reuse the club's existing Express account or create one.
    const { data: existing } = await supabase
      .from('club_stripe_accounts')
      .select('id, stripe_account_id')
      .eq('club_id', club_id)
      .maybeSingle();

    let stripeAccountId = existing?.stripe_account_id;
    if (!stripeAccountId) {
      // Stripe rejects transfers-only capability requests for Express
      // (capabilities_cannot_have_transfers_without_card_payments_unless_payee);
      // both must be requested even though clubs never take card payments.
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { club_id },
      });
      stripeAccountId = account.id;

      const { error: insertError } = await supabase.from('club_stripe_accounts').insert({
        club_id,
        stripe_account_id: stripeAccountId,
      });
      if (insertError) {
        console.error(`Failed to persist stripe account ${stripeAccountId} for club ${club_id}:`, insertError);
        return corsResponse({ error: 'Failed to save payment account' }, 500);
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    console.log(`Onboarding link created for club ${club_id} (${stripeAccountId})`);
    return corsResponse({ url: accountLink.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stripe-connect-onboard error:', message);
    return corsResponse({ error: message }, 500);
  }
});

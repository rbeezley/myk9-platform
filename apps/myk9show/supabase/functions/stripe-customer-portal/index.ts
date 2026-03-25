import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

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

// CORS configuration — same origins as stripe-checkout
const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
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

interface PortalRequest {
  customerId: string; // Supabase UUID (stripe_customers.id)
  returnUrl: string;
}

/** Validate that a URL starts with one of our allowed origins (prevents open redirect) */
function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    return ALLOWED_ORIGINS.includes(origin);
  } catch {
    return false;
  }
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

    // Authenticate user
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

    // Parse request
    const body: PortalRequest = await req.json();
    const { customerId, returnUrl } = body;

    if (!customerId || !returnUrl) {
      return corsResponse({ error: 'Missing required parameters: customerId, returnUrl' }, 400);
    }

    // Validate return URL against allowed origins (prevent open redirect)
    if (!isAllowedRedirectUrl(returnUrl)) {
      return corsResponse({ error: 'Invalid return URL origin' }, 400);
    }

    // Look up the Stripe customer ID and verify ownership
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id, person_id')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      return corsResponse({ error: 'Customer not found' }, 404);
    }

    // Verify the authenticated user owns this customer record
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id')
      .eq('id', customer.person_id)
      .eq('auth_user_id', user.id)
      .single();

    if (personError || !person) {
      return corsResponse({ error: 'Not authorized' }, 403);
    }

    // Create Stripe Billing Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: returnUrl,
    });

    return corsResponse({ url: session.url });
  } catch (error: unknown) {
    console.error('Customer portal error:', error);
    return corsResponse(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      502
    );
  }
});

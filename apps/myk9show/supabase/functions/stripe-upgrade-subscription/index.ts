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

// Valid price IDs — both map to premium tier now
const VALID_PRICE_IDS = new Set([
  'price_1RHz4VAtHgBcw875bF7McPNd', // legacy "excellent" — now premium
  'price_1RHz3bAtHgBcw875o2gdNaYW', // premium (exhibitors)
]);

interface UpgradeRequest {
  subscriptionId: string; // Stripe subscription ID (sub_xxx)
  newPlanId: string; // Stripe price ID
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
    const body: UpgradeRequest = await req.json();
    const { subscriptionId, newPlanId } = body;

    if (!subscriptionId || !newPlanId) {
      return corsResponse({ error: 'Missing required parameters: subscriptionId, newPlanId' }, 400);
    }

    // Validate price ID against allowlist
    if (!VALID_PRICE_IDS.has(newPlanId)) {
      return corsResponse({ error: 'Invalid plan' }, 400);
    }

    // Look up subscription and verify ownership
    // Join: stripe_subscriptions → stripe_customers → people → auth_user_id
    const { data: sub, error: subError } = await supabase
      .from('stripe_subscriptions')
      .select('id, customer_id')
      .eq('stripe_subscription_id', subscriptionId)
      .single();

    if (subError || !sub) {
      return corsResponse({ error: 'Subscription not found' }, 404);
    }

    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('person_id')
      .eq('id', sub.customer_id)
      .single();

    if (customerError || !customer) {
      return corsResponse({ error: 'Subscription not found' }, 404);
    }

    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id')
      .eq('id', customer.person_id)
      .eq('auth_user_id', user.id)
      .single();

    if (personError || !person) {
      return corsResponse({ error: 'Not authorized' }, 403);
    }

    // Retrieve Stripe subscription to get the current item ID
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentItem = stripeSubscription.items.data[0];

    if (!currentItem) {
      return corsResponse({ error: 'Subscription has no items' }, 400);
    }

    // Update subscription with new price (prorated immediately)
    await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: currentItem.id,
          price: newPlanId,
        },
      ],
      proration_behavior: 'create_prorations',
    });

    // The stripe-webhook handler will process the customer.subscription.updated
    // event and sync the new plan to stripe_subscriptions + exhibitor_profiles

    return corsResponse({ success: true });
  } catch (error: unknown) {
    console.error('Upgrade subscription error:', error);
    return corsResponse(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      502
    );
  }
});

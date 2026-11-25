import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { parsePremiumPriceIds } from '../_shared/premiumPrices.ts';
import { requireStripeLivemode } from '../_shared/stripeMode.ts';
import { verifySubscriptionOwnership } from './subscriptionOwnership.ts';

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
// Fails closed at boot on a key whose mode is unknown (MYK9-2187).
const stripeLivemode = requireStripeLivemode(stripeSecret);

// CORS configuration — same origins as stripe-checkout
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

// Valid price IDs — every configured premium price (PREMIUM_PRICE_IDS secret;
// sandbox + live + annual coexist) with the original live ids as fallback.
const VALID_PRICE_IDS = new Set(
  parsePremiumPriceIds(Deno.env.get('PREMIUM_PRICE_IDS'), [
    'price_1RHz4VAtHgBcw875bF7McPNd', // legacy "excellent" — now premium
    'price_1RHz3bAtHgBcw875o2gdNaYW', // premium (exhibitors)
  ])
);

interface UpgradeRequest {
  subscriptionId: string; // Stripe subscription ID (sub_xxx)
  newPlanId: string; // Stripe price ID
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

    // Authenticate user
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

    // Parse request
    const body: UpgradeRequest = await req.json();
    const { subscriptionId, newPlanId } = body;

    if (!subscriptionId || !newPlanId) {
      return corsResponse(
        corsHeaders,
        { error: 'Missing required parameters: subscriptionId, newPlanId' },
        400
      );
    }

    // Validate price ID against allowlist
    if (!VALID_PRICE_IDS.has(newPlanId)) {
      return corsResponse(corsHeaders, { error: 'Invalid plan' }, 400);
    }

    // Look up subscription and verify ownership, scoped to this key's Stripe mode
    const ownership = await verifySubscriptionOwnership(supabase, {
      subscriptionId,
      authUserId: user.id,
      stripeLivemode,
    });

    if (!ownership.ok) {
      return corsResponse(corsHeaders, { error: ownership.error }, ownership.status);
    }

    // Retrieve Stripe subscription to get the current item ID
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentItem = stripeSubscription.items.data[0];

    if (!currentItem) {
      return corsResponse(corsHeaders, { error: 'Subscription has no items' }, 400);
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

    return corsResponse(corsHeaders, { success: true });
  } catch (error: unknown) {
    console.error('Upgrade subscription error:', error);
    return corsResponse(
      corsHeaders,
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      502
    );
  }
});

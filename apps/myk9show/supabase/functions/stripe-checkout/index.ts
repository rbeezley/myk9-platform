import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { calculatePlatformFeeCents, resolvePlatformFeePercent } from '../_shared/platformFee.ts';
import { parsePremiumPriceIds } from '../_shared/premiumPrices.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;

if (!supabaseUrl || !supabaseServiceKey || !stripeSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'myK9Show',
    version: '1.0.0',
  },
});

// CORS configuration - restrict to known app domains
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

// CORS response helper
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

// Request types
interface SubscriptionCheckoutRequest {
  mode: 'subscription';
  price_id: string;
  success_url: string;
  cancel_url: string;
}

interface PaymentCheckoutRequest {
  mode: 'payment';
  price_id: string;
  success_url: string;
  cancel_url: string;
}

interface EntryCheckoutRequest {
  mode: 'entry';
  cart_id: string;
  success_url: string;
  cancel_url: string;
}

type CheckoutRequest = SubscriptionCheckoutRequest | PaymentCheckoutRequest | EntryCheckoutRequest;

// Valid subscription price IDs — same env-extended allowlist as
// stripe-upgrade-subscription and the webhook tier map (SA-024; PR #625
// review caught this one still hardcoded, which 400'd annual checkout).
const VALID_PRICE_IDS = new Set(
  parsePremiumPriceIds(Deno.env.get('PREMIUM_PRICE_IDS'), [
    'price_1RHz4VAtHgBcw875bF7McPNd', // legacy "excellent" — now premium
    'price_1RHz3bAtHgBcw875o2gdNaYW', // premium (exhibitors)
  ])
);

/** Validate that a URL starts with one of our allowed origins (prevents open redirect) */
function isAllowedRedirectUrl(url: string): boolean {
  try {
    return ALLOWED_ORIGINS.includes(new URL(url).origin);
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
    const body: CheckoutRequest = await req.json();
    const { mode, success_url, cancel_url } = body;

    if (!mode || !success_url || !cancel_url) {
      return corsResponse(
        { error: 'Missing required parameters: mode, success_url, cancel_url' },
        400
      );
    }

    // Validate redirect URLs against allowed origins (prevent open redirect)
    if (!isAllowedRedirectUrl(success_url) || !isAllowedRedirectUrl(cancel_url)) {
      return corsResponse({ error: 'Invalid redirect URL origin' }, 400);
    }

    // Get or create person record for this auth user
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (personError || !person) {
      console.error('Person not found for auth user:', personError);
      return corsResponse({ error: 'User profile not found. Please complete registration.' }, 404);
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user, person.id);
    if (!customerId) {
      return corsResponse({ error: 'Failed to create payment profile' }, 500);
    }

    // Handle different checkout modes.
    // `return await` (not bare `return`) so a rejection inside the handler is
    // caught by this try/catch and returned as JSON-with-CORS — a bare return
    // escapes the catch and surfaces to the browser as an opaque network error.
    if (mode === 'entry') {
      return await handleEntryCheckout(
        body as EntryCheckoutRequest,
        user.id,
        customerId,
        success_url,
        cancel_url
      );
    } else if (mode === 'subscription') {
      return await handleSubscriptionCheckout(
        body as SubscriptionCheckoutRequest,
        customerId,
        success_url,
        cancel_url
      );
    } else if (mode === 'payment') {
      return await handlePaymentCheckout(
        body as PaymentCheckoutRequest,
        customerId,
        success_url,
        cancel_url
      );
    }

    return corsResponse({ error: 'Invalid checkout mode' }, 400);
  } catch (error: unknown) {
    console.error('Checkout error:', error);
    return corsResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

/**
 * Get existing Stripe customer or create a new one
 * Also syncs to exhibitor_profiles if exists
 */
async function getOrCreateStripeCustomer(
  user: { id: string; email?: string },
  personId: string
): Promise<string | null> {
  // Check for existing customer
  const { data: existing, error: lookupError } = await supabase
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('person_id', personId)
    .maybeSingle();

  if (lookupError) {
    console.error('Error looking up stripe customer:', lookupError);
    return null;
  }

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  // Create new Stripe customer
  try {
    const stripeCustomer = await stripe.customers.create({
      email: user.email,
      metadata: {
        auth_user_id: user.id,
        person_id: personId,
      },
    });

    // Save to stripe_customers table
    const { error: insertError } = await supabase.from('stripe_customers').insert({
      person_id: personId,
      stripe_customer_id: stripeCustomer.id,
      email: user.email,
    });

    if (insertError) {
      console.error('Error saving stripe customer:', insertError);
      // Clean up Stripe customer
      await stripe.customers.del(stripeCustomer.id);
      return null;
    }

    // Also update exhibitor_profiles if exists
    await supabase
      .from('exhibitor_profiles')
      .update({ stripe_customer_id: stripeCustomer.id })
      .eq('person_id', personId);

    console.log(`Created Stripe customer ${stripeCustomer.id} for person ${personId}`);
    return stripeCustomer.id;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    return null;
  }
}

/**
 * Handle entry cart checkout
 */
async function handleEntryCheckout(
  request: EntryCheckoutRequest,
  authUserId: string,
  customerId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Response> {
  const { cart_id } = request;

  if (!cart_id) {
    return corsResponse({ error: 'Missing cart_id for entry checkout' }, 400);
  }

  // Fetch cart with items and verify ownership
  const { data: cart, error: cartError } = await supabase
    .from('entry_carts')
    .select(
      `
      *,
      exhibitor:exhibitor_profiles!inner(auth_user_id),
      items:entry_cart_items(
        id,
        dog_id,
        class_id,
        handler_id,
        entry_fee_cents,
        jump_height,
        special_requests,
        dog:dogs(call_name),
        class:classes(
          name,
          trial:trials(
            show:shows(name)
          )
        )
      )
    `
    )
    .eq('id', cart_id)
    .eq('status', 'active')
    .single();

  if (cartError || !cart) {
    console.error('Cart not found:', cartError);
    return corsResponse({ error: 'Cart not found or expired' }, 404);
  }

  // Verify ownership
  if (cart.exhibitor.auth_user_id !== authUserId) {
    return corsResponse({ error: 'Unauthorized access to cart' }, 403);
  }

  // Check cart hasn't expired
  if (new Date(cart.expires_at) < new Date()) {
    await supabase.from('entry_carts').update({ status: 'expired' }).eq('id', cart_id);
    return corsResponse({ error: 'Cart has expired. Please create a new cart.' }, 410);
  }

  // Build line items for Stripe
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = cart.items.map(
    (item: {
      entry_fee_cents: number;
      dog?: { call_name?: string };
      class?: { name?: string; trial?: { show?: { name?: string } } };
    }) => ({
      price_data: {
        currency: 'usd',
        unit_amount: item.entry_fee_cents,
        product_data: {
          name: `${item.dog?.call_name || 'Dog'} - ${item.class?.name || 'Class'}`,
          description: item.class?.trial?.show?.name || 'Show Entry',
        },
      },
      quantity: 1,
    })
  );

  if (lineItems.length === 0) {
    return corsResponse({ error: 'Cart is empty' }, 400);
  }

  // Calculate platform fee (if applicable)
  const subtotal = cart.items.reduce(
    (sum: number, item: { entry_fee_cents: number }) => sum + item.entry_fee_cents,
    0
  );
  const platformFeePercent = resolvePlatformFeePercent(Deno.env.get('PLATFORM_FEE_PERCENT'));
  const platformFeeCents = calculatePlatformFeeCents(subtotal, platformFeePercent);

  // Add platform fee as line item if > 0
  if (platformFeeCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: platformFeeCents,
        product_data: {
          name: 'Platform Fee',
          description: 'Online entry processing fee',
        },
      },
      quantity: 1,
    });
  }

  // Two tabs / a retry must converge on ONE payable session — a second
  // session on the same cart double-charges, and the webhook's cart claim
  // makes the second payment vanish silently (Codex P1). Reuse the open
  // session when the cart is unchanged; expire it (so it can't be paid
  // later) and recreate when the items/total differ.
  if (cart.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(cart.stripe_checkout_session_id);
      // Paid but the webhook hasn't claimed the cart yet (it's still active):
      // creating a replacement session here would re-point the cart and make
      // the REAL payment fail the webhook's current-session guard (Codex
      // round-4 P1). Tell the caller to wait instead.
      if (existing.status === 'complete') {
        console.log(
          `Cart ${cart_id} session ${existing.id} already paid — webhook processing, no new session`
        );
        return corsResponse(
          {
            error:
              'Your payment for this cart is already processing. Give it a few seconds, then check My Entries.',
          },
          409
        );
      }
      if (existing.status === 'open') {
        if (existing.amount_total === subtotal + platformFeeCents && existing.url) {
          console.log(`Reusing open checkout session ${existing.id} for cart ${cart_id}`);
          return corsResponse({ sessionId: existing.id, url: existing.url });
        }
        await stripe.checkout.sessions.expire(existing.id);
        console.log(`Expired stale checkout session ${existing.id} (cart ${cart_id} changed)`);
      }
    } catch (err) {
      // Unknown/foreign session id (e.g. created under the other key mode):
      // fall through and create a fresh one.
      console.log(`Could not inspect prior session for cart ${cart_id}:`, err);
    }
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      cart_id: cart_id,
      type: 'entry',
    },
    payment_intent_data: {
      metadata: {
        cart_id: cart_id,
        type: 'entry',
      },
    },
  });

  // Update cart with checkout session
  const { error: updateError } = await supabase
    .from('entry_carts')
    .update({
      stripe_checkout_session_id: session.id,
      subtotal_cents: subtotal,
      platform_fee_cents: platformFeeCents,
      total_cents: subtotal + platformFeeCents,
    })
    .eq('id', cart_id);

  if (updateError) {
    console.error('Error updating cart with session:', updateError);
  }

  console.log(`Created entry checkout session ${session.id} for cart ${cart_id}`);
  return corsResponse({ sessionId: session.id, url: session.url });
}

/**
 * Handle subscription checkout
 */
async function handleSubscriptionCheckout(
  request: SubscriptionCheckoutRequest,
  customerId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Response> {
  const { price_id } = request;

  if (!price_id) {
    return corsResponse({ error: 'Missing price_id for subscription checkout' }, 400);
  }

  // Validate price_id against allowlist (SA-024)
  if (!VALID_PRICE_IDS.has(price_id)) {
    return corsResponse({ error: 'Invalid price_id' }, 400);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: price_id, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'subscription',
    },
  });

  console.log(`Created subscription checkout session ${session.id}`);
  return corsResponse({ sessionId: session.id, url: session.url });
}

/**
 * Handle one-time payment checkout
 */
async function handlePaymentCheckout(
  request: PaymentCheckoutRequest,
  customerId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Response> {
  const { price_id } = request;

  if (!price_id) {
    return corsResponse({ error: 'Missing price_id for payment checkout' }, 400);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: price_id, quantity: 1 }],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'payment',
    },
  });

  console.log(`Created payment checkout session ${session.id}`);
  return corsResponse({ sessionId: session.id, url: session.url });
}

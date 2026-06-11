import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { calculatePlatformFeeCents, resolvePlatformFeePercent } from '../_shared/platformFee.ts';
import { authoritativeEntryFeeCents } from '../_shared/authoritativeFee.ts';
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

interface EntryCheckoutRequest {
  mode: 'entry';
  cart_id: string;
  success_url: string;
  cancel_url: string;
}

type CheckoutRequest = SubscriptionCheckoutRequest | EntryCheckoutRequest;

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
    }
    // No 'payment' mode: nothing client-side used it, and it accepted any
    // caller-supplied price_id with no allowlist — an SA-024-shaped hole the
    // day a one-time price exists. Re-add WITH an allowlist if ever needed
    // (round-13 review).

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
          entry_fee,
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

  const platformFeePercent = resolvePlatformFeePercent(Deno.env.get('PLATFORM_FEE_PERCENT'));

  // NEVER trust entry_cart_items.entry_fee_cents (round-14 P1): the
  // owner-update RLS policy covers every column, so a direct PostgREST write
  // can lower an item's fee. Recompute each fee from the authority chain
  // (show date-tiered fees → class fee → default). Drift — tampering OR a
  // legitimate fee change since the item was added — heals the cart to
  // authoritative pricing and asks the user to review; we never silently
  // charge a number the cart page didn't show.
  const { data: showFees, error: showFeesError } = await supabase
    .from('shows')
    .select('pre_entry_fee, day_of_show_fee, start_date')
    .eq('id', cart.show_id)
    .single();
  if (showFeesError || !showFees) {
    console.error(`Show fee lookup failed for cart ${cart_id} (show ${cart.show_id}):`, showFeesError);
    return corsResponse({ error: 'Could not verify entry fees. Please try again.' }, 500);
  }

  const nowIso = new Date().toISOString();
  const itemsWithAuthoritativeFee = (
    cart.items as { id: string; entry_fee_cents: number; class?: { entry_fee?: number | string | null } }[]
  ).map(item => ({
    item,
    authoritativeCents: authoritativeEntryFeeCents({
      showPreEntryFee: showFees.pre_entry_fee,
      showDayOfShowFee: showFees.day_of_show_fee,
      showStartDate: showFees.start_date,
      classEntryFee: item.class?.entry_fee ?? null,
      nowIso,
    }),
  }));
  const driftedItems = itemsWithAuthoritativeFee.filter(
    x => x.item.entry_fee_cents !== x.authoritativeCents
  );
  if (driftedItems.length > 0) {
    console.error(
      `Cart ${cart_id}: ${driftedItems.length}/${cart.items.length} item fees differ from ` +
        `authoritative pricing — healing and refusing checkout`
    );
    for (const { item, authoritativeCents } of driftedItems) {
      await supabase
        .from('entry_cart_items')
        .update({ entry_fee_cents: authoritativeCents })
        .eq('id', item.id);
    }
    const healedSubtotal = itemsWithAuthoritativeFee.reduce((s, x) => s + x.authoritativeCents, 0);
    const healedFeeCents = calculatePlatformFeeCents(healedSubtotal, platformFeePercent);
    await supabase
      .from('entry_carts')
      .update({
        subtotal_cents: healedSubtotal,
        platform_fee_cents: healedFeeCents,
        total_cents: healedSubtotal + healedFeeCents,
        // Sever any prior session — it priced the unhealed items.
        stripe_checkout_session_id: null,
      })
      .eq('id', cart_id)
      // Never heal a cart the webhook just claimed (paid mid-checkout).
      .eq('status', 'active');
    if (cart.stripe_checkout_session_id) {
      try {
        await stripe.checkout.sessions.expire(cart.stripe_checkout_session_id);
      } catch {
        // Already expired/paid/foreign — the severed link above is decisive.
      }
    }
    return corsResponse(
      { error: 'Entry fees were updated to current show pricing — review your cart and try again.' },
      409
    );
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

  // Calculate platform fee (if applicable). Item fees are verified equal to
  // the authoritative pricing above, so summing them is summing the authority.
  const subtotal = cart.items.reduce(
    (sum: number, item: { entry_fee_cents: number }) => sum + item.entry_fee_cents,
    0
  );
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

  // Create checkout session. Stripe pages default to 24h payable; an app
  // cart lives ~30 min — without clamping, a user could pay a page whose
  // cart expired hours earlier (round-12 P1). Stripe's MINIMUM expires_at is
  // 30 minutes measured at THEIR clock on arrival — an exact +30:00 computed
  // before the network hop gets rejected as under the minimum (round-15 P1).
  // 31 minutes buys the buffer; the cart is then aligned below to the expiry
  // Stripe actually RETURNS, so page and cart still die at the same instant.
  const sessionExpiresAtEpoch = Math.floor(Date.now() / 1000) + 31 * 60;
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    expires_at: sessionExpiresAtEpoch,
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
  const { data: updated, error: updateError } = await supabase
    .from('entry_carts')
    .update({
      stripe_checkout_session_id: session.id,
      subtotal_cents: subtotal,
      platform_fee_cents: platformFeeCents,
      total_cents: subtotal + platformFeeCents,
      // Stripe's returned expiry is authoritative (it may round/adjust ours).
      expires_at: new Date((session.expires_at ?? sessionExpiresAtEpoch) * 1000).toISOString(),
    })
    .eq('id', cart_id)
    // Optimistic concurrency (Codex round-6 P1): a cart mutation between our
    // read and this write clears stripe_checkout_session_id and changes
    // totals — writing the stale snapshot back would re-legitimize a session
    // built from items the user no longer has. updated_at auto-touches on
    // every entry_carts update (009 trigger), so equality means "unchanged
    // since we read it".
    .eq('status', 'active')
    .eq('updated_at', cart.updated_at)
    .select('id');

  if (!updateError && (!updated || updated.length === 0)) {
    console.log(`Cart ${cart_id} changed mid-checkout — expiring session ${session.id}`);
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch (expireErr) {
      console.error(`CRITICAL: could not expire orphaned session ${session.id}:`, expireErr);
    }
    return corsResponse(
      { error: 'Your cart changed while checkout was starting. Please try again.' },
      409
    );
  }

  if (updateError) {
    // The webhook REJECTS any paid session the cart doesn't point at
    // (sessionCartGuard) — handing out this URL without the persisted link
    // would let the user pay a session the webhook must then refuse (Codex
    // round-5 P1). Kill the session and fail the request instead.
    console.error('Error updating cart with session — expiring session:', updateError);
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch (expireErr) {
      console.error(`CRITICAL: could not expire orphaned session ${session.id}:`, expireErr);
    }
    return corsResponse({ error: 'Could not start checkout. Please try again.' }, 500);
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

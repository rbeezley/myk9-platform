import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  calculatePlatformFeeCents,
  resolvePlatformFeeRates,
  stampPlatformFeeRates,
} from '../_shared/platformFee.ts';
import { authoritativeEntryFeeCents } from '../_shared/authoritativeFee.ts';
import { parsePremiumPriceIds } from '../_shared/premiumPrices.ts';
import { isStripeLiveMode } from '../_shared/stripeMode.ts';
import { resolveCheckoutSession } from '../_shared/priorCheckoutSession.ts';
import { formatStatementDescriptorSuffix } from '../_shared/statementDescriptor.ts';

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
const stripeLivemode = isStripeLiveMode(stripeSecret);

const RECOVERED_CART_EXPIRATION_MINUTES = 30;

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
    const body: CheckoutRequest = await req.json();
    const { mode, success_url, cancel_url } = body;

    if (!mode || !success_url || !cancel_url) {
      return corsResponse(
        corsHeaders,
        { error: 'Missing required parameters: mode, success_url, cancel_url' },
        400
      );
    }

    // Validate redirect URLs against allowed origins (prevent open redirect)
    if (!isAllowedRedirectUrl(success_url) || !isAllowedRedirectUrl(cancel_url)) {
      return corsResponse(corsHeaders, { error: 'Invalid redirect URL origin' }, 400);
    }

    // Get or create person record for this auth user
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (personError || !person) {
      console.error('Person not found for auth user:', personError);
      return corsResponse(
        corsHeaders,
        { error: 'User profile not found. Please complete registration.' },
        404
      );
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user, person.id);
    if (!customerId) {
      return corsResponse(corsHeaders, { error: 'Failed to create payment profile' }, 500);
    }

    // Handle different checkout modes.
    // `return await` (not bare `return`) so a rejection inside the handler is
    // caught by this try/catch and returned as JSON-with-CORS — a bare return
    // escapes the catch and surfaces to the browser as an opaque network error.
    if (mode === 'entry') {
      return await handleEntryCheckout(
        corsHeaders,
        body as EntryCheckoutRequest,
        user.id,
        customerId,
        success_url,
        cancel_url
      );
    } else if (mode === 'subscription') {
      return await handleSubscriptionCheckout(
        corsHeaders,
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

    return corsResponse(corsHeaders, { error: 'Invalid checkout mode' }, 400);
  } catch (error: unknown) {
    console.error('Checkout error:', error);
    return corsResponse(
      corsHeaders,
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
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
  const currentEmail = user.email?.trim() || undefined;

  // Check for existing customer
  const { data: existing, error: lookupError } = await supabase
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('person_id', personId)
    .eq('livemode', stripeLivemode)
    .maybeSingle();

  if (lookupError) {
    console.error('Error looking up stripe customer:', lookupError);
    return null;
  }

  if (existing?.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(existing.stripe_customer_id);
      if ('deleted' in customer && customer.deleted === true) {
        await supabase
          .from('stripe_customers')
          .delete()
          .eq('person_id', personId)
          .eq('livemode', stripeLivemode);
      } else {
        if (currentEmail && customer.email !== currentEmail) {
          await stripe.customers.update(existing.stripe_customer_id, {
            email: currentEmail,
          });

          const { error: emailSyncError } = await supabase
            .from('stripe_customers')
            .update({ email: currentEmail })
            .eq('person_id', personId)
            .eq('livemode', stripeLivemode);

          if (emailSyncError) {
            console.error('Failed to sync Stripe customer email locally:', emailSyncError);
          }
        }

        return existing.stripe_customer_id;
      }
    } catch (error) {
      if (isStripeResourceMissing(error)) {
        await supabase
          .from('stripe_customers')
          .delete()
          .eq('person_id', personId)
          .eq('livemode', stripeLivemode);
      } else {
        throw error;
      }
    }
  }

  if (existing?.stripe_customer_id) {
    console.log(
      `Recreating stale Stripe customer ${existing.stripe_customer_id} for person ${personId}`
    );
  }

  // Create new Stripe customer
  try {
    const stripeCustomer = await stripe.customers.create({
      email: currentEmail,
      metadata: {
        auth_user_id: user.id,
        person_id: personId,
      },
    });

    // Save to stripe_customers table.
    // stripe_customers(person_id, livemode) is UNIQUE — a second concurrent
    // checkout for the same person/mode will hit a 23505 unique violation. In
    // that case, delete the Stripe customer we just created (it would be
    // orphaned) and re-query to return the winning row's stripe_customer_id.
    const { error: insertError } = await supabase.from('stripe_customers').insert({
      person_id: personId,
      stripe_customer_id: stripeCustomer.id,
      livemode: stripeLivemode,
      email: currentEmail,
    });

    if (insertError) {
      await stripe.customers.del(stripeCustomer.id);
      if (insertError.code === '23505') {
        // Another concurrent request won the race — return the existing row.
        const { data: raceWinner } = await supabase
          .from('stripe_customers')
          .select('stripe_customer_id')
          .eq('person_id', personId)
          .eq('livemode', stripeLivemode)
          .single();
        return raceWinner?.stripe_customer_id ?? null;
      }
      console.error('Error saving stripe customer:', insertError);
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

function isStripeResourceMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'resource_missing'
  );
}

/**
 * Handle entry cart checkout
 */
async function handleEntryCheckout(
  corsHeaders: Record<string, string>,
  request: EntryCheckoutRequest,
  authUserId: string,
  customerId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Response> {
  const { cart_id } = request;

  if (!cart_id) {
    return corsResponse(corsHeaders, { error: 'Missing cart_id for entry checkout' }, 400);
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
    .in('status', ['active', 'expired'])
    .single();

  if (cartError || !cart) {
    console.error('Cart not found:', cartError);
    return corsResponse(corsHeaders, { error: 'Cart not found or expired' }, 404);
  }

  // Verify ownership
  if (cart.exhibitor.auth_user_id !== authUserId) {
    return corsResponse(corsHeaders, { error: 'Unauthorized access to cart' }, 403);
  }

  // My Shows can send exhibitors back to /cart after the cart timer has
  // elapsed. Submitted/abandoned carts stay terminal, but an unpaid active or
  // expired cart may be reopened here after ownership is proven; fee and entry
  // gates below still fail closed before Stripe sees it.
  if (cart.status === 'expired' || new Date(cart.expires_at) < new Date()) {
    const recoveredExpiresAt = new Date(
      Date.now() + RECOVERED_CART_EXPIRATION_MINUTES * 60 * 1000
    ).toISOString();
    const { data: recovered, error: recoverError } = await supabase
      .from('entry_carts')
      .update({
        status: 'active',
        expires_at: recoveredExpiresAt,
        stripe_checkout_session_id: null,
      })
      .eq('id', cart_id)
      .in('status', ['active', 'expired'])
      .select('id, updated_at')
      .maybeSingle();

    if (recoverError || !recovered) {
      console.error(`Could not recover cart ${cart_id}:`, recoverError);
      return corsResponse(
        corsHeaders,
        { error: 'Could not recover this cart. Please try again.' },
        409
      );
    }

    cart.status = 'active';
    cart.expires_at = recoveredExpiresAt;
    cart.stripe_checkout_session_id = null;
    cart.updated_at = recovered.updated_at;
  }

  // Authoritative platform fee: the platform_settings singleton, which a site
  // admin can change with no deploy. Each column falls back to its env var (then
  // the _shared default) if the row is missing. The DB values flow through
  // resolvePlatformFeeRates so the bounds validation is shared with the client
  // preview. flat/min default to 0, i.e. percentage-only (MYK9-197).
  const { data: feeRow, error: feeRowError } = await supabase
    .from('platform_settings')
    .select('platform_fee_percent, platform_fee_flat_cents, platform_fee_min_cents')
    .eq('id', true)
    .maybeSingle();
  if (feeRowError) {
    // NEVER silently swallowed. PostgREST answers an unknown column with 400 /
    // 42703, so if this function is deployed BEFORE migration 20260823140000
    // adds platform_fee_flat_cents and platform_fee_min_cents, every read here
    // fails and the rates fall through to env and then the _shared default.
    // That is invisible without this log, and it charges the DEFAULT percent
    // rather than the configured one for the whole window.
    // DEPLOY ORDER: migration first, then this function.
    console.error(
      `platform_settings read failed (${feeRowError.code ?? 'no code'}): ${feeRowError.message}. ` +
        `Falling back to env/default fee rates — if this is 42703, migration ` +
        `20260823140000 has not been applied and this function must not be live yet.`
    );
  }
  const platformFeeRates = resolvePlatformFeeRates(feeRow, {
    percent: Deno.env.get('PLATFORM_FEE_PERCENT'),
  });

  // NEVER trust entry_cart_items.entry_fee_cents (round-14 P1): the
  // owner-update RLS policy covers every column, so a direct PostgREST write
  // can lower an item's fee. Recompute each fee from the authority chain
  // (show date-tiered fees → class fee → default). Drift — tampering OR a
  // legitimate fee change since the item was added — heals the cart to
  // authoritative pricing and asks the user to review; we never silently
  // charge a number the cart page didn't show.
  const { data: showFees, error: showFeesError } = await supabase
    .from('shows')
    .select(
      `name, pre_entry_fee, day_of_show_fee, start_date, status,
        entry_open_date, entry_close_date, club_id`
    )
    .eq('id', cart.show_id)
    .single();
  if (showFeesError || !showFees) {
    console.error(
      `Show fee lookup failed for cart ${cart_id} (show ${cart.show_id}):`,
      showFeesError
    );
    return corsResponse(
      corsHeaders,
      { error: 'Could not verify entry fees. Please try again.' },
      500
    );
  }

  // Server-side online-entry gate: the UI enforces this, but any direct API
  // call to stripe-checkout bypasses the UI. Fail closed on each condition.
  const entryStatuses = ['published', 'accepting_entries'];
  if (!entryStatuses.includes(showFees.status)) {
    return corsResponse(
      corsHeaders,
      { error: 'Online entries are not currently open for this show.' },
      403
    );
  }

  // Entry window is anchored to the show's local calendar day, not a UTC
  // instant. shows.entry_open_date / entry_close_date are timestamptz whose
  // value for a typed calendar date is midnight UTC of that day, so the intended
  // open/close *day* is that value read in UTC. "Now" is compared as the current
  // calendar date in the show's timezone (primary trial's timezone, default
  // America/New_York) so a direct call never blocks an exhibitor before the end
  // of the local close day — matching the cart gate (CartSummary) and the
  // submit_show_entries RPC guard. Parsing the timestamptz as a UTC instant
  // (`new Date(...).getTime()`) previously closed entries ~a day early for shows
  // west of UTC.
  const { data: tzRow } = await supabase
    .from('trials')
    .select('timezone')
    .eq('show_id', cart.show_id)
    .order('date', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const showTz = tzRow?.timezone || 'America/New_York';
  const calendarDateInTz = (instant: Date, tz: string): string =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  const todayLocal = calendarDateInTz(new Date(), showTz);
  const openDay = showFees.entry_open_date
    ? calendarDateInTz(new Date(showFees.entry_open_date as string), 'UTC')
    : null;
  const closeDay = showFees.entry_close_date
    ? calendarDateInTz(new Date(showFees.entry_close_date as string), 'UTC')
    : null;
  if (openDay && todayLocal < openDay) {
    return corsResponse(
      corsHeaders,
      { error: 'Online entry has not opened yet for this show.' },
      403
    );
  }
  if (closeDay && todayLocal > closeDay) {
    return corsResponse(corsHeaders, { error: 'Online entry has closed for this show.' }, 403);
  }
  {
    const connectPayoutsEnabled = showFees.club_id
      ? await supabase
          .from('club_stripe_accounts')
          .select('payouts_enabled')
          .eq('club_id', showFees.club_id)
          .eq('livemode', stripeLivemode)
          .maybeSingle()
          .then(({ data }) => data?.payouts_enabled === true)
      : false;
    if (!connectPayoutsEnabled) {
      return corsResponse(
        corsHeaders,
        { error: "This club's payment account is not set up to receive online entry fees." },
        403
      );
    }
  }

  const nowIso = new Date().toISOString();
  const itemsWithAuthoritativeFee = (
    cart.items as {
      id: string;
      entry_fee_cents: number;
      class?: { entry_fee?: number | string | null };
    }[]
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
    const healedFeeCents = calculatePlatformFeeCents(healedSubtotal, platformFeeRates);
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
      corsHeaders,
      {
        error: 'Entry fees were updated to current show pricing — review your cart and try again.',
      },
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
    return corsResponse(corsHeaders, { error: 'Cart is empty' }, 400);
  }

  // Calculate platform fee (if applicable). Item fees are verified equal to
  // the authoritative pricing above, so summing them is summing the authority.
  const subtotal = cart.items.reduce(
    (sum: number, item: { entry_fee_cents: number }) => sum + item.entry_fee_cents,
    0
  );
  const platformFeeCents = calculatePlatformFeeCents(subtotal, platformFeeRates);

  // Add platform fee as line item if > 0
  if (platformFeeCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: platformFeeCents,
        product_data: {
          // MYK9-229: "processing fee" implied the WHOLE amount was payment
          // processing. It is not — part is Stripe's card processing and part
          // is myK9Show's. Deliberately still ONE line: Stripe's exact fee is
          // unknown until the payment settles, so splitting it here would bake
          // an ESTIMATE into a payment receipt as though it were exact. The
          // computed split belongs in the cart and on /fees, both labelled
          // approximate; the receipt states only what was actually charged.
          name: 'Service fee',
          description: 'Card processing and myK9Show',
        },
      },
      quantity: 1,
    });
  }

  // Create checkout session. Stripe pages default to 24h payable; an app
  // cart lives ~30 min — without clamping, a user could pay a page whose
  // cart expired hours earlier (round-12 P1). Stripe's MINIMUM expires_at is
  // 30 minutes measured at THEIR clock on arrival — an exact +30:00 computed
  // before the network hop gets rejected as under the minimum (round-15 P1).
  // 31 minutes buys the buffer; the cart is then aligned below to the expiry
  // Stripe actually RETURNS, so page and cart still die at the same instant.
  const sessionExpiresAtEpoch = Math.floor(Date.now() / 1000) + 31 * 60;
  const resolution = await resolveCheckoutSession({
    priorSessionId: cart.stripe_checkout_session_id,
    expectedAmountCents: subtotal + platformFeeCents,
    sessions: stripe.checkout.sessions,
    createReplacement: () =>
      stripe.checkout.sessions.create({
        customer: customerId,
        line_items: lineItems,
        mode: 'payment',
        // INTENT: card-only is deliberate (money-path contract in
        // moneyPathCloseout.source.test.ts). Asynchronous methods (ACH,
        // Klarna, ...) complete Checkout with payment_status 'unpaid' and
        // settle later, which decideFreshSessionGate refuses. Apple Pay and
        // Google Pay ride on 'card' in hosted Checkout, so this pin does
        // NOT exclude wallets — do not remove it to "enable" them.
        payment_method_types: ['card'],
        expires_at: sessionExpiresAtEpoch,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          cart_id: cart_id,
          type: 'entry',
          ...stampPlatformFeeRates(platformFeeRates),
        },
        payment_intent_data: {
          statement_descriptor_suffix: formatStatementDescriptorSuffix(showFees.name),
          metadata: {
            cart_id: cart_id,
            type: 'entry',
          },
        },
      }),
  });

  if (resolution.kind === 'blocked') {
    const diagnostic = `Checkout Session guard blocked cart ${cart_id} (${resolution.reason}): ${resolution.diagnostic}`;
    if (resolution.status === 503) {
      console.error(diagnostic);
    } else {
      console.log(diagnostic);
    }
    return corsResponse(corsHeaders, { error: resolution.error }, resolution.status);
  }
  if (resolution.reused) {
    console.log(`Reusing open checkout session ${resolution.session.id} for cart ${cart_id}`);
    return corsResponse(corsHeaders, {
      sessionId: resolution.session.id,
      url: resolution.session.url,
    });
  }
  if (resolution.expiredSessionId) {
    console.log(
      `Expired stale checkout session ${resolution.expiredSessionId} (cart ${cart_id} changed)`
    );
  }
  const session = resolution.session;

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
      corsHeaders,
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
    return corsResponse(corsHeaders, { error: 'Could not start checkout. Please try again.' }, 500);
  }

  console.log(`Created entry checkout session ${session.id} for cart ${cart_id}`);
  return corsResponse(corsHeaders, { sessionId: session.id, url: session.url });
}

/**
 * Handle subscription checkout
 */
async function handleSubscriptionCheckout(
  corsHeaders: Record<string, string>,
  request: SubscriptionCheckoutRequest,
  customerId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Response> {
  const { price_id } = request;

  if (!price_id) {
    return corsResponse(corsHeaders, { error: 'Missing price_id for subscription checkout' }, 400);
  }

  // Validate price_id against allowlist (SA-024)
  if (!VALID_PRICE_IDS.has(price_id)) {
    return corsResponse(corsHeaders, { error: 'Invalid price_id' }, 400);
  }

  // Pre-flight: reject if the customer already has an active subscription.
  // Without this guard, multi-tab or direct-call scenarios create duplicate
  // Stripe subscriptions; syncSubscriptionFromStripe's limit:1 query may then
  // sync the wrong one and silently downgrade the user.
  const existingActive = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  });
  if (existingActive.data.length > 0) {
    return corsResponse(
      corsHeaders,
      {
        error: 'You already have an active subscription. Visit your account settings to manage it.',
      },
      400
    );
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: price_id, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'subscription',
    },
  });

  console.log(`Created subscription checkout session ${session.id}`);
  return corsResponse(corsHeaders, { sessionId: session.id, url: session.url });
}

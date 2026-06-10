import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { buildEntryInsert, extractPaymentIntentId } from '../_shared/entryFromCartItem.ts';
import { accountToRowPatch } from '../_shared/connectAccountMapper.ts';
import { parsePremiumPriceIds, priceIdToTier } from '../_shared/premiumPrices.ts';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
// Connect-scoped event destination signs with its OWN secret; optional until
// the Connected-accounts destination exists in the dashboard.
const stripeConnectWebhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!stripeSecret || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables');
}

const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'myK9Show',
    version: '1.0.0',
  },
});

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async req => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('No signature found', { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await verifyWithEitherSecret(body, signature);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Webhook signature verification failed: ${errorMessage}`);
      return new Response(`Webhook signature verification failed: ${errorMessage}`, {
        status: 400,
      });
    }

    // Process event asynchronously
    EdgeRuntime.waitUntil(handleEvent(event));

    return Response.json({ received: true });
  } catch (error: unknown) {
    console.error('Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errorMessage }, { status: 500 });
  }
});

// Platform-scoped and Connect-scoped destinations sign with different secrets;
// try the platform secret first, then the Connect secret when configured.
async function verifyWithEitherSecret(body: string, signature: string): Promise<Stripe.Event> {
  try {
    return await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
  } catch (platformError) {
    if (!stripeConnectWebhookSecret) throw platformError;
    // Log the platform-secret failure so a misconfigured PRIMARY secret isn't
    // masked by the Connect-secret error when both verifications fail.
    console.log(
      `Platform-secret verification failed (${platformError instanceof Error ? platformError.message : 'unknown'}); trying Connect secret`
    );
    return await stripe.webhooks.constructEventAsync(body, signature, stripeConnectWebhookSecret);
  }
}

async function handleEvent(event: Stripe.Event) {
  console.log(`Processing event: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(event.data.object as Stripe.Subscription);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;

    case 'account.updated':
      await handleAccountUpdated(event.data.object as Stripe.Account);
      break;

    case 'account.application.deauthorized':
      // data.object is the Application; the connected account id rides on event.account
      await handleAccountDeauthorized(event.account ?? undefined);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

/**
 * Reconciliation backstop for refunds issued OUTSIDE stripe-refund-entry
 * (e.g. the Stripe dashboard). A payment intent can cover a whole cart, so a
 * dashboard refund can't be attributed to a single entry — mark the order and
 * log loudly for manual entry-level reconciliation. Refunds from
 * stripe-refund-entry carry entry_id metadata and were already recorded.
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const refunds = charge.refunds?.data ?? [];
  const fromRefundEntry = refunds.some(r => r.metadata?.entry_id);
  if (fromRefundEntry) {
    console.log(`charge.refunded for ${charge.id} originated from stripe-refund-entry — already recorded`);
    return;
  }

  const paymentIntentId = extractPaymentIntentId(charge.payment_intent);
  if (!paymentIntentId) {
    console.error(`charge.refunded for ${charge.id} has no payment intent — cannot reconcile`);
    return;
  }

  // Idempotent: re-delivery (or a second partial refund) re-applies the same state.
  const { data, error } = await supabase
    .from('stripe_orders')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .select('id, order_type');

  if (error) {
    console.error(`Error marking order refunded for ${paymentIntentId}:`, error);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`charge.refunded for ${paymentIntentId} matched no order — ignoring`);
    return;
  }
  console.error(
    `RECONCILE: dashboard refund detected for ${paymentIntentId} (order ${data[0].id}, type ${data[0].order_type}). ` +
      `Entry-level refund columns were NOT updated — reconcile manually or re-issue via the app's refund dialog.`
  );
}

/**
 * Mirror a connected account's onboarding/payout flags onto club_stripe_accounts.
 */
async function handleAccountUpdated(account: Stripe.Account) {
  const patch = accountToRowPatch(account);
  const { data, error } = await supabase
    .from('club_stripe_accounts')
    .update(patch)
    .eq('stripe_account_id', account.id)
    .select('id');

  if (error) {
    console.error(`Error updating club_stripe_accounts for ${account.id}:`, error);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`account.updated for ${account.id} matched no club — ignoring`);
    return;
  }
  console.log(
    `Connect account ${account.id}: onboarding_complete=${patch.onboarding_complete}, payouts_enabled=${patch.payouts_enabled}`
  );
}

/**
 * A club disconnected the platform from their Stripe account: stop payouts.
 */
async function handleAccountDeauthorized(accountId: string | undefined) {
  if (!accountId) {
    console.error('account.application.deauthorized without event.account — cannot map to a club');
    return;
  }
  const { error } = await supabase
    .from('club_stripe_accounts')
    .update({ onboarding_complete: false, payouts_enabled: false })
    .eq('stripe_account_id', accountId);

  if (error) {
    console.error(`Error disabling deauthorized account ${accountId}:`, error);
    return;
  }
  console.log(`Connect account ${accountId} deauthorized — payouts disabled`);
}

/**
 * Handle checkout.session.completed
 * Routes to appropriate handler based on checkout type
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const checkoutType = session.metadata?.type;
  console.log(`Checkout completed: ${session.id}, type: ${checkoutType}`);

  if (checkoutType === 'entry') {
    await handleEntryPaymentCompleted(session);
  } else if (session.mode === 'subscription') {
    await handleSubscriptionCheckoutCompleted(session);
  } else if (session.mode === 'payment') {
    await handleOneTimePaymentCompleted(session);
  }
}

/**
 * Handle entry payment completion
 * - Updates cart status
 * - Creates actual entries from cart items
 * - Creates stripe_orders record
 */
async function handleEntryPaymentCompleted(session: Stripe.Checkout.Session) {
  const cartId = session.metadata?.cart_id;
  if (!cartId) {
    console.error('No cart_id in session metadata');
    return;
  }

  console.log(`Processing entry payment for cart: ${cartId}`);

  // Get cart with items
  const { data: cart, error: cartError } = await supabase
    .from('entry_carts')
    .select(
      `
      *,
      exhibitor:exhibitor_profiles(id, person_id),
      items:entry_cart_items(
        id,
        dog_id,
        class_id,
        handler_id,
        entry_fee_cents,
        jump_height,
        special_requests
      )
    `
    )
    .eq('id', cartId)
    .single();

  if (cartError || !cart) {
    console.error('Cart not found:', cartError);
    return;
  }

  // Idempotency latch: atomically claim the cart by flipping active → submitted.
  // Stripe gets a 200 before this handler runs (EdgeRuntime.waitUntil), so a
  // re-delivered event would otherwise create duplicate paid entries — which
  // the payout cron would then pay the club for twice.
  const { data: claimed, error: claimError } = await supabase
    .from('entry_carts')
    .update({ status: 'submitted' })
    .eq('id', cartId)
    .eq('status', 'active')
    .select('id');

  if (claimError) {
    console.error(`CRITICAL: failed to claim cart ${cartId} after payment:`, claimError);
    return;
  }
  if (!claimed || claimed.length === 0) {
    console.log(`Cart ${cartId} already processed (duplicate event delivery) — skipping`);
    return;
  }

  // Get stripe_customers record for this person
  const { data: stripeCustomer } = await supabase
    .from('stripe_customers')
    .select('id')
    .eq('person_id', cart.exhibitor.person_id)
    .single();

  // Resolve each class's trial: entries carry denormalized show_id/trial_id
  // FKs that nothing else populates, and the payout calc + refund join +
  // secretary entries list all filter on show_id.
  const classIds = [...new Set(cart.items.map((i: { class_id: string }) => i.class_id))];
  const { data: classRows } = await supabase
    .from('classes')
    .select('id, trial_id')
    .in('id', classIds);
  const trialByClass = new Map<string, string | null>(
    (classRows ?? []).map((c: { id: string; trial_id: string | null }) => [c.id, c.trial_id])
  );

  // Create entries from cart items, stamping the payment intent as the
  // per-entry refund key for stripe-refund-entry.
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  const entryIds: string[] = [];
  for (const item of cart.items) {
    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .insert(
        buildEntryInsert(item, paymentIntentId, new Date().toISOString(), {
          showId: cart.show_id,
          trialId: trialByClass.get(item.class_id) ?? null,
        })
      )
      .select('id')
      .single();

    if (entryError) {
      console.error(`Error creating entry for cart item ${item.id}:`, entryError);
      continue;
    }

    if (entry) {
      entryIds.push(entry.id);
    }
  }

  if (entryIds.length !== cart.items.length) {
    // Stripe already received its 200, so it will NOT retry this event: the
    // exhibitor has paid for entries that do not exist. Surface loudly.
    console.error(
      `CRITICAL: cart ${cartId} paid (${paymentIntentId ?? 'no intent'}) but only ` +
        `${entryIds.length}/${cart.items.length} entries were created — manual reconciliation required`
    );
  }

  console.log(`Created ${entryIds.length} entries from cart ${cartId}`);

  // Create stripe_orders record
  const { error: orderError } = await supabase.from('stripe_orders').insert({
    customer_id: stripeCustomer?.id || null,
    stripe_payment_intent_id: paymentIntentId,
    stripe_checkout_session_id: session.id,
    // 2020-03-02 API payloads (this account's pinned version) lack amount_total;
    // the cart snapshots the same number at checkout time.
    amount_cents: session.amount_total ?? cart.total_cents ?? 0,
    currency: session.currency || 'usd',
    status: 'succeeded',
    order_type: 'entry',
    metadata: {
      cart_id: cartId,
      entry_count: entryIds.length,
    },
    show_id: cart.show_id,
    entry_ids: entryIds,
    paid_at: new Date().toISOString(),
  });

  if (orderError) {
    console.error('Error creating stripe_orders record:', orderError);
  }

  console.log(`Entry payment completed for cart ${cartId}, created order`);

  // Send confirmation email
  await sendEntryConfirmationEmail(cart, entryIds, session);
}

/**
 * Send entry confirmation email via send-email function
 */
async function sendEntryConfirmationEmail(
  cart: {
    show_id: string;
    exhibitor: { id: string; person_id: string };
    items: Array<{
      dog_id: string;
      class_id: string;
      entry_fee_cents: number;
    }>;
    subtotal_cents: number;
    platform_fee_cents: number;
    total_cents: number;
  },
  entryIds: string[],
  session: Stripe.Checkout.Session
) {
  try {
    // Get exhibitor email and name
    const { data: person } = await supabase
      .from('people')
      .select('email, first_name, last_name')
      .eq('id', cart.exhibitor.person_id)
      .single();

    if (!person?.email) {
      console.error('No email found for exhibitor');
      return;
    }

    // Get show details
    const { data: show } = await supabase
      .from('shows')
      .select('name, start_date, end_date, venue_name, city, state')
      .eq('id', cart.show_id)
      .single();

    if (!show) {
      console.error('Show not found');
      return;
    }

    // Get entry details with dog and class info
    const { data: entries } = await supabase
      .from('entries')
      .select(
        `
        id,
        entry_fee_cents,
        dogs:dog_id (name, call_name),
        classes:class_id (name, level)
      `
      )
      .in('id', entryIds);

    if (!entries || entries.length === 0) {
      console.error('No entries found for confirmation email');
      return;
    }

    // Format show date
    const startDate = new Date(show.start_date);
    const endDate = show.end_date ? new Date(show.end_date) : null;
    let showDate = startDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (endDate && endDate.getTime() !== startDate.getTime()) {
      showDate += ` - ${endDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`;
    }

    // Format location
    const showLocation = [show.venue_name, show.city, show.state].filter(Boolean).join(', ');

    // Build email payload
    const emailData = {
      type: 'entry_confirmation',
      to: person.email,
      exhibitorName: `${person.first_name} ${person.last_name}`,
      showName: show.name,
      showDate,
      showLocation: showLocation || undefined,
      entries: entries.map(e => ({
        dogName:
          (e.dogs as { call_name?: string; name: string })?.call_name ||
          (e.dogs as { name: string })?.name ||
          'Unknown',
        className: (e.classes as { name: string })?.name || 'Unknown',
        classLevel: (e.classes as { level?: string })?.level || undefined,
        entryFee: e.entry_fee_cents,
      })),
      subtotal: cart.subtotal_cents || session.amount_subtotal || 0,
      platformFee: cart.platform_fee_cents || 0,
      total: cart.total_cents || session.amount_total || 0,
      orderId: session.id,
    };

    // Call send-email function
    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send confirmation email:', error);
    } else {
      console.log(`Confirmation email sent to ${person.email}`);
    }
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    // Don't throw - email failure shouldn't fail the payment processing
  }
}

/**
 * Handle subscription checkout completion
 */
async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  if (!customerId) {
    console.error('No customer ID in session');
    return;
  }

  // Sync subscription from Stripe
  await syncSubscriptionFromStripe(customerId);
}

/**
 * Handle one-time payment completion
 */
async function handleOneTimePaymentCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;

  // Get stripe_customers record
  const { data: stripeCustomer } = await supabase
    .from('stripe_customers')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  // Create stripe_orders record
  const { error: orderError } = await supabase.from('stripe_orders').insert({
    customer_id: stripeCustomer?.id || null,
    stripe_payment_intent_id:
      typeof session.payment_intent === 'string' ? session.payment_intent : null,
    stripe_checkout_session_id: session.id,
    amount_cents: session.amount_total || 0,
    currency: session.currency || 'usd',
    status: 'succeeded',
    order_type: 'payment',
    metadata: session.metadata || {},
    paid_at: new Date().toISOString(),
  });

  if (orderError) {
    console.error('Error creating stripe_orders record:', orderError);
  }

  console.log(`One-time payment completed: ${session.id}`);
}

/**
 * Handle subscription changes (created, updated, deleted)
 */
async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  console.log(`Subscription ${subscription.status} for customer: ${customerId}`);

  await syncSubscriptionFromStripe(customerId);
}

/**
 * Handle successful invoice payment (subscription renewal)
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  console.log(`Invoice paid for customer: ${customerId}`);
  await syncSubscriptionFromStripe(customerId);
}

/**
 * Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  console.log(`Invoice payment failed for customer: ${customerId}`);
  await syncSubscriptionFromStripe(customerId);
}

/**
 * Sync subscription data from Stripe to database
 * Updates both stripe_subscriptions and exhibitor_profiles
 */
async function syncSubscriptionFromStripe(stripeCustomerId: string) {
  try {
    // Get stripe_customers record
    const { data: stripeCustomer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('id, person_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (customerError || !stripeCustomer) {
      console.error('Stripe customer not found in database:', customerError);
      return;
    }

    // Fetch subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      console.log(`No subscriptions found for customer: ${stripeCustomerId}`);

      // Update to no subscription state
      await supabase.from('stripe_subscriptions').upsert(
        {
          customer_id: stripeCustomer.id,
          stripe_subscription_id: `none_${stripeCustomerId}`,
          status: 'none',
        },
        {
          onConflict: 'customer_id',
        }
      );

      // Reset exhibitor profile subscription
      await supabase
        .from('exhibitor_profiles')
        .update({
          subscription_tier: 'free',
          subscription_expires_at: null,
        })
        .eq('person_id', stripeCustomer.person_id);

      return;
    }

    const subscription = subscriptions.data[0];
    const priceId = subscription.items.data[0]?.price.id;

    // Map price ID to subscription tier
    const subscriptionTier = mapPriceToTier(priceId);

    // Upsert stripe_subscriptions
    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: stripeCustomer.id,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancelled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
      },
      {
        onConflict: 'stripe_subscription_id',
      }
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      return;
    }

    // Update exhibitor_profiles subscription tier
    const isActive = ['active', 'trialing'].includes(subscription.status);
    const { error: profileError } = await supabase
      .from('exhibitor_profiles')
      .update({
        subscription_tier: isActive ? subscriptionTier : 'free',
        subscription_expires_at: isActive
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      })
      .eq('person_id', stripeCustomer.person_id);

    if (profileError) {
      console.error('Error updating exhibitor profile:', profileError);
    }

    console.log(
      `Synced subscription for customer ${stripeCustomerId}: ${subscription.status}, tier: ${subscriptionTier}`
    );
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${stripeCustomerId}:`, error);
    throw error;
  }
}

/**
 * Map Stripe price ID to subscription tier
 */
// INTENT: Two tiers only — Free and Premium. Every configured price ID maps to
// 'premium'. Ids come from the PREMIUM_PRICE_IDS secret (comma-separated;
// sandbox + live + annual coexist) with the original live ids as fallback so a
// missing secret never downgrades a paying subscriber.
const LIVE_PREMIUM_PRICE_IDS = [
  'price_1RHz4VAtHgBcw875bF7McPNd', // Was "Excellent" (clubs) — now Premium
  'price_1RHz3bAtHgBcw875o2gdNaYW', // Was "Advanced" (exhibitors) — now Premium
];
const premiumPriceIds = parsePremiumPriceIds(
  Deno.env.get('PREMIUM_PRICE_IDS'),
  LIVE_PREMIUM_PRICE_IDS
);

function mapPriceToTier(priceId: string | undefined): 'free' | 'premium' {
  return priceIdToTier(priceId, premiumPriceIds);
}

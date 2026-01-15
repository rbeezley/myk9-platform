import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
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

Deno.serve(async (req) => {
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
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Webhook signature verification failed: ${errorMessage}`);
      return new Response(`Webhook signature verification failed: ${errorMessage}`, { status: 400 });
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

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
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
    .select(`
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
    `)
    .eq('id', cartId)
    .single();

  if (cartError || !cart) {
    console.error('Cart not found:', cartError);
    return;
  }

  // Get stripe_customers record for this person
  const { data: stripeCustomer } = await supabase
    .from('stripe_customers')
    .select('id')
    .eq('person_id', cart.exhibitor.person_id)
    .single();

  // Create entries from cart items
  const entryIds: string[] = [];
  for (const item of cart.items) {
    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .insert({
        dog_id: item.dog_id,
        class_id: item.class_id,
        handler_id: item.handler_id,
        entry_status: 'paid',
        payment_status: 'paid',
        entry_fee_cents: item.entry_fee_cents,
        jump_height: item.jump_height,
        notes: item.special_requests,
        // Source tracking
        source: 'online',
        submitted_at: new Date().toISOString(),
      })
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

  console.log(`Created ${entryIds.length} entries from cart ${cartId}`);

  // Update cart status
  const { error: updateCartError } = await supabase
    .from('entry_carts')
    .update({ status: 'submitted' })
    .eq('id', cartId);

  if (updateCartError) {
    console.error('Error updating cart status:', updateCartError);
  }

  // Create stripe_orders record
  const { error: orderError } = await supabase
    .from('stripe_orders')
    .insert({
      customer_id: stripeCustomer?.id || null,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      stripe_checkout_session_id: session.id,
      amount_cents: session.amount_total || 0,
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
  const { error: orderError } = await supabase
    .from('stripe_orders')
    .insert({
      customer_id: stripeCustomer?.id || null,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
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
      await supabase
        .from('stripe_subscriptions')
        .upsert({
          customer_id: stripeCustomer.id,
          stripe_subscription_id: `none_${stripeCustomerId}`,
          status: 'none',
        }, {
          onConflict: 'customer_id',
        });

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
    const { error: subError } = await supabase
      .from('stripe_subscriptions')
      .upsert({
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
      }, {
        onConflict: 'stripe_subscription_id',
      });

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

    console.log(`Synced subscription for customer ${stripeCustomerId}: ${subscription.status}, tier: ${subscriptionTier}`);
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${stripeCustomerId}:`, error);
    throw error;
  }
}

/**
 * Map Stripe price ID to subscription tier
 */
function mapPriceToTier(priceId: string | undefined): 'free' | 'premium' | 'pro' {
  if (!priceId) return 'free';

  // Map based on known price IDs from stripe-config.ts
  const priceMapping: Record<string, 'premium' | 'pro'> = {
    'price_1RHz4VAtHgBcw875bF7McPNd': 'pro',      // Excellent (clubs)
    'price_1RHz3bAtHgBcw875o2gdNaYW': 'premium',  // Advanced (exhibitors)
  };

  return priceMapping[priceId] || 'premium';
}

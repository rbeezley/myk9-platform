import { supabase } from './supabase';
import { products, annualPriceId } from '../stripe-config';

/**
 * Create a Stripe checkout session for subscription or one-time payment
 */
export async function createCheckoutSession(priceId: string, mode: 'payment' | 'subscription') {
  // The annual price lives outside `products` (env-driven, optional); without
  // this branch the PricingPage annual toggle could never check out (PR #625).
  const isKnownPrice =
    priceId === annualPriceId || Object.values(products).some(p => p.priceId === priceId);

  if (!isKnownPrice) {
    throw new Error('Invalid price ID');
  }

  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: {
      price_id: priceId,
      success_url: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${window.location.origin}/pricing-page`,
      mode,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to create checkout session');
  }

  if (!data?.url) {
    throw new Error('No checkout URL returned');
  }

  window.location.href = data.url;
}

/**
 * Create a Stripe checkout session for entry cart payment
 *
 * @param cartId - The ID of the entry cart to checkout
 * @returns Promise that resolves when redirect happens, or throws on error
 */
export async function createEntryCheckoutSession(cartId: string): Promise<void> {
  if (!cartId) {
    throw new Error('Cart ID is required');
  }

  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: {
      mode: 'entry',
      cart_id: cartId,
      success_url: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${window.location.origin}/checkout/cancel`,
    },
  });

  if (error) {
    if (error.message?.includes('401') || error.message?.includes('auth')) {
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(error.message || 'Failed to create checkout session');
  }

  if (!data?.url) {
    throw new Error('No checkout URL returned from server');
  }

  // Redirect to Stripe Checkout
  window.location.href = data.url;
}

/**
 * Verify a completed checkout session
 * Used on the success page to confirm payment and get order details
 *
 * @param sessionId - The Stripe checkout session ID
 * @returns Order details including entry IDs
 */
export async function verifyCheckoutSession(sessionId: string): Promise<{
  success: boolean;
  orderId?: string;
  entryIds?: string[];
  showId?: string;
  showName?: string;
  totalAmount?: number;
  confirmationNumber?: string;
  error?: string;
}> {
  if (!sessionId) {
    return { success: false, error: 'No session ID provided' };
  }

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;

  if (!accessToken) {
    return { success: false, error: 'Please sign in to view order details' };
  }

  // Query the stripe_orders table for this checkout session
  const { data: order, error } = await supabase
    .from('stripe_orders')
    .select(
      `
      id,
      status,
      amount_cents,
      entry_ids,
      show_id,
      paid_at,
      stripe_payment_intent_id,
      shows:show_id (name),
      enrollment:enrollment_id (confirmation_number)
    `
    )
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (error || !order) {
    // Order might not be created yet (webhook delay)
    return { success: false, error: 'Order not found. It may still be processing.' };
  }

  if (order.status !== 'succeeded') {
    return { success: false, error: `Payment status: ${order.status}` };
  }

  const enrollment = order.enrollment as { confirmation_number: string } | null;
  // Online cart orders have no enrollment record; the payment intent id is the
  // reference that support, refunds, and the Stripe dashboard all pivot on.
  const confirmationNumber = enrollment?.confirmation_number || order.stripe_payment_intent_id;

  return {
    success: true,
    orderId: order.id,
    entryIds: order.entry_ids || [],
    ...(order.show_id != null && { showId: order.show_id }),
    ...(order.shows && { showName: (order.shows as { name: string }).name }),
    ...(order.amount_cents != null && { totalAmount: order.amount_cents }),
    ...(confirmationNumber && { confirmationNumber }),
  };
}

import { supabase } from './supabase';
import { products } from '../stripe-config';

/**
 * Create a Stripe checkout session for subscription or one-time payment
 */
export async function createCheckoutSession(priceId: string, mode: 'payment' | 'subscription') {
  const product = Object.values(products).find((p) => p.priceId === priceId);

  if (!product) {
    throw new Error('Invalid price ID');
  }

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;

  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      price_id: priceId,
      success_url: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${window.location.origin}/pricing`,
      mode,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create checkout session');
  }

  const { url } = await response.json();

  if (!url) {
    throw new Error('No checkout URL returned');
  }

  window.location.href = url;
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

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;

  if (!accessToken) {
    throw new Error('Please sign in to complete checkout');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      mode: 'entry',
      cart_id: cartId,
      success_url: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${window.location.origin}/checkout/cancel`,
    }),
  });

  if (!response.ok) {
    const error = await response.json();

    // Handle specific error cases
    if (response.status === 401) {
      throw new Error('Session expired. Please sign in again.');
    }
    if (response.status === 404) {
      throw new Error('Cart not found or has expired.');
    }
    if (response.status === 400) {
      throw new Error(error.message || 'Invalid cart data.');
    }

    throw new Error(error.message || 'Failed to create checkout session');
  }

  const data = await response.json();

  if (!data.url) {
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
    .select(`
      id,
      status,
      amount_cents,
      entry_ids,
      show_id,
      paid_at,
      shows:show_id (name)
    `)
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (error || !order) {
    // Order might not be created yet (webhook delay)
    return { success: false, error: 'Order not found. It may still be processing.' };
  }

  if (order.status !== 'succeeded') {
    return { success: false, error: `Payment status: ${order.status}` };
  }

  return {
    success: true,
    orderId: order.id,
    entryIds: order.entry_ids || [],
    showId: order.show_id ?? undefined,
    showName: (order.shows as { name: string } | null)?.name,
    totalAmount: order.amount_cents ?? undefined,
  };
}
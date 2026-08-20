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
      // /subscription is the registered route — `/success` never existed and
      // 404'd every new subscriber (2026-06-10 walkthrough finding).
      success_url: `${window.location.origin}/subscription?checkout=success`,
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
 * A checkout failure that carries the server's HTTP status alongside its
 * message, so callers can react to the specific failure (re-hydrating the cart
 * on a 409 re-pricing) instead of showing one generic retry.
 */
export class CheckoutSessionError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'CheckoutSessionError';
    this.status = status;
  }
}

/**
 * Pull the status and server-authored message out of a supabase-js function
 * error. Returns nulls rather than throwing: a failure to parse the failure
 * must never replace the original error with a parsing error.
 */
async function readEdgeFunctionError(
  error: unknown
): Promise<{ status: number | null; message: string | null }> {
  const context = (error as { context?: unknown })?.context;
  if (!context || typeof context !== 'object') return { status: null, message: null };

  const response = context as { status?: number; json?: () => Promise<unknown> };
  const status = typeof response.status === 'number' ? response.status : null;

  if (typeof response.json !== 'function') return { status, message: null };

  try {
    const body = (await response.json()) as { error?: unknown } | null;
    const message = typeof body?.error === 'string' && body.error.trim() ? body.error : null;
    return { status, message };
  } catch {
    return { status, message: null };
  }
}

/**
 * Create a Stripe checkout session for entry cart payment
 *
 * @param cartId - The ID of the entry cart to checkout
 * @returns Promise that resolves when redirect happens, or throws on error
 */
export async function createEntryCheckoutSession(
  cartId: string,
  options?: { splitCheckoutId?: string }
): Promise<void> {
  if (!cartId) {
    throw new Error('Cart ID is required');
  }

  const successUrl = new URL(`${window.location.origin}/checkout/success`);
  successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');

  if (options?.splitCheckoutId) {
    successUrl.searchParams.set('split', options.splitCheckoutId);
  }

  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: {
      mode: 'entry',
      cart_id: cartId,
      success_url: successUrl.toString(),
      cancel_url: `${window.location.origin}/checkout/cancel`,
    },
  });

  if (error) {
    // supabase.functions.invoke reports every non-2xx as a FunctionsHttpError
    // whose `.message` is the generic "Edge Function returned a non-2xx status
    // code" - the server's actual message lives in the JSON body, reachable
    // only through `.context`. Without reading it, three genuinely different
    // and genuinely actionable failures (409 fees were re-priced, 403 the club
    // has no payout account, 401 session expired) all reached the exhibitor as
    // one dead-end "try again", and the 409 case retried forever because the
    // client kept re-sending the same stale cart.
    const parsed = await readEdgeFunctionError(error);

    if (
      parsed.status === 401 ||
      error.message?.includes('401') ||
      error.message?.includes('auth')
    ) {
      throw new CheckoutSessionError('Session expired. Please sign in again.', 401);
    }
    if (parsed.message) {
      throw new CheckoutSessionError(parsed.message, parsed.status);
    }
    throw new CheckoutSessionError(
      error.message || 'Failed to create checkout session',
      parsed.status
    );
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
export type CheckoutVerificationResult =
  | {
      success: true;
      verificationStatus: 'succeeded';
      checkoutOutcome?: 'paid_entries' | 'full_overflow_refund';
      orderId?: string;
      entryIds?: string[];
      showId?: string;
      showName?: string;
      cartId?: string;
      totalAmountCents?: number;
      refundAmount?: number;
      refundStatus?: 'issued' | 'processing';
      confirmationNumber?: string;
    }
  | {
      success: false;
      verificationStatus: 'processing' | 'not_found' | 'failed' | 'refunded' | 'unavailable';
      error: string;
    };

function getOrderCartId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const cartId = (metadata as Record<string, unknown>).cart_id;
  return typeof cartId === 'string' ? cartId : undefined;
}

export async function verifyCheckoutSession(
  sessionId: string
): Promise<CheckoutVerificationResult> {
  if (!sessionId) {
    return {
      success: false,
      verificationStatus: 'unavailable',
      error: 'No checkout session was provided.',
    };
  }

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;

  if (!accessToken) {
    return {
      success: false,
      verificationStatus: 'unavailable',
      error: 'Please sign in to check your payment status.',
    };
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
      refunded_at,
      stripe_payment_intent_id,
      metadata,
      shows:show_id (name),
      enrollment:enrollment_id (confirmation_number)
    `
    )
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (!order) {
    if (!error || error.code === 'PGRST116') {
      // No visible order row. Right after payment this usually means the
      // webhook hasn't written it yet — but it is ALSO what a viewer signed
      // in to the wrong account (RLS hides the row) or a bogus session id
      // sees, and those never resolve. Report it distinctly so the page can
      // stop calling permanent states "still processing" (MYK9-207).
      return {
        success: false,
        verificationStatus: 'not_found',
        error: "We can't find this payment on this account yet.",
      };
    }

    return {
      success: false,
      verificationStatus: 'unavailable',
      error: 'We could not check your payment status right now.',
    };
  }

  if (error) {
    return {
      success: false,
      verificationStatus: 'unavailable',
      error: 'We could not check your payment status right now.',
    };
  }

  const overflowRefund = getFullOverflowRefund(order.metadata);
  if (overflowRefund && (order.status === 'refunded' || order.status === 'succeeded')) {
    const cartId = getOrderCartId(order.metadata);
    return {
      success: true,
      verificationStatus: 'succeeded',
      checkoutOutcome: 'full_overflow_refund',
      orderId: order.id,
      entryIds: [],
      ...(order.show_id != null && { showId: order.show_id }),
      ...(order.shows && { showName: (order.shows as { name: string }).name }),
      ...(cartId !== undefined && { cartId }),
      ...(overflowRefund.amountCents != null && { refundAmount: overflowRefund.amountCents }),
      refundStatus: order.status === 'refunded' ? 'issued' : 'processing',
      ...(order.stripe_payment_intent_id && { confirmationNumber: order.stripe_payment_intent_id }),
    };
  }

  if (order.status === 'pending' || order.status === 'processing') {
    return {
      success: false,
      verificationStatus: 'processing',
      error: 'Your payment is still processing.',
    };
  }

  if (order.status === 'refunded') {
    return {
      success: false,
      verificationStatus: 'refunded',
      error: 'Your payment was refunded.',
    };
  }

  if (order.status === 'failed' || order.status === 'cancelled') {
    const terminalMessage =
      order.status === 'cancelled'
        ? 'Your payment was cancelled.'
        : 'Your payment was not completed.';

    return {
      success: false,
      verificationStatus: 'failed',
      error: terminalMessage,
    };
  }

  if (order.status !== 'succeeded') {
    return {
      success: false,
      verificationStatus: 'unavailable',
      error: 'We could not confirm your payment status right now.',
    };
  }

  const enrollment = order.enrollment as { confirmation_number: string } | null;
  // Online cart orders have no enrollment record; the payment intent id is the
  // reference that support, refunds, and the Stripe dashboard all pivot on.
  const confirmationNumber = enrollment?.confirmation_number || order.stripe_payment_intent_id;
  const cartId = getOrderCartId(order.metadata);

  return {
    success: true,
    verificationStatus: 'succeeded',
    checkoutOutcome: 'paid_entries',
    orderId: order.id,
    entryIds: order.entry_ids || [],
    ...(order.show_id != null && { showId: order.show_id }),
    ...(order.shows && { showName: (order.shows as { name: string }).name }),
    ...(cartId !== undefined && { cartId }),
    ...(order.amount_cents != null && { totalAmountCents: order.amount_cents }),
    ...(confirmationNumber && { confirmationNumber }),
  };
}

function getFullOverflowRefund(metadata: unknown): { amountCents: number | null } | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const rawRefund = (metadata as { overflow_refund?: unknown }).overflow_refund;
  if (!rawRefund || typeof rawRefund !== 'object') return null;

  const refund = rawRefund as { action?: unknown; reason?: unknown; amount_cents?: unknown };
  if (refund.action !== 'refund' || refund.reason !== 'full_make_whole') return null;

  return {
    amountCents: typeof refund.amount_cents === 'number' ? refund.amount_cents : null,
  };
}

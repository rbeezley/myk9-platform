// Which Stripe mode a secret key belongs to (MYK9-2187). Stripe issues secret
// keys (sk_) and restricted keys (rk_) in both modes; anything else is unknown
// and every caller fails closed on it, never treating it as test.

export type StripeKeyMode = 'live' | 'test' | 'unknown';

export function stripeKeyMode(stripeSecret: string | null | undefined): StripeKeyMode {
  if (typeof stripeSecret !== 'string') return 'unknown';
  if (stripeSecret.startsWith('sk_live_') || stripeSecret.startsWith('rk_live_')) return 'live';
  if (stripeSecret.startsWith('sk_test_') || stripeSecret.startsWith('rk_test_')) return 'test';
  return 'unknown';
}

/**
 * The livemode flag for a function that cannot run without a known mode.
 * Throws on an unknown key, so the function refuses every request at boot
 * (like a missing secret) instead of reading or writing the wrong mode's rows.
 */
export function requireStripeLivemode(stripeSecret: string | null | undefined): boolean {
  const mode = stripeKeyMode(stripeSecret);
  if (mode === 'unknown') {
    throw new Error(
      'STRIPE_SECRET_KEY is neither a live nor a test key (sk_live_, rk_live_, sk_test_ or rk_test_); refusing to start'
    );
  }
  return mode === 'live';
}

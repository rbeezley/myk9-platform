// Classify a stripe-connect-onboard failure into a SAFE client code (MYK9-2445).
// The catch-all never returns raw Stripe text (it embeds account ids), but the
// client still needs to tell "Stripe is still verifying" and "provider
// unreachable" apart from everything else. Deno-free so vitest can run it; it
// duck-types the Stripe SDK error fields (`type`, `statusCode`) instead of
// importing the class.

export type OnboardErrorCode =
  'stripe_account_unavailable' | 'stripe_unavailable' | 'onboarding_failed';

// Same test the client's capability/inactive copy used on the raw text.
const ACCOUNT_NOT_READY = /capabilit|transfers .*inactive|account .*(inactive|pending|restricted)/i;
const PROVIDER_UNREACHABLE = /rate limit|timeout|timed out|network|connection/i;

const UNREACHABLE_TYPES = new Set(['StripeRateLimitError', 'StripeConnectionError']);

export function classifyOnboardError(error: unknown): OnboardErrorCode {
  const message = error instanceof Error ? error.message : '';
  if (ACCOUNT_NOT_READY.test(message)) return 'stripe_account_unavailable';

  const { type, statusCode } = (error ?? {}) as { type?: unknown; statusCode?: unknown };
  if (typeof type === 'string' && UNREACHABLE_TYPES.has(type)) return 'stripe_unavailable';
  if (type === 'StripeAPIError' && typeof statusCode === 'number' && statusCode >= 500) {
    return 'stripe_unavailable';
  }
  if (PROVIDER_UNREACHABLE.test(message)) return 'stripe_unavailable';
  return 'onboarding_failed';
}

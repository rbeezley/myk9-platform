import { describe, it, expect } from 'vitest';
import { classifyOnboardError } from './classifyOnboardError';

function stripeError(type: string, message: string, statusCode?: number) {
  return Object.assign(new Error(message), { type, statusCode });
}

describe('classifyOnboardError', () => {
  it('maps a capability / inactive account message to stripe_account_unavailable', () => {
    expect(classifyOnboardError(new Error('account capability transfers is inactive'))).toBe(
      'stripe_account_unavailable'
    );
    expect(classifyOnboardError(new Error('The account acct_1 is restricted'))).toBe(
      'stripe_account_unavailable'
    );
  });

  it('maps rate limit and connection Stripe errors to stripe_unavailable', () => {
    expect(classifyOnboardError(stripeError('StripeRateLimitError', 'Too many'))).toBe(
      'stripe_unavailable'
    );
    expect(classifyOnboardError(stripeError('StripeConnectionError', 'socket hang up'))).toBe(
      'stripe_unavailable'
    );
  });

  it('maps a 5xx StripeAPIError to stripe_unavailable but not a 4xx one', () => {
    expect(classifyOnboardError(stripeError('StripeAPIError', 'Internal', 503))).toBe(
      'stripe_unavailable'
    );
    expect(classifyOnboardError(stripeError('StripeAPIError', 'Bad thing', 400))).toBe(
      'onboarding_failed'
    );
  });

  it('maps timeout wording to stripe_unavailable', () => {
    expect(classifyOnboardError(new Error('Request timed out'))).toBe('stripe_unavailable');
  });

  it('returns onboarding_failed for anything else, never raw text', () => {
    expect(classifyOnboardError(new Error('No such customer: cus_123'))).toBe('onboarding_failed');
    expect(classifyOnboardError('boom')).toBe('onboarding_failed');
    expect(classifyOnboardError(null)).toBe('onboarding_failed');
  });
});

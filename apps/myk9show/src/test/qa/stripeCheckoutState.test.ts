import { describe, expect, it } from 'vitest';
import {
  classifyCheckout,
  confirmedUnpaid,
  describeCheckoutState,
  mayRetryPay,
  type CheckoutSnapshot,
} from '../e2e/secretary/stripeCheckoutState';

const QUIET: CheckoutSnapshot = {
  payBusy: false,
  spinnerShown: false,
  errorText: null,
  linkOverlay: false,
  emailFocused: false,
};

describe('classifyCheckout (MYK9-2336)', () => {
  it.each([
    ['processing', { payBusy: true }],
    ['processing', { spinnerShown: true }],
    ['validation-error', { errorText: 'Your card number is incomplete.' }],
    ['link-takeover', { linkOverlay: true }],
    ['link-focus', { emailFocused: true }],
    ['idle', {}],
  ] as const)('%s', (expected, patch) => {
    expect(classifyCheckout({ ...QUIET, ...patch })).toBe(expected);
  });

  it('an error or overlay outranks a stale spinner', () => {
    expect(classifyCheckout({ ...QUIET, spinnerShown: true, errorText: 'Declined' })).toBe(
      'validation-error'
    );
    expect(classifyCheckout({ ...QUIET, spinnerShown: true, linkOverlay: true })).toBe(
      'link-takeover'
    );
  });

  it('retries only a quiet page', () => {
    expect(mayRetryPay('idle')).toBe(true);
    expect(mayRetryPay('link-focus')).toBe(true);
    expect(mayRetryPay('processing')).toBe(false);
    expect(mayRetryPay('validation-error')).toBe(false);
    expect(mayRetryPay('link-takeover')).toBe(false);
  });

  it('names the error text in the failure description', () => {
    const snapshot = { ...QUIET, errorText: 'Your card was declined.' };
    expect(describeCheckoutState('validation-error', snapshot)).toContain(
      'Your card was declined.'
    );
  });
});

describe('confirmedUnpaid (never pay twice)', () => {
  it('is true only when the link is open and Stripe says unpaid', () => {
    expect(confirmedUnpaid({ linkStatus: 'open', sessionPaymentStatus: 'unpaid' })).toBe(true);
  });

  it.each([
    [{ linkStatus: 'paid', sessionPaymentStatus: 'unpaid' }],
    [{ linkStatus: 'open', sessionPaymentStatus: 'paid' }],
    [{ linkStatus: 'open', sessionPaymentStatus: null }],
    [{ linkStatus: null, sessionPaymentStatus: 'unpaid' }],
  ])('is false for %j', evidence => {
    expect(confirmedUnpaid(evidence)).toBe(false);
  });
});

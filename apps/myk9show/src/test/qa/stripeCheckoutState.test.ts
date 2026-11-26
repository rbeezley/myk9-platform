import { describe, expect, it } from 'vitest';
import {
  classifyCheckout,
  confirmedUnpaid,
  describeCheckoutState,
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

  it('names the error text in the failure description', () => {
    const snapshot = { ...QUIET, errorText: 'Your card was declined.' };
    expect(describeCheckoutState('validation-error', snapshot)).toContain(
      'Your card was declined.'
    );
  });
});

describe('confirmedUnpaid (never pay twice)', () => {
  it.each(['requires_payment_method', 'requires_confirmation'])('retries on %s', status => {
    expect(confirmedUnpaid({ paymentIntentStatus: status })).toBe(true);
  });

  it.each(['processing', 'succeeded', 'requires_action', 'requires_capture', 'canceled', null])(
    'never retries on %s',
    status => {
      expect(confirmedUnpaid({ paymentIntentStatus: status })).toBe(false);
    }
  );
});

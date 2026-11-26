import { describe, expect, it } from 'vitest';
import { decidePayFollowUp } from '../e2e/secretary/stripeCheckoutState';

describe('decidePayFollowUp (MYK9-2336, never pay twice)', () => {
  it.each(['processing', 'succeeded'])('waits on %s', status => {
    expect(decidePayFollowUp({ paymentIntentStatus: status })).toBe('wait');
  });

  it.each(['requires_payment_method', 'requires_confirmation'])('retries on %s', status => {
    expect(decidePayFollowUp({ paymentIntentStatus: status })).toBe('retry');
  });

  it.each(['requires_action', 'requires_capture', 'canceled', 'something_new', null])(
    'fails without clicking on %s',
    status => {
      expect(decidePayFollowUp({ paymentIntentStatus: status })).toBe('fail');
    }
  );
});

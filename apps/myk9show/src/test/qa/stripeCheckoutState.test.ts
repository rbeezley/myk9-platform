import { describe, expect, it } from 'vitest';
import {
  decidePayFollowUp,
  describeEvidence,
  type PaymentEvidence,
} from '../e2e/secretary/stripeCheckoutState';

const ok = (
  sessionStatus: string | null,
  paymentStatus: string | null,
  paymentIntentStatus: string | null
): PaymentEvidence => ({ read: 'ok', sessionStatus, paymentStatus, paymentIntentStatus });

describe('decidePayFollowUp (MYK9-2336, never pay twice)', () => {
  it('waits, never clicks, when the read failed or timed out', () => {
    expect(decidePayFollowUp({ read: 'failed' })).toBe('wait');
  });

  it.each([
    ['complete', 'paid', 'succeeded'],
    ['complete', 'paid', null],
    ['complete', 'unpaid', null],
    ['open', 'paid', null],
    ['open', 'paid', 'succeeded'],
  ])('waits when the session is %s / %s / PI %s', (s, p, i) => {
    expect(decidePayFollowUp(ok(s, p, i))).toBe('wait');
  });

  it.each(['expired'])('fails when the session is %s', s => {
    expect(decidePayFollowUp(ok(s, 'unpaid', null))).toBe('fail');
    expect(decidePayFollowUp(ok(s, 'unpaid', 'requires_payment_method'))).toBe('fail');
  });

  it('retries an open, unpaid session with no PaymentIntent (nothing was confirmed)', () => {
    expect(decidePayFollowUp(ok('open', 'unpaid', null))).toBe('retry');
  });

  it.each(['requires_payment_method', 'requires_confirmation'])(
    'retries an open session whose intent is %s',
    status => {
      expect(decidePayFollowUp(ok('open', 'unpaid', status))).toBe('retry');
    }
  );

  it.each(['processing', 'succeeded'])('waits on an open session whose intent is %s', status => {
    expect(decidePayFollowUp(ok('open', 'unpaid', status))).toBe('wait');
  });

  it.each(['requires_action', 'requires_capture', 'canceled', 'something_new'])(
    'fails without clicking on an open session whose intent is %s',
    status => {
      expect(decidePayFollowUp(ok('open', 'unpaid', status))).toBe('fail');
    }
  );

  it('fails on an unknown session status or an open session with an unknown payment status', () => {
    expect(decidePayFollowUp(ok(null, null, null))).toBe('fail');
    expect(decidePayFollowUp(ok('open', 'no_payment_required', null))).toBe('fail');
  });

  it('describes evidence for logs', () => {
    expect(describeEvidence({ read: 'failed' })).toBe('unreadable');
    expect(describeEvidence(ok('open', 'unpaid', null))).toBe('session open/unpaid, PI none');
  });
});

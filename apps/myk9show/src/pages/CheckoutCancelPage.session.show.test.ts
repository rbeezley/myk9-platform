import { describe, expect, it } from 'vitest';
import { resolveCancelReturnShowId } from './CheckoutCancelPage.session';

const A = '11111111-1111-4111-8111-111111111111';
const CART = '22222222-2222-4222-8222-222222222222';
const RECOVERY = '33333333-3333-4333-8333-333333333333';

describe('resolveCancelReturnShowId', () => {
  it('prefers a well-formed show param over the cart and recovery show', () => {
    expect(resolveCancelReturnShowId(A, CART, RECOVERY)).toBe(A);
  });

  it.each([null, '', 'show-A', 'not-a-uuid', `${A}x`, '{CHECKOUT_SESSION_ID}'])(
    'falls back when the param is %j',
    param => {
      expect(resolveCancelReturnShowId(param, CART, RECOVERY)).toBe(CART);
      expect(resolveCancelReturnShowId(param, null, RECOVERY)).toBe(RECOVERY);
      expect(resolveCancelReturnShowId(param, undefined, undefined)).toBeNull();
    }
  );

  it('orders cart before trusted recovery show', () => {
    expect(resolveCancelReturnShowId(null, CART, RECOVERY)).toBe(CART);
  });
});

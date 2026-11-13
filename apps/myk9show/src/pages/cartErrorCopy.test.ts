import { describe, expect, it, vi } from 'vitest';
import {
  CART_ERROR,
  cartErrorForDisplay,
  checkoutErrorMessage,
  reportCheckoutFailure,
} from './cartErrorCopy';
import { CheckoutSessionError } from '@/lib/stripe';
import { logger } from '@/services/LoggingService';
import { OWNER_ADDRESS_REQUIRED_CODE } from '@/features/registration/ownerAddress';
import { RECOVERY_FAILED_MESSAGE } from '@/store/cartStore.recovery';
import { CART_OPEN_FAILED_MESSAGE } from '@/store/cartStore.ensureCart';

describe('checkoutErrorMessage (MYK9-1823)', () => {
  it.each([403, 404, 409, 503])('shows the server sentence from a %i body', status => {
    const message = 'Online entry has closed for this show.';
    expect(checkoutErrorMessage(new CheckoutSessionError(message, status, null, true))).toBe(
      message
    );
  });

  it('shows the owner-address refusal by its code', () => {
    const message = "Add the owner's city to enter Rover in an AKC trial.";
    expect(
      checkoutErrorMessage(
        new CheckoutSessionError(message, 422, OWNER_ADDRESS_REQUIRED_CODE, true)
      )
    ).toBe(message);
  });

  it.each([
    ['a 500 body', new CheckoutSessionError('No such customer: cus_1', 500, null, true)],
    ['a 400 body', new CheckoutSessionError('Invalid redirect URL origin', 400, null, true)],
    [
      'a transport message on a worded status',
      new CheckoutSessionError('Edge Function returned a non-2xx status code', 409),
    ],
    ['a plain Error', new Error('No checkout URL returned from server')],
    ['a thrown string', 'boom'],
  ])('falls back to the fixed sentence for %s', (_label, err) => {
    expect(checkoutErrorMessage(err)).toBe(CART_ERROR.checkoutFailed);
  });

  it('says the exhibitor was signed out on a 401', () => {
    expect(
      checkoutErrorMessage(new CheckoutSessionError('Session expired. Please sign in again.', 401))
    ).toBe(CART_ERROR.signedOut);
  });

  it('logs the raw failure when reporting it', () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    try {
      const raw = new Error('No checkout URL returned from server');
      expect(reportCheckoutFailure(raw, 'cart-1')).toBe(CART_ERROR.checkoutFailed);
      expect(spy).toHaveBeenCalledWith(
        'Checkout did not start',
        'CartPage',
        { cartId: 'cart-1', status: null },
        raw
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe('cartErrorForDisplay (MYK9-1823)', () => {
  it('shows nothing when there is no error', () => {
    expect(cartErrorForDisplay(null, null)).toBeNull();
  });

  it('shows the fixed sentence for raw store text', () => {
    expect(cartErrorForDisplay('No active entry', null)).toBe(CART_ERROR.unknown);
    expect(cartErrorForDisplay('JWT expired', 'Some other page sentence.')).toBe(
      CART_ERROR.unknown
    );
  });

  it('shows the sentence the page set, and the ones the store words on purpose', () => {
    expect(cartErrorForDisplay(CART_ERROR.removeFailed, CART_ERROR.removeFailed)).toBe(
      CART_ERROR.removeFailed
    );
    expect(cartErrorForDisplay(RECOVERY_FAILED_MESSAGE, null)).toBe(RECOVERY_FAILED_MESSAGE);
    expect(cartErrorForDisplay(CART_OPEN_FAILED_MESSAGE, null)).toBe(CART_OPEN_FAILED_MESSAGE);
  });

  it('writes no em dashes and no software words into the fixed sentences', () => {
    for (const sentence of Object.values(CART_ERROR)) {
      expect(sentence).not.toMatch(/—|server|\brequest\b|invalid|session/i);
    }
  });
});

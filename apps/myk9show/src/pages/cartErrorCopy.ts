/**
 * MYK9-1823: what /cart says when something fails. The cart store keeps the raw
 * failure (database, network or library text) on `error` for its own logs; this
 * page never shows that text. It shows a sentence it wrote for the action that
 * failed, a sentence the store or stripe-checkout wrote on purpose for the
 * exhibitor, or the fixed fallback.
 */
import { ensureError } from '@myk9/core';
import { OWNER_ADDRESS_REQUIRED_CODE } from '@/features/registration/ownerAddress';
import { CheckoutSessionError } from '@/lib/stripe';
import { logger } from '@/services/LoggingService';
import {
  CART_OPEN_FAILED_MESSAGE,
  CART_OPEN_TIMED_OUT_MESSAGE,
} from '@/store/cartStore.ensureCart';
import { RECOVERY_FAILED_MESSAGE } from '@/store/cartStore.recovery';

export const CART_ERROR = {
  removeFailed:
    'We could not finish removing that class. Restart the app to see what is still in your entry.',
  clearFailed:
    'We could not finish clearing your entry. Restart the app to see what is still in it.',
  waitlistFailed:
    'We could not finish your waitlist requests, and nothing was charged. Check your entries to see which were saved, then try again.',
  checkoutFailed: 'We could not open the payment page, so nothing was charged. Try again.',
  signedOut: 'You were signed out. Sign in again, then pay for your entry.',
  unknown:
    'Something went wrong with your entry. Restart the app to see what is in it, then try again.',
} as const;

/** Sentences the cart store writes to `error` on purpose, for the exhibitor to read. */
const STORE_WORDED = new Set<string>([
  RECOVERY_FAILED_MESSAGE,
  CART_OPEN_FAILED_MESSAGE,
  CART_OPEN_TIMED_OUT_MESSAGE,
]);

/**
 * stripe-checkout's 403, 404, 409 and 503 bodies are all written for the
 * exhibitor and say something the fallback cannot (class filled, fees re-priced,
 * entries closed, club cannot take cards, spots could not be held). Its 400, 405
 * and 500 bodies are developer text, a raw catch-all, or "try again" sentences
 * the fixed fallback already covers, so they get the fallback.
 */
const SERVER_WORDED_STATUSES = new Set([403, 404, 409, 503]);

/** The sentence for a failed Pay: the server's own words when it wrote them for people. */
export function checkoutErrorMessage(err: unknown): string {
  if (!(err instanceof CheckoutSessionError)) return CART_ERROR.checkoutFailed;
  if (err.status === 401) return CART_ERROR.signedOut;
  const serverWorded =
    err.fromServerBody &&
    (err.code === OWNER_ADDRESS_REQUIRED_CODE ||
      (err.status !== null && SERVER_WORDED_STATUSES.has(err.status)));
  return serverWorded && err.message ? err.message : CART_ERROR.checkoutFailed;
}

/** Log the raw Pay failure, and return the sentence the exhibitor sees for it. */
export function reportCheckoutFailure(err: unknown, cartId: string): string {
  const status = err instanceof CheckoutSessionError ? err.status : null;
  logger.error('Checkout did not start', 'CartPage', { cartId, status }, ensureError(err));
  return checkoutErrorMessage(err);
}

/**
 * What the cart's error alert shows for the store's `error`. `pageMessage` is the
 * last sentence the page itself set; anything else the store holds is shown only
 * if the store wrote it for people.
 */
export function cartErrorForDisplay(
  storeError: string | null,
  pageMessage: string | null
): string | null {
  if (!storeError) return null;
  if (storeError === pageMessage || STORE_WORDED.has(storeError)) return storeError;
  return CART_ERROR.unknown;
}

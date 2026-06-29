/**
 * Cart checkout return-state helper.
 *
 * When Stripe Checkout is abandoned, its `cancel_url` walks the exhibitor back
 * into the app (via the Checkout Cancel page's "Return to Cart" action) with a
 * `?checkout=cancelled` query param. The cart reads that param to show a calm,
 * reassuring "your cart is saved" banner — distinct from the destructive error
 * Alert reserved for hard failures.
 *
 * Kept as a pure function (no React) so the param contract is unit-testable
 * without rendering the full CartPage.
 */

export const CHECKOUT_RETURN_PARAM = 'checkout';

export type CheckoutReturnStatus = 'cancelled' | null;

/**
 * Read the Stripe checkout return status from the cart URL's search params.
 * Returns `'cancelled'` only for the exact `?checkout=cancelled` contract;
 * any other / missing value yields `null` (no banner).
 */
export function readCheckoutReturnStatus(params: URLSearchParams): CheckoutReturnStatus {
  return params.get(CHECKOUT_RETURN_PARAM) === 'cancelled' ? 'cancelled' : null;
}

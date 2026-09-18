/**
 * The step's readiness predicate, which decides both whether a chip may be
 * toggled and what a blocked chip says (MYK9-581, review D1 / I5).
 *
 * The step tests exercise this only through the rendered component, and on the
 * `failed` path the store's cart is null anyway — so the STORE half of the
 * predicate already answers "not ready" and the opener half is never the
 * deciding vote there. Deleting all three `cartOpen` checks left every step test
 * green. These cases are the ones where the two halves disagree, which is the
 * only place the opener half is load-bearing.
 */
import { describe, expect, it } from 'vitest';
import {
  CART_PENDING_REASON,
  CART_UNAVAILABLE_REASON,
  cartBlockedReason,
  isCartReady,
  type CartReadinessInput,
} from './ClassSelectionStep.cartReady';
import type { CartWithDetails } from '@/store/cartStore.types';

const SHOW_ID = 'show-1';
const EXHIBITOR_ID = 'exhibitor-1';

const cartFor = (showId: string, exhibitorId: string) =>
  ({
    id: 'cart-1',
    show_id: showId,
    exhibitor_id: exhibitorId,
    items: [],
  }) as unknown as CartWithDetails;

/** The store agrees this is THIS show's and THIS exhibitor's cart, and has settled. */
const storeAgrees = {
  useCartFlow: true,
  cartIsLoading: false,
  cartShowId: SHOW_ID,
  cartExhibitorId: EXHIBITOR_ID,
  showId: SHOW_ID,
  exhibitorId: EXHIBITOR_ID,
} satisfies Omit<CartReadinessInput, 'cartOpen'>;

describe('isCartReady consults the opener, not only the store', () => {
  it('is ready when the opener and the store name the same cart', () => {
    const input = {
      ...storeAgrees,
      cartOpen: { kind: 'ready', cart: cartFor(SHOW_ID, EXHIBITOR_ID) },
    } satisfies CartReadinessInput;

    expect(isCartReady(input)).toBe(true);
    expect(cartBlockedReason(input)).toBeNull();
  });

  it("is NOT ready when the opener's cart belongs to another show, even though the store agrees", () => {
    // The global store holds one cart at a time. Mounting the wizard for show B
    // while show A's read is still in flight lands A's cart in the store after
    // B's; the opener's own result is what knows which show it answered for.
    const input = {
      ...storeAgrees,
      cartOpen: { kind: 'ready', cart: cartFor('some-other-show', EXHIBITOR_ID) },
    } satisfies CartReadinessInput;

    expect(isCartReady(input)).toBe(false);
    expect(cartBlockedReason(input)).toBe(CART_PENDING_REASON);
  });

  it("is NOT ready when the opener's cart belongs to another exhibitor", () => {
    const input = {
      ...storeAgrees,
      cartOpen: { kind: 'ready', cart: cartFor(SHOW_ID, 'some-other-exhibitor') },
    } satisfies CartReadinessInput;

    expect(isCartReady(input)).toBe(false);
  });

  it('is NOT ready after a FAILED open even though the store holds a matching cart', () => {
    // The 20s bound reports `failed` while the stalled opener keeps running, so
    // it can still land a perfectly good cart in the store afterwards. Trusting
    // the store there would enable the chips under an alert that says the cart
    // could not be opened.
    const input = {
      ...storeAgrees,
      cartOpen: { kind: 'failed', error: 'Your cart is taking too long to open.' },
    } satisfies CartReadinessInput;

    expect(isCartReady(input)).toBe(false);
    expect(cartBlockedReason(input)).toBe(CART_UNAVAILABLE_REASON);
  });

  it('is NOT ready while the opener is still in flight', () => {
    const input = { ...storeAgrees, cartOpen: null } satisfies CartReadinessInput;

    expect(isCartReady(input)).toBe(false);
    expect(cartBlockedReason(input)).toBe(CART_PENDING_REASON);
  });

  it('is NOT ready when the opener answered but the store has not caught up', () => {
    const input = {
      ...storeAgrees,
      cartShowId: null,
      cartOpen: { kind: 'ready', cart: cartFor(SHOW_ID, EXHIBITOR_ID) },
    } satisfies CartReadinessInput;

    expect(isCartReady(input)).toBe(false);
  });

  it('never gates the non-cart flow, whatever the opener says', () => {
    const input = {
      ...storeAgrees,
      useCartFlow: false,
      cartOpen: { kind: 'failed', error: 'anything' },
    } satisfies CartReadinessInput;

    expect(isCartReady(input)).toBe(true);
    expect(cartBlockedReason(input)).toBeNull();
  });

  it('is NOT ready before an exhibitor is resolved', () => {
    const input = {
      ...storeAgrees,
      exhibitorId: undefined,
      cartOpen: { kind: 'ready', cart: cartFor(SHOW_ID, EXHIBITOR_ID) },
    } satisfies CartReadinessInput;

    expect(isCartReady(input)).toBe(false);
  });
});

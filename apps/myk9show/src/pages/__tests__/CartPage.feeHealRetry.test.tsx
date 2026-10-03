/**
 * MYK9-838 step 1: after `stripe-checkout` heals a drifted cart line and answers
 * 409, the retry must use the healed SERVER price, never a price the client
 * recomputes. Two facts make that true, and this file pins both:
 *
 * 1. On the 409, /cart reloads the cart from the database (`loadActiveCart`,
 *    which reads `entry_cart_items.entry_fee_cents`) and keeps the Checkout
 *    button latched until that reload finishes, so a quick retry cannot
 *    resubmit the stale in-memory cart.
 * 2. The retry sends ONLY the cart id. `stripe-checkout` prices the rows it
 *    reads from `entry_cart_items` (the ones it just healed), so nothing the
 *    client holds can put the old price back. Nothing on /cart writes
 *    `entry_fee_cents` (only the wizard's `addItem` and recovery do).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

const HEAL_MESSAGE =
  'Entry fees were updated to current show pricing — review your cart and try again.';

const createEntryCheckoutSessionMock = vi.hoisted(() => vi.fn());
const loadActiveCartMock = vi.hoisted(() => vi.fn());
const setErrorMock = vi.hoisted(() => vi.fn());
const checkoutWithWaitlistMock = vi.hoisted(() => vi.fn());

const cartState = vi.hoisted(() => ({
  cart: {
    id: 'cart-1',
    show_id: 'show-1',
    exhibitor_id: 'exhibitor-1',
    subtotal_cents: 3000,
    platform_fee_cents: 210,
    total_cents: 3210,
    items: [],
    show: {
      id: 'show-1',
      name: 'Junior Trial',
      start_date: '2099-09-01',
      entry_close_date: '2099-08-15',
    },
  },
}));

const cartItems = vi.hoisted(() => ({
  value: [
    {
      id: 'item-1',
      cart_id: 'cart-1',
      class_id: 'class-1',
      dog_id: 'dog-1',
      handler_id: null,
      entry_fee_cents: 3000,
      junior_fee_declared: true,
      jump_height: null,
      special_requests: null,
      class: {
        id: 'class-1',
        name: 'Novice Container',
        level: 'Novice',
        trial_id: 'trial-1',
        allow_waitlist: false,
      },
    },
  ],
}));

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return { ...actual, createEntryCheckoutSession: createEntryCheckoutSessionMock };
});
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'exhibitor-1' } }),
}));
vi.mock('@/hooks/queries/useCartCapacity', () => ({
  useCartCapacity: () => ({
    judgeDays: [],
    classSpots: [],
    judgeNameById: new Map(),
    isLoading: false,
    isFetching: false,
    error: null,
    isError: false,
    refetch: async () => ({ data: { judgeDays: [], classSpots: [] }, isError: false }),
  }),
}));
vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      cart: cartState.cart,
      error: null,
      removeItem: vi.fn().mockResolvedValue(true),
      clearCart: vi.fn().mockResolvedValue(true),
      setError: setErrorMock,
      loadActiveCart: loadActiveCartMock,
      checkoutWithWaitlist: checkoutWithWaitlistMock,
    }),
  useCartItems: () => cartItems.value,
}));
vi.mock('@/components/cart/CartItemCard', () => ({
  CartItemCard: ({ item }: { item: { class?: { name?: string } } }) => (
    <div>{item.class?.name ?? 'Cart Item'}</div>
  ),
}));
vi.mock('@/components/cart/CartSummary', () => ({
  CartSummary: ({
    onCheckout,
    isCheckingOut,
  }: {
    onCheckout: () => void;
    isCheckingOut?: boolean;
  }) => (
    <button type="button" onClick={onCheckout} disabled={isCheckingOut}>
      Checkout
    </button>
  ),
}));

import { CheckoutSessionError } from '@/lib/stripe';
import CartPage from '@/pages/CartPage';

describe('CartPage retry after a fee heal (MYK9-838)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Drop any queued Once answers a failed case left behind.
    createEntryCheckoutSessionMock.mockReset();
    loadActiveCartMock.mockReset().mockResolvedValue(null);
    checkoutWithWaitlistMock.mockResolvedValue({ confirmed: ['class-1'], waitlisted: [] });
  });

  it('reloads the healed cart from the database before a retry, and retries with the cart id only', async () => {
    createEntryCheckoutSessionMock
      .mockRejectedValueOnce(new CheckoutSessionError(HEAL_MESSAGE, 409))
      .mockResolvedValueOnce(undefined);
    // The mount-time hydrate passes `recoveryEntryIds`; the 409 reload does not.
    let finishReload: () => void = () => {};
    loadActiveCartMock.mockImplementation((_exhibitorId: string, options: object) =>
      'recoveryEntryIds' in options
        ? Promise.resolve(null)
        : new Promise<void>(resolve => {
            finishReload = resolve;
          })
    );

    const { user } = render(<CartPage />, { initialRoute: '/cart' });
    const checkout = screen.getByRole('button', { name: 'Checkout' });

    await user.click(checkout);

    // The reload is the DATABASE read of the healed rows, scoped to this exhibitor.
    await waitFor(() => expect(loadActiveCartMock).toHaveBeenCalledWith('exhibitor-1', {}));
    // Latched until the healed cart is back: no retry on the stale in-memory copy.
    expect(checkout).toBeDisabled();

    finishReload();

    await waitFor(() => expect(checkout).toBeEnabled());
    expect(setErrorMock).toHaveBeenCalledWith(HEAL_MESSAGE);

    await user.click(checkout);

    await waitFor(() => expect(createEntryCheckoutSessionMock).toHaveBeenCalledTimes(2));
    // Both attempts hand the server the cart id and nothing priced on the client.
    expect(createEntryCheckoutSessionMock.mock.calls).toEqual([
      ['cart-1', undefined],
      ['cart-1', undefined],
    ]);
  });

  it('does not reload the cart for a failure that is not a re-pricing', async () => {
    createEntryCheckoutSessionMock.mockRejectedValueOnce(
      new CheckoutSessionError('This club cannot take card payments yet.', 403)
    );

    const { user } = render(<CartPage />, { initialRoute: '/cart' });

    await user.click(screen.getByRole('button', { name: 'Checkout' }));

    await waitFor(() =>
      expect(setErrorMock).toHaveBeenCalledWith('This club cannot take card payments yet.')
    );
    expect(loadActiveCartMock).not.toHaveBeenCalledWith('exhibitor-1', {});
  });
});

/**
 * MYK9-1012 on /cart: what the exhibitor sees around a held checkout.
 *
 * - Pay finds a class that filled (stripe-checkout answers 409 with the dog
 *   and the class, nothing charged): the cart reloads AND re-reads class
 *   availability, so the line shows as full with its wait-list option instead
 *   of looking payable again.
 * - Back from a Stripe page that outlived its 30-minute hold: the cancel
 *   notice says the hold ended and the cart is saved. Back before then: the
 *   usual "Checkout cancelled" notice.
 *
 * Harness copied from CartPage.feeHealRetry.test.tsx.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

const createEntryCheckoutSessionMock = vi.hoisted(() => vi.fn());
const loadActiveCartMock = vi.hoisted(() => vi.fn());
const setErrorMock = vi.hoisted(() => vi.fn());
const checkoutWithWaitlistMock = vi.hoisted(() => vi.fn());
const refetchCapacityMock = vi.hoisted(() => vi.fn());

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
    waitlistClassIds: [],
    judgeNameById: new Map(),
    isLoading: false,
    isFetching: false,
    error: null,
    isError: false,
    refetch: refetchCapacityMock,
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
import { rememberCheckoutHold } from '@/features/payments/checkoutHold';
import CartPage from '@/pages/CartPage';

const FILLED =
  'Novice Container just filled, so nothing was charged. Remove Ziva from Novice Container to continue.';
const HOLD_ENDED =
  'Your 30-minute hold ended. Your cart is saved; check out again to re-check spots.';

beforeEach(() => {
  vi.clearAllMocks();
  createEntryCheckoutSessionMock.mockReset();
  loadActiveCartMock.mockReset().mockResolvedValue(null);
  refetchCapacityMock
    .mockReset()
    .mockResolvedValue({
      data: { judgeDays: [], classSpots: [], waitlistClassIds: [] },
      isError: false,
    });
  checkoutWithWaitlistMock.mockResolvedValue({ confirmed: ['class-1'], waitlisted: [] });
  sessionStorage.clear();
});

describe('CartPage when Pay finds a class filled (MYK9-1012)', () => {
  it('reloads the cart and re-reads availability, then says which class filled', async () => {
    createEntryCheckoutSessionMock.mockRejectedValueOnce(new CheckoutSessionError(FILLED, 409));

    const { user } = render(<CartPage />, { initialRoute: '/cart' });
    const capacityReadsBeforePay = refetchCapacityMock.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Checkout' }));

    await waitFor(() => expect(setErrorMock).toHaveBeenCalledWith(FILLED));
    expect(loadActiveCartMock).toHaveBeenCalledWith('exhibitor-1', {});
    // One re-read before Pay (the pre-submit check) and one after the 409.
    expect(refetchCapacityMock.mock.calls.length).toBe(capacityReadsBeforePay + 2);
  });
});

describe('CartPage back from checkout (MYK9-1012)', () => {
  it('says the hold ended and the cart is saved after the page outlived it', () => {
    rememberCheckoutHold('cs_1', new Date(Date.now() - 1000).toISOString());

    render(<CartPage />, { initialRoute: '/cart?checkout=cancelled' });

    expect(screen.getByText(HOLD_ENDED)).toBeInTheDocument();
    expect(screen.queryByText(/checkout cancelled/i)).not.toBeInTheDocument();
  });

  it('keeps the usual cancel notice when the hold had not ended', () => {
    rememberCheckoutHold('cs_1', new Date(Date.now() + 10 * 60 * 1000).toISOString());

    render(<CartPage />, { initialRoute: '/cart?checkout=cancelled' });

    expect(screen.getByText('Checkout cancelled. Your card was not charged.')).toBeInTheDocument();
    expect(screen.queryByText(HOLD_ENDED)).not.toBeInTheDocument();
  });
});

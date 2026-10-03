/**
 * MYK9-873: /cart renders the payment link's outcome in BOTH states, derived from
 * the link's stored facts and the LIVE cart: with no cart at all, beside a cart
 * that has lines, and after the last line is gone, where "add back" re-runs the
 * page's own load (which refills an empty cart from the link).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { PaymentLinkFacts } from '@/store/cartStore.types';

const LINK_ROUTE = '/cart?showId=show-1&entryIds=e2,e1';

const cartState = vi.hoisted(() => ({
  cart: null as Record<string, unknown> | null,
  error: null as string | null,
  items: [] as unknown[],
  paymentLinkFacts: null as PaymentLinkFacts | null,
}));
const loadActiveCart = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'exhibitor-1' }, isLoading: false }),
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
      ...cartState,
      cart: cartState.cart ? { ...cartState.cart, items: cartState.items } : null,
      isLoading: false,
      loadInitiated: true,
      droppedClosedClassItems: [],
      removeItem: vi.fn(),
      clearCart: vi.fn(),
      setError: vi.fn(),
      loadActiveCart,
      checkoutWithWaitlist: vi.fn(),
      dismissDroppedClosedClassItems: vi.fn(),
      dismissPaymentLinkFacts: vi.fn(),
    }),
  useCartItems: () => cartState.items,
}));
vi.mock('@/components/cart/CartItemCard', () => ({
  CartItemCard: ({ item }: { item: { class?: { name?: string } } }) => (
    <div>{item.class?.name ?? 'Cart Item'}</div>
  ),
}));
vi.mock('@/components/cart/CartSummary', () => ({
  CartSummary: () => <button type="button">Checkout</button>,
}));

import CartPage from '@/pages/CartPage';

const CART = {
  id: 'cart-1',
  show_id: 'show-1',
  exhibitor_id: 'exhibitor-1',
  subtotal_cents: 2500,
  platform_fee_cents: 175,
  total_cents: 2675,
  show: { id: 'show-1', name: 'Link Trial', start_date: '2099-09-01', entry_close_date: null },
};
const LINE_E1 = {
  id: 'item-e1',
  cart_id: 'cart-1',
  class_id: 'class-1',
  dog_id: 'dog-1',
  entry_id: 'e1',
  handler_id: null,
  entry_fee_cents: 2500,
  class: { id: 'class-1', name: 'Novice Container', level: 'Novice', trial_id: 't1' },
};

describe('CartPage payment-link notice (MYK9-873)', () => {
  beforeEach(() => {
    loadActiveCart.mockReset().mockResolvedValue(null);
    cartState.cart = null;
    cartState.items = [];
    cartState.error = null;
    cartState.paymentLinkFacts = null;
  });

  it('with no cart at all, explains the link and offers My Entries above "Your cart is empty"', () => {
    cartState.paymentLinkFacts = { linkKey: 'e1,e2', linkIds: ['e2', 'e1'], payableIds: [] };

    render(<CartPage />, { initialRoute: LINK_ROUTE });

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(
      screen.getByText('None of the 2 entries in your payment link are in your cart.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Entries' })).toHaveAttribute(
      'href',
      '/exhibitor/entries'
    );
  });

  it('beside a cart with lines, points at checking out this cart', () => {
    cartState.cart = CART;
    cartState.items = [LINE_E1];
    cartState.paymentLinkFacts = {
      linkKey: 'e1,e2',
      linkIds: ['e2', 'e1'],
      payableIds: ['e1', 'e2'],
    };

    render(<CartPage />, { initialRoute: LINK_ROUTE });

    expect(screen.getByRole('button', { name: 'Checkout' })).toBeInTheDocument();
    expect(
      screen.getByText('1 of the 2 entries in your payment link is not in this cart.')
    ).toBeInTheDocument();
    expect(screen.getByText(/Check out this cart first/)).toBeInTheDocument();
  });

  it('with the last line gone, "add back" re-runs the link load', async () => {
    cartState.cart = CART;
    cartState.items = [];
    cartState.paymentLinkFacts = {
      linkKey: 'e1,e2',
      linkIds: ['e2', 'e1'],
      payableIds: ['e1', 'e2'],
    };

    const { user } = render(<CartPage />, { initialRoute: LINK_ROUTE });
    expect(loadActiveCart).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByText(/Check out this cart first/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add them back to your cart' }));

    expect(loadActiveCart).toHaveBeenCalledTimes(2);
    expect(loadActiveCart).toHaveBeenLastCalledWith('exhibitor-1', {
      showId: 'show-1',
      recoveryEntryIds: ['e2', 'e1'],
    });
  });

  it('shows nothing for the facts of a different link', () => {
    cartState.paymentLinkFacts = { linkKey: 'e9', linkIds: ['e9'], payableIds: [] };

    render(<CartPage />, { initialRoute: LINK_ROUTE });

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByText(/payment link/)).toBeNull();
  });
});

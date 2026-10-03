/**
 * MYK9-873: /cart renders the payment link's outcome in BOTH states, because the
 * outcome is keyed by the link in the URL, not by a cart: with no cart at all
 * (every linked entry gone, Codex round 2) and beside a cart that has lines.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { StoredPaymentLinkOutcome } from '@/store/cartStore.types';

const LINK_ROUTE = '/cart?showId=show-1&entryIds=e2,e1';

const cartState = vi.hoisted(() => ({
  cart: null as Record<string, unknown> | null,
  error: null as string | null,
  items: [] as unknown[],
  paymentLinkOutcome: null as StoredPaymentLinkOutcome | null,
}));

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
      isLoading: false,
      loadInitiated: true,
      droppedClosedClassItems: [],
      removeItem: vi.fn(),
      clearCart: vi.fn(),
      setError: vi.fn(),
      loadActiveCart: vi.fn().mockResolvedValue(null),
      checkoutWithWaitlist: vi.fn(),
      dismissDroppedClosedClassItems: vi.fn(),
      dismissPaymentLinkOutcome: vi.fn(),
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

describe('CartPage payment-link notice (MYK9-873)', () => {
  beforeEach(() => {
    cartState.cart = null;
    cartState.items = [];
    cartState.error = null;
    cartState.paymentLinkOutcome = null;
  });

  it('with no cart at all, explains the link and offers My Entries above "Your cart is empty"', () => {
    cartState.paymentLinkOutcome = {
      linkKey: 'e1,e2',
      kind: 'none-left',
      requested: 2,
      unavailable: 2,
      stillUnpaid: 0,
    };

    render(<CartPage />, { initialRoute: LINK_ROUTE });

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(
      screen.getByText('None of the 2 entries in your payment link can be paid here.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Entries' })).toHaveAttribute(
      'href',
      '/exhibitor/entries'
    );
  });

  it('beside a cart with lines, points at checking out this cart', () => {
    cartState.cart = {
      id: 'cart-1',
      show_id: 'show-1',
      exhibitor_id: 'exhibitor-1',
      subtotal_cents: 2500,
      platform_fee_cents: 175,
      total_cents: 2675,
      items: [],
      show: { id: 'show-1', name: 'Link Trial', start_date: '2099-09-01', entry_close_date: null },
    };
    cartState.items = [
      {
        id: 'item-e1',
        cart_id: 'cart-1',
        class_id: 'class-1',
        dog_id: 'dog-1',
        entry_id: 'e1',
        handler_id: null,
        entry_fee_cents: 2500,
        class: { id: 'class-1', name: 'Novice Container', level: 'Novice', trial_id: 't1' },
      },
    ];
    cartState.paymentLinkOutcome = {
      linkKey: 'e1,e2',
      kind: 'some-missing',
      requested: 2,
      unavailable: 0,
      stillUnpaid: 1,
    };

    render(<CartPage />, { initialRoute: LINK_ROUTE });

    expect(screen.getByRole('button', { name: 'Checkout' })).toBeInTheDocument();
    expect(
      screen.getByText('1 of the 2 entries in your payment link is not in this cart.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 still needs paying. Check out this cart first, then open your payment link again.'
      )
    ).toBeInTheDocument();
  });

  it('shows nothing for an outcome of a different link', () => {
    cartState.paymentLinkOutcome = {
      linkKey: 'e9',
      kind: 'none-left',
      requested: 1,
      unavailable: 1,
      stillUnpaid: 0,
    };

    render(<CartPage />, { initialRoute: LINK_ROUTE });

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByText(/payment link/)).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

const navigateMock = vi.hoisted(() => vi.fn());
const createEntryCheckoutSessionMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const removeItemMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const clearCartMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const setErrorMock = vi.hoisted(() => vi.fn());
const loadActiveCartMock = vi.hoisted(() => vi.fn());
const checkoutWithWaitlistMock = vi.hoisted(() => vi.fn());

const cartState = vi.hoisted(() => ({
  cart: {
    id: 'cart-1',
    show_id: 'show-1',
    exhibitor_id: 'exhibitor-1',
    subtotal_cents: 5000,
    platform_fee_cents: 250,
    total_cents: 5250,
    items: [],
    show: {
      id: 'show-1',
      name: 'Summer Show',
      start_date: '2026-09-01',
      entry_close_date: '2026-08-15',
    },
  },
  error: null as string | null,
}));

const cartItems = vi.hoisted(() => ({
  value: [
    {
      id: 'item-open',
      cart_id: 'cart-1',
      class_id: 'class-open',
      dog_id: 'dog-1',
      handler_id: null,
      entry_fee_cents: 2500,
      jump_height: null,
      special_requests: null,
      class: {
        id: 'class-open',
        name: 'Open Class',
        level: 'Novice',
        trial_id: 'trial-1',
        allow_waitlist: true,
      },
    },
    {
      id: 'item-full',
      cart_id: 'cart-1',
      class_id: 'class-full',
      dog_id: 'dog-1',
      handler_id: null,
      entry_fee_cents: 2500,
      jump_height: null,
      special_requests: null,
      class: {
        id: 'class-full',
        name: 'Full Class',
        level: 'Advanced',
        trial_id: 'trial-1',
        allow_waitlist: true,
      },
    },
  ],
}));

const judgeDayCapacityState = vi.hoisted(() => ({
  judgeDays: [
    {
      judgeId: 'judge-1',
      judgeName: 'Judge Judy',
      showDate: '2026-09-01',
      capacity: 10,
      confirmedCount: 10,
      waitlistCount: 1,
      mailInReserved: 0,
      availableSpots: 0,
      classIds: ['class-full'],
      classNames: ['Full Class'],
    },
  ],
  isLoading: false,
  error: null as string | null,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/lib/stripe', () => ({
  createEntryCheckoutSession: createEntryCheckoutSessionMock,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'exhibitor-1' } }),
}));

vi.mock('@/hooks/queries/useJudgeDayCapacity', () => ({
  useJudgeDayCapacity: () => judgeDayCapacityState,
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      cart: cartState.cart,
      error: cartState.error,
      removeItem: removeItemMock,
      clearCart: clearCartMock,
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
  CartSummary: ({ onCheckout }: { onCheckout: () => void }) => (
    <button type="button" onClick={onCheckout}>
      Checkout
    </button>
  ),
}));

import CartPage from '@/pages/CartPage';

describe('CartPage split checkout wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    cartState.error = null;
    cartItems.value = [
      {
        id: 'item-open',
        cart_id: 'cart-1',
        class_id: 'class-open',
        dog_id: 'dog-1',
        handler_id: null,
        entry_fee_cents: 2500,
        jump_height: null,
        special_requests: null,
        class: {
          id: 'class-open',
          name: 'Open Class',
          level: 'Novice',
          trial_id: 'trial-1',
          allow_waitlist: true,
        },
      },
      {
        id: 'item-full',
        cart_id: 'cart-1',
        class_id: 'class-full',
        dog_id: 'dog-1',
        handler_id: null,
        entry_fee_cents: 2500,
        jump_height: null,
        special_requests: null,
        class: {
          id: 'class-full',
          name: 'Full Class',
          level: 'Advanced',
          trial_id: 'trial-1',
          allow_waitlist: true,
        },
      },
    ];
    judgeDayCapacityState.judgeDays = [
      {
        judgeId: 'judge-1',
        judgeName: 'Judge Judy',
        showDate: '2026-09-01',
        capacity: 10,
        confirmedCount: 10,
        waitlistCount: 1,
        mailInReserved: 0,
        availableSpots: 0,
        classIds: ['class-full'],
        classNames: ['Full Class'],
      },
    ];
    judgeDayCapacityState.isLoading = false;
    judgeDayCapacityState.error = null;
    checkoutWithWaitlistMock.mockResolvedValue({
      confirmed: ['class-open'],
      waitlisted: [
        {
          id: 'wait-1',
          class_id: 'class-full',
          dog_id: 'dog-1',
          exhibitor_id: 'exhibitor-1',
          handler_id: null,
          position: 2,
          status: 'waiting',
          className: 'Full Class',
        },
      ],
    });
  });

  it('routes full classes to waitlist and keeps open classes on Stripe checkout', async () => {
    const { user } = render(<CartPage />, { initialRoute: '/cart' });

    await user.click(screen.getByRole('button', { name: 'Checkout' }));

    await waitFor(() =>
      expect(checkoutWithWaitlistMock).toHaveBeenCalledWith('exhibitor-1', new Set(['class-full']))
    );
    await waitFor(() => expect(removeItemMock).toHaveBeenCalledWith('item-full'));
    await waitFor(() => expect(createEntryCheckoutSessionMock).toHaveBeenCalledWith('cart-1'));

    expect(JSON.parse(sessionStorage.getItem('cart-split-checkout') ?? '{}')).toMatchObject({
      showId: 'show-1',
      confirmedEntryCount: 1,
      waitlistEntries: [{ id: 'wait-1', position: 2, className: 'Full Class' }],
    });
  });

  it('sends waitlist-only carts to the existing success page without Stripe', async () => {
    cartItems.value = [cartItems.value[1]];
    checkoutWithWaitlistMock.mockResolvedValue({
      confirmed: [],
      waitlisted: [
        {
          id: 'wait-1',
          class_id: 'class-full',
          dog_id: 'dog-1',
          exhibitor_id: 'exhibitor-1',
          handler_id: null,
          position: 2,
          status: 'waiting',
          className: 'Full Class',
        },
      ],
    });

    const { user } = render(<CartPage />, { initialRoute: '/cart' });

    await user.click(screen.getByRole('button', { name: 'Checkout' }));

    await waitFor(() =>
      expect(checkoutWithWaitlistMock).toHaveBeenCalledWith('exhibitor-1', new Set(['class-full']))
    );
    expect(createEntryCheckoutSessionMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/checkout/success?waitlist=1');
  });

  it('blocks checkout for full classes that do not accept the wait list', async () => {
    cartItems.value = [
      {
        ...cartItems.value[1],
        class: {
          id: 'class-full',
          name: 'Denied Class',
          level: 'Advanced',
          trial_id: 'trial-1',
          allow_waitlist: false,
        },
      },
    ];

    const { user } = render(<CartPage />, { initialRoute: '/cart' });

    await user.click(screen.getByRole('button', { name: 'Checkout' }));

    await waitFor(() =>
      expect(setErrorMock).toHaveBeenCalledWith(
        'Denied Class is full and not accepting wait list entries. Remove it to continue.'
      )
    );
    expect(checkoutWithWaitlistMock).not.toHaveBeenCalled();
    expect(createEntryCheckoutSessionMock).not.toHaveBeenCalled();
  });
});

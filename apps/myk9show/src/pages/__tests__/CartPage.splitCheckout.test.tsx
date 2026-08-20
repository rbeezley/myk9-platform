import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { STORAGE_KEYS } from '@/constants/storageKeys';

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
  fullClassIds: [] as string[],
  isLoading: false,
  isFetching: false,
  error: null as string | null,
  // handleCheckout re-checks capacity at submit rather than trusting the
  // render-time snapshot, and it fails CLOSED - an unresolved refetch stops
  // checkout rather than proceeding on stale data. The default therefore
  // answers with the same capacity these cases render, so they keep asserting
  // the split logic; the refetch's own behaviour is covered separately below.
  refetch: vi.fn(),
  isError: false,
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
  CartSummary: ({
    onCheckout,
    isCheckingOut,
    fulfillment,
  }: {
    onCheckout: () => void;
    isCheckingOut?: boolean;
    fulfillment?: { capacityKnown: boolean };
  }) => (
    <button
      type="button"
      onClick={onCheckout}
      disabled={isCheckingOut || fulfillment?.capacityKnown === false}
    >
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
    judgeDayCapacityState.isError = false;
    // Answer the submit-time re-check with the capacity these cases render.
    // Read the state at CALL time, not at beforeEach time: cases below mutate
    // judgeDays after this runs, and the submit-time re-check must see what the
    // case set up rather than a snapshot taken before it.
    judgeDayCapacityState.refetch = vi.fn().mockImplementation(async () => ({
      data: {
        judgeDays: judgeDayCapacityState.judgeDays,
        fullClassIds: judgeDayCapacityState.fullClassIds,
      },
      isError: false,
    }));
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
    judgeDayCapacityState.isFetching = false;
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
      expect(checkoutWithWaitlistMock).toHaveBeenCalledWith('exhibitor-1', new Set(['item-full']))
    );
    await waitFor(() => expect(removeItemMock).toHaveBeenCalledWith('item-full'));
    await waitFor(() =>
      expect(createEntryCheckoutSessionMock).toHaveBeenCalledWith(
        'cart-1',
        expect.objectContaining({ splitCheckoutId: expect.any(String) })
      )
    );

    const storedSummary = JSON.parse(
      sessionStorage.getItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT) ?? '{}'
    );
    expect(storedSummary).toMatchObject({
      correlationId: expect.any(String),
      showId: 'show-1',
      confirmedEntryCount: 1,
      waitlistEntries: [{ id: 'wait-1', position: 2, className: 'Full Class' }],
    });
    expect(createEntryCheckoutSessionMock).toHaveBeenCalledWith('cart-1', {
      splitCheckoutId: storedSummary.correlationId,
    });
  });

  it('holds checkout while capacity is refetching stale data', () => {
    judgeDayCapacityState.isFetching = true;

    render(<CartPage />, { initialRoute: '/cart' });

    expect(screen.getByRole('button', { name: 'Checkout' })).toBeDisabled();
    expect(checkoutWithWaitlistMock).not.toHaveBeenCalled();
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
      expect(checkoutWithWaitlistMock).toHaveBeenCalledWith('exhibitor-1', new Set(['item-full']))
    );
    expect(createEntryCheckoutSessionMock).not.toHaveBeenCalled();
    const storedSummary = JSON.parse(
      sessionStorage.getItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT) ?? '{}'
    );
    expect(navigateMock).toHaveBeenCalledWith(
      `/checkout/success?waitlist=1&split=${encodeURIComponent(storedSummary.correlationId)}`
    );
  });

  it('clears the checkout spinner on the waitlist-only success path', async () => {
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

    const checkoutButton = screen.getByRole('button', { name: 'Checkout' });
    await user.click(checkoutButton);

    // The waitlist-only branch navigates without unmounting in this test (the
    // navigate mock is a no-op), mirroring the real "navigation delayed / page
    // not yet unmounted" case. The button must not be left stuck disabled.
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(createEntryCheckoutSessionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(checkoutButton).not.toBeDisabled());
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

  it('spends remaining judge-day capacity on earlier cart items before waitlisting later items', async () => {
    judgeDayCapacityState.judgeDays = [
      {
        judgeId: 'judge-1',
        judgeName: 'Judge Judy',
        showDate: '2026-09-01',
        capacity: 10,
        confirmedCount: 9,
        waitlistCount: 1,
        mailInReserved: 0,
        availableSpots: 1,
        classIds: ['class-open', 'class-full'],
        classNames: ['Open Class', 'Full Class'],
      },
    ];

    const { user } = render(<CartPage />, { initialRoute: '/cart' });

    await user.click(screen.getByRole('button', { name: 'Checkout' }));

    await waitFor(() =>
      expect(checkoutWithWaitlistMock).toHaveBeenCalledWith('exhibitor-1', new Set(['item-full']))
    );
  });

  it('does not carry a split token when checkout has no waitlisted lines', async () => {
    judgeDayCapacityState.judgeDays = [
      {
        judgeId: 'judge-1',
        judgeName: 'Judge Judy',
        showDate: '2026-09-01',
        capacity: 10,
        confirmedCount: 8,
        waitlistCount: 1,
        mailInReserved: 0,
        availableSpots: 2,
        classIds: ['class-open', 'class-full'],
        classNames: ['Open Class', 'Full Class'],
      },
    ];
    checkoutWithWaitlistMock.mockResolvedValue({
      confirmed: ['class-open', 'class-full'],
      waitlisted: [],
    });

    const { user } = render(<CartPage />, { initialRoute: '/cart' });

    await user.click(screen.getByRole('button', { name: 'Checkout' }));

    await waitFor(() =>
      expect(checkoutWithWaitlistMock).toHaveBeenCalledWith('exhibitor-1', new Set())
    );
    expect(createEntryCheckoutSessionMock).toHaveBeenCalledWith('cart-1', undefined);
    expect(sessionStorage.getItem(STORAGE_KEYS.CART_SPLIT_CHECKOUT)).toBeNull();
  });

  describe('submit-time capacity re-check', () => {
    it('splits on capacity fetched at submit, not the render-time snapshot', async () => {
      // Rendered with room for both lines...
      judgeDayCapacityState.judgeDays = [
        {
          judgeId: 'judge-1',
          judgeName: 'Judge Judy',
          showDate: '2026-09-01',
          capacity: 10,
          confirmedCount: 8,
          waitlistCount: 0,
          mailInReserved: 0,
          availableSpots: 2,
          classIds: ['class-open', 'class-full'],
          classNames: ['Open Class', 'Full Class'],
        },
      ];
      checkoutWithWaitlistMock.mockResolvedValue({ confirmed: ['class-open'], waitlisted: [] });

      // ...but the show fills up while the exhibitor is deciding. Assigned
      // before render: CartPage captures the refetch reference when it renders.
      // Without the re-check this went to Stripe as fully payable, was charged,
      // and then refunded by the server's overflow path.
      judgeDayCapacityState.refetch = vi.fn().mockResolvedValue({
        data: {
          judgeDays: [
            {
              judgeId: 'judge-1',
              judgeName: 'Judge Judy',
              showDate: '2026-09-01',
              capacity: 10,
              confirmedCount: 10,
              waitlistCount: 0,
              mailInReserved: 0,
              availableSpots: 0,
              classIds: ['class-open', 'class-full'],
              classNames: ['Open Class', 'Full Class'],
            },
          ],
          fullClassIds: [],
        },
        isError: false,
      });

      const { user } = render(<CartPage />, { initialRoute: '/cart' });

      await user.click(screen.getByRole('button', { name: 'Checkout' }));

      await waitFor(() => expect(checkoutWithWaitlistMock).toHaveBeenCalled());
      const waitlistedIds = checkoutWithWaitlistMock.mock.calls[0][1] as Set<string>;
      expect(waitlistedIds.size).toBeGreaterThan(0);
    });

    it('stops checkout rather than charging against capacity it could not verify', async () => {
      judgeDayCapacityState.refetch = vi.fn().mockResolvedValue({
        // refetch() resolves with the error inside the result, and `data` still
        // holds the last SUCCESSFUL payload - so falling back to it would send
        // the exhibitor to Stripe on exactly the stale snapshot the re-check
        // exists to replace.
        data: {
          judgeDays: judgeDayCapacityState.judgeDays,
          fullClassIds: judgeDayCapacityState.fullClassIds,
        },
        isError: true,
      });

      const { user } = render(<CartPage />, { initialRoute: '/cart' });

      await user.click(screen.getByRole('button', { name: 'Checkout' }));

      // setError is mocked at the store boundary in this suite, so assert the
      // message the page reports rather than its rendered text.
      await waitFor(() =>
        expect(setErrorMock).toHaveBeenCalledWith(
          expect.stringMatching(/could not confirm which classes are still open/i)
        )
      );
      expect(checkoutWithWaitlistMock).not.toHaveBeenCalled();
      expect(createEntryCheckoutSessionMock).not.toHaveBeenCalled();
    });
  });
});

/**
 * MYK9-1661: the wizard's card hand-off must check out THE SUBMITTED SHOW's
 * cart, not the exhibitor's newest populated cart across shows. Drives the real
 * hand-off (`submitRegistrationCartCheckout` on the real cart store) through
 * the real shared checkout (MYK9-1964: straight to Stripe, no /cart stop),
 * against an in-memory cart database holding a newer populated cart for another
 * show, and checks a Stripe cancel return lands on that show's cart with its
 * lines intact.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { createFakeCartDb, fakeCart, fakeCartItem, type FakeCartDb } from '@/test/utils/fakeCartDb';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeCartDb }));
const createEntryCheckoutSessionMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => holder.db.from(table),
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
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
  fetchCartCapacity: async () => ({ judgeDays: [], classSpots: [], waitlistClassIds: [] }),
}));
vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return { ...actual, createEntryCheckoutSession: createEntryCheckoutSessionMock };
});
vi.mock('@/components/cart/CartItemCard', () => ({ CartItemCard: () => <div>Cart Item</div> }));
vi.mock('@/components/cart/CartSummary', () => ({
  CartSummary: ({ onCheckout }: { onCheckout: () => void }) => (
    <button type="button" onClick={onCheckout}>
      Checkout
    </button>
  ),
}));

import CartPage from '@/pages/CartPage';
import CheckoutCancelPage from '@/pages/CheckoutCancelPage';
import { CheckoutSessionError } from '@/lib/stripe';
import { useCartStore } from '@/store/cartStore';
import { resetEnsureCartInFlight } from '@/store/cartStore.ensureCart';
import {
  startWizardCardCheckout,
  submitRegistrationCartCheckout,
} from '@/features/registration/registrationCartCheckout';

const SHOW_A = 'show-a';
const SHOW_D = 'show-d';
const CLASSES = [
  {
    id: 'class-a',
    name: 'Novice A',
    level: 'Novice',
    trial_id: 'trial-a',
    allow_waitlist: false,
    status: 'open',
  },
  {
    id: 'class-d',
    name: 'Novice D',
    level: 'Novice',
    trial_id: 'trial-d',
    allow_waitlist: false,
    status: 'open',
  },
];

function seed(newerShowFeeCents: number) {
  holder.db = createFakeCartDb({
    carts: [
      fakeCart({ id: 'cart-a', show_id: SHOW_A, created_at: '2026-08-01T00:00:00.000Z' }),
      fakeCart({
        id: 'cart-d',
        show_id: SHOW_D,
        created_at: '2026-09-10T00:00:00.000Z',
        subtotal_cents: newerShowFeeCents * 100,
      }),
    ],
    items: [
      fakeCartItem({
        id: 'item-d',
        cart_id: 'cart-d',
        dog_id: 'dog-d',
        class_id: 'class-d',
        entry_fee_cents: newerShowFeeCents * 100,
      }),
    ],
    classes: CLASSES,
    dogs: [
      { id: 'dog-a', name: 'Rex', call_name: 'Rex' },
      { id: 'dog-d', name: 'Dee', call_name: 'Dee' },
    ],
  });
}

/** Submits show A's wizard through the real store and the real shared checkout. */
async function submitShowA(entryFee: number) {
  const store = useCartStore.getState();
  const navigate = vi.fn();
  const result = await submitRegistrationCartCheckout({
    showId: SHOW_A,
    ownerResolution: { ok: true, ownerId: 'people-1' },
    exhibitorProfileId: 'exhibitor-1',
    classSelections: [
      { dogId: 'dog-a', trialId: 'trial-a', selectedClasses: [{ classId: 'class-a' }] },
    ],
    handlerAssignments: {},
    classes: [{ id: 'class-a', entryFee }],
    showFeeInfo: {
      preEntryFee: String(entryFee),
      dayOfShowFee: String(entryFee),
      startDate: '2099-05-01',
    },
    deps: {
      ensureCart: store.ensureCart,
      clearCart: store.clearCart,
      addItem: store.addItem,
      abandonCart: store.abandonCart,
      startCheckout: () =>
        startWizardCardCheckout({
          showId: SHOW_A,
          exhibitorProfileId: 'exhibitor-1',
          getCart: () => useCartStore.getState().cart,
          checkoutWithWaitlist: store.checkoutWithWaitlist,
          removeItem: store.removeItem,
        }),
      navigate,
    },
  });
  return { result, navigate };
}

describe('wizard hand-off opens the submitted show cart (MYK9-1661)', () => {
  beforeEach(() => {
    resetEnsureCartInFlight();
    useCartStore.getState().reset();
    createEntryCheckoutSessionMock.mockClear();
  });

  it.each([
    ['differing amounts', 20, 35],
    ['equal amounts', 30, 30],
  ])('sends show A, not the newer show D cart, to Stripe, with %s', async (_label, feeA, feeD) => {
    seed(feeD);
    const { result, navigate } = await submitShowA(feeA);
    // The hand-off must not have touched the newer show's cart.
    expect(holder.db.items.filter(i => i.cart_id === 'cart-d')).toHaveLength(1);

    // One session, for show A's cart, with only the ids /cart's Pay sends: the
    // amount is priced by stripe-checkout from the cart row, never sent.
    expect(createEntryCheckoutSessionMock).toHaveBeenCalledTimes(1);
    expect(createEntryCheckoutSessionMock).toHaveBeenCalledWith('cart-a', { showId: SHOW_A });
    expect(result).toBe('redirecting');
    expect(navigate).not.toHaveBeenCalled();

    const cart = useCartStore.getState().cart;
    expect(cart?.id).toBe('cart-a');
    expect(cart?.show_id).toBe(SHOW_A);
    expect(cart?.items.map(i => [i.dog_id, i.class_id, i.entry_fee_cents])).toEqual([
      ['dog-a', 'class-a', feeA * 100],
    ]);
    expect(holder.db.items.filter(i => i.cart_id === 'cart-d').map(i => i.entry_fee_cents)).toEqual(
      [feeD * 100]
    );
  });

  it.each([
    ['differing amounts', 20, 35],
    ['equal amounts', 30, 30],
  ])('a Stripe cancel return lands on show A, not show D, with %s', async (_label, feeA, feeD) => {
    seed(feeD);
    await submitShowA(feeA);

    const { user } = render(
      <Routes>
        <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />
        <Route path="/cart" element={<CartPage />} />
      </Routes>,
      { initialRoute: '/checkout/cancel' }
    );
    await user.click(await screen.findByRole('button', { name: 'Return to Your Entry' }));

    await waitFor(() => expect(useCartStore.getState().cart?.id).toBe('cart-a'));
    expect(useCartStore.getState().cart?.show_id).toBe(SHOW_A);
    // MYK9-1964: the lines the wizard filled are still there to pay from /cart.
    expect(
      useCartStore.getState().cart?.items.map(i => [i.dog_id, i.class_id, i.entry_fee_cents])
    ).toEqual([['dog-a', 'class-a', feeA * 100]]);
    expect(holder.db.items.filter(i => i.cart_id === 'cart-d')).toHaveLength(1);

    // ...and paying from there opens the same session for the same cart.
    await user.click(await screen.findByRole('button', { name: 'Checkout' }));
    await waitFor(() => expect(createEntryCheckoutSessionMock).toHaveBeenCalledTimes(2));
    expect(createEntryCheckoutSessionMock).toHaveBeenLastCalledWith('cart-a', { showId: SHOW_A });
  });

  it('a session that will not open leaves no lines in the cart (MYK9-1964)', async () => {
    seed(35);
    createEntryCheckoutSessionMock.mockRejectedValueOnce(
      new CheckoutSessionError('This club cannot take card payments yet.', 403, null, true)
    );

    await expect(submitShowA(20)).rejects.toThrow('This club cannot take card payments yet.');
    expect(holder.db.items.filter(i => i.cart_id === 'cart-a')).toHaveLength(0);
    expect(useCartStore.getState().cart?.items ?? []).toHaveLength(0);
    // The other show's cart is untouched.
    expect(holder.db.items.filter(i => i.cart_id === 'cart-d')).toHaveLength(1);
  });
});

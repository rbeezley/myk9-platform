/**
 * MYK9-1661: the wizard's Submit & pay hand-off must open THE SUBMITTED SHOW's
 * cart, not the exhibitor's newest populated cart across shows. Drives the real
 * hand-off (`submitRegistrationCartCheckout` on the real cart store) and feeds
 * the path it navigates to into the real CartPage hydration, against an
 * in-memory cart database holding a newer populated cart for another show.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { createFakeCartDb, fakeCart, fakeCartItem, type FakeCartDb } from '@/test/utils/fakeCartDb';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeCartDb }));

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
}));
vi.mock('@/components/cart/CartItemCard', () => ({ CartItemCard: () => <div>Cart Item</div> }));
vi.mock('@/components/cart/CartSummary', () => ({
  CartSummary: () => <button type="button">Checkout</button>,
}));

import CartPage from '@/pages/CartPage';
import { useCartStore } from '@/store/cartStore';
import { resetEnsureCartInFlight } from '@/store/cartStore.ensureCart';
import { submitRegistrationCartCheckout } from '@/features/registration/registrationCartCheckout';

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

/** Submits show A's wizard through the real store, returns where it navigated. */
async function submitShowA(entryFee: number): Promise<string> {
  const store = useCartStore.getState();
  let target = '';
  await submitRegistrationCartCheckout({
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
      navigate: path => {
        target = path;
      },
    },
  });
  return target;
}

describe('wizard hand-off opens the submitted show cart (MYK9-1661)', () => {
  beforeEach(() => {
    resetEnsureCartInFlight();
    useCartStore.getState().reset();
  });

  it.each([
    ['differing amounts', 20, 35],
    ['equal amounts', 30, 30],
  ])('shows show A, not the newer show D cart, with %s', async (_label, feeA, feeD) => {
    seed(feeD);
    const target = await submitShowA(feeA);
    // The hand-off must not have touched the newer show's cart.
    expect(holder.db.items.filter(i => i.cart_id === 'cart-d')).toHaveLength(1);

    useCartStore.getState().reset();
    render(<CartPage />, { initialRoute: target });

    await waitFor(() => expect(useCartStore.getState().cart).not.toBeNull());
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
});

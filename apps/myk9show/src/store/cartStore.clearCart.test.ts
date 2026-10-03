/**
 * MYK9-975: Clear Cart on a cart with an open Stripe Checkout session.
 *
 * The exhibitor can still pay that Checkout tab after pressing Clear Cart. The
 * stripe-webhook refund branch (claim_abandoned_cart_refund) only matches a cart
 * that is 'abandoned' or 'expired' AND still holds the paid session id, so Clear
 * Cart must mark the cart abandoned and leave the session id alone. Nulling it
 * (the old behaviour) sent the late payment to a hand-refund alert instead.
 *
 * The cart tables are the in-memory ones, with the guard triggers a non-service
 * caller meets: the session id cannot be written non-null, and a status cannot
 * move to 'active'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeCartDb, fakeCart, fakeCartItem, type FakeCartDb } from '@/test/utils/fakeCartDb';

const holder = vi.hoisted(() => ({
  db: null as unknown as FakeCartDb,
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => holder.db.from(table),
    rpc: (name: string, args: unknown) => holder.rpc(name, args),
  },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useCartStore } from './cartStore';
import { resetEnsureCartInFlight } from './cartStore.ensureCart';

const STORAGE_KEY = 'myk9-cart-storage';

function seed(sessionId: string | null) {
  holder.db = createFakeCartDb({
    carts: [
      fakeCart({
        id: 'cart-1',
        stripe_checkout_session_id: sessionId,
        subtotal_cents: 3000,
        total_cents: 3210,
        platform_fee_cents: 210,
      }),
    ],
    items: [fakeCartItem({ id: 'item-1', cart_id: 'cart-1', class_id: 'class-open' })],
    classes: [
      {
        id: 'class-open',
        name: 'Interior Novice A',
        level: 'Novice',
        trial_id: 'trial-1',
        allow_waitlist: false,
        status: 'upcoming',
      },
    ],
    dogs: [{ id: 'dog-1', name: 'Rover Registered', call_name: 'Rover' }],
  });
}

const cartWrites = () =>
  holder.db.log.filter(query => query.table === 'entry_carts' && query.op === 'update');

beforeEach(() => {
  holder.rpc.mockReset();
  holder.rpc.mockResolvedValue({ data: [], error: null });
  resetEnsureCartInFlight();
  useCartStore.getState().reset();
  localStorage.removeItem(STORAGE_KEY);
});

describe('clearCart with an open checkout session (MYK9-975)', () => {
  beforeEach(async () => {
    seed('cs_open');
    await useCartStore.getState().loadActiveCart('exhibitor-1');
    holder.db.log.length = 0;
  });

  it('marks the cart abandoned and writes nothing else to it, so the session id is kept', async () => {
    expect(await useCartStore.getState().clearCart()).toBe(true);

    const writes = cartWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.payload).toEqual({ status: 'abandoned' });
    expect(writes[0]?.filters).toContain('id=cart-1');
    const abandoned = holder.db.carts.find(cart => cart.id === 'cart-1');
    expect(abandoned?.status).toBe('abandoned');
    expect(abandoned?.stripe_checkout_session_id).toBe('cs_open');
  });

  it('leaves the exhibitor an empty active cart with no session, and exactly one active cart', async () => {
    await useCartStore.getState().clearCart();

    const active = holder.db.carts.filter(cart => cart.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0]?.id).not.toBe('cart-1');
    expect(active[0]?.stripe_checkout_session_id).toBeNull();

    const held = useCartStore.getState().cart;
    expect(held?.id).toBe(active[0]?.id);
    expect(held?.status).toBe('active');
    expect(held?.items).toEqual([]);
    expect(held?.total_cents).toBe(0);
    expect(held?.stripe_checkout_session_id ?? null).toBeNull();
  });

  it('gives a cart a new entry can be added to', async () => {
    await useCartStore.getState().clearCart();

    const added = await useCartStore
      .getState()
      .addItem({ dogId: 'dog-1', classId: 'class-open', entryFeeCents: 3000 });

    expect(added).toBe(true);
    const newCartId = useCartStore.getState().cart?.id;
    expect(newCartId).not.toBe('cart-1');
    expect(holder.db.items.filter(item => item.cart_id === newCartId)).toHaveLength(1);
  });

  it('changes nothing and creates no new cart when the cart was paid meanwhile (submitted)', async () => {
    // The exhibitor paid in the open tab; the webhook submitted the cart. The
    // status guard refuses a non-service caller, so Clear Cart must fail loud.
    const paid = holder.db.carts.find(cart => cart.id === 'cart-1');
    if (paid) paid.status = 'submitted';

    expect(await useCartStore.getState().clearCart()).toBe(false);

    expect(holder.db.carts).toHaveLength(1);
    expect(holder.db.carts[0]).toMatchObject({
      id: 'cart-1',
      status: 'submitted',
      stripe_checkout_session_id: 'cs_open',
    });
    expect(holder.db.items).toHaveLength(1);
    expect(useCartStore.getState().cart?.id).toBe('cart-1');
  });
});

describe('clearCart with no checkout session (MYK9-975)', () => {
  beforeEach(async () => {
    seed(null);
    await useCartStore.getState().loadActiveCart('exhibitor-1');
    holder.db.log.length = 0;
  });

  it('keeps clearing the same cart: items deleted, totals zeroed, still active, no new cart', async () => {
    expect(await useCartStore.getState().clearCart()).toBe(true);

    expect(cartWrites().map(write => write.payload)).toEqual([
      {
        subtotal_cents: 0,
        platform_fee_cents: 0,
        total_cents: 0,
        stripe_checkout_session_id: null,
      },
    ]);
    expect(holder.db.carts).toHaveLength(1);
    expect(holder.db.carts[0]).toMatchObject({ id: 'cart-1', status: 'active', total_cents: 0 });
    expect(holder.db.items).toEqual([]);
    expect(useCartStore.getState().cart).toMatchObject({ id: 'cart-1', items: [] });
  });
});

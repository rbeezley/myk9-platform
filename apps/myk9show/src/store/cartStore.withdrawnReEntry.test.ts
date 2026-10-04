/**
 * MYK9-982: a cart line for a class the dog withdrew from is removed on load
 * (one rule shared with the class step), and the exhibitor is told why.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeCartDb, fakeCart, fakeCartItem, type FakeCartDb } from '@/test/utils/fakeCartDb';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeCartDb }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => holder.db.from(table),
    rpc: async () => ({ data: [], error: null }),
  },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useCartStore } from './cartStore';
import { resetEnsureCartInFlight } from './cartStore.ensureCart';

const entryRow = (overrides: Record<string, unknown>) => ({
  show_id: 'show-1',
  dog_id: 'dog-1',
  class_id: 'class-withdrawn',
  entry_status: 'withdrawn',
  check_in_status: 'none',
  payment_status: 'refunded',
  deleted_at: null,
  ...overrides,
});

function seed(entries: Array<Record<string, unknown>>) {
  holder.db = createFakeCartDb({
    carts: [fakeCart({ id: 'cart-1' })],
    items: [
      fakeCartItem({ id: 'item-withdrawn', cart_id: 'cart-1', class_id: 'class-withdrawn' }),
      fakeCartItem({ id: 'item-open', cart_id: 'cart-1', class_id: 'class-open' }),
    ],
    classes: [
      {
        id: 'class-withdrawn',
        name: 'Exterior Excellent',
        level: 'Excellent',
        trial_id: 't1',
        allow_waitlist: false,
        status: 'upcoming',
      },
      {
        id: 'class-open',
        name: 'Interior Novice A',
        level: 'Novice',
        trial_id: 't1',
        allow_waitlist: false,
        status: 'upcoming',
      },
    ],
    dogs: [{ id: 'dog-1', name: 'Maple Registered', call_name: 'Maple' }],
    entries,
  });
}

beforeEach(() => {
  resetEnsureCartInFlight();
  useCartStore.getState().reset();
  localStorage.clear();
});

describe('withdrawn re-entry in the cart (MYK9-982)', () => {
  it('removes the line and explains it as withdrawn', async () => {
    seed([entryRow({})]);

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(cart?.items.map(item => item.id)).toEqual(['item-open']);
    expect(useCartStore.getState().droppedClosedClassItems).toEqual([
      {
        cartId: 'cart-1',
        itemId: 'item-withdrawn',
        dogName: 'Maple',
        className: 'Exterior Excellent',
        reason: 'Withdrawn from this class',
      },
    ]);
  });

  it('treats a pulled entry the same way', async () => {
    seed([entryRow({ entry_status: 'confirmed', check_in_status: 'pulled' })]);

    await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(useCartStore.getState().droppedClosedClassItems.map(i => i.reason)).toEqual([
      'Withdrawn from this class',
    ]);
  });

  it('says "Already entered" for a live paid entry, and still keeps an unpaid one', async () => {
    seed([entryRow({ entry_status: 'confirmed', payment_status: 'paid' })]);
    await useCartStore.getState().loadActiveCart('exhibitor-1');
    expect(useCartStore.getState().droppedClosedClassItems.map(i => i.reason)).toEqual([
      'Already entered',
    ]);

    resetEnsureCartInFlight();
    useCartStore.getState().reset();
    seed([entryRow({ entry_status: 'pending', payment_status: 'pending' })]);
    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1');
    expect(cart?.items.map(item => item.id)).toEqual(['item-withdrawn', 'item-open']);
  });
});

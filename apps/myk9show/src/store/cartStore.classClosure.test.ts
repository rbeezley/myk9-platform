/**
 * MYK9-656: a recovered cart's lines in a class that has closed or filled are
 * dropped on load, and the exhibitor is told which and why.
 *
 * The cart tables are the in-memory ones with the real column shapes. The
 * reconcile RPC is emulated the way the server runs it: it deletes the blocked
 * lines from the table and returns them with the server's block code. What the
 * server decides is covered against the real policies and real column values in
 * supabase/tests/myk9_705_656_class_entry_availability_test.sql; this pins what
 * the store does with the answer.
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

/** Classes with the real `classes_status_check` values and live limits. */
const CLASSES = [
  {
    id: 'class-full',
    name: 'Handler Discrimination Advanced',
    level: 'Advanced',
    trial_id: 'trial-1',
    allow_waitlist: false,
    max_entries: 1,
    status: 'upcoming',
  },
  {
    id: 'class-cancelled',
    name: 'Exterior Master',
    level: 'Master',
    trial_id: 'trial-1',
    allow_waitlist: false,
    status: 'cancelled',
  },
  {
    id: 'class-open',
    name: 'Interior Novice A',
    level: 'Novice',
    trial_id: 'trial-1',
    allow_waitlist: false,
    status: 'upcoming',
  },
];

function seed() {
  holder.db = createFakeCartDb({
    carts: [fakeCart({ id: 'cart-1', stripe_checkout_session_id: 'cs_old' })],
    items: [
      fakeCartItem({ id: 'item-full', cart_id: 'cart-1', class_id: 'class-full' }),
      fakeCartItem({ id: 'item-cancelled', cart_id: 'cart-1', class_id: 'class-cancelled' }),
      fakeCartItem({ id: 'item-open', cart_id: 'cart-1', class_id: 'class-open' }),
    ],
    classes: CLASSES,
    dogs: [{ id: 'dog-1', name: 'Rover Registered', call_name: 'Rover' }],
  });
}

/** The server's answer, applied the way the RPC applies it: delete, then report. */
function serverDrops(drops: Record<string, string>) {
  holder.rpc.mockImplementation(async (name: string, args: { p_cart_id: string }) => {
    if (name !== 'reconcile_cart_closed_classes') throw new Error(`unexpected rpc ${name}`);
    const removed = holder.db.items.filter(
      item => item.cart_id === args.p_cart_id && item.id in drops
    );
    holder.db.items = holder.db.items.filter(item => !(item.id in drops));
    return {
      data: removed.map(item => ({
        item_id: item.id,
        class_id: item.class_id,
        dog_id: item.dog_id,
        reason: drops[item.id],
      })),
      error: null,
    };
  });
}

beforeEach(() => {
  holder.rpc.mockReset();
  resetEnsureCartInFlight();
  useCartStore.getState().reset();
  localStorage.removeItem(STORAGE_KEY);
  seed();
});

describe('recovered cart re-check (MYK9-656)', () => {
  it('drops lines in a full and a cancelled class, keeps the rest, and says why', async () => {
    serverDrops({ 'item-full': 'full', 'item-cancelled': 'cancelled' });

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(holder.rpc).toHaveBeenCalledWith('reconcile_cart_closed_classes', {
      p_cart_id: 'cart-1',
    });
    expect(cart?.items.map(item => item.id)).toEqual(['item-open']);
    expect(holder.db.items.map(item => item.id)).toEqual(['item-open']);
    expect(useCartStore.getState().droppedClosedClassItems).toEqual([
      {
        cartId: 'cart-1',
        itemId: 'item-full',
        dogName: 'Rover',
        className: 'Handler Discrimination Advanced',
        reason: 'This class is full',
      },
      {
        cartId: 'cart-1',
        itemId: 'item-cancelled',
        dogName: 'Rover',
        className: 'Exterior Master',
        reason: 'This class was cancelled',
      },
    ]);
  });

  it('keeps the explanation across a reload, because the lines are already gone', async () => {
    serverDrops({ 'item-cancelled': 'cancelled' });

    await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(localStorage.getItem(STORAGE_KEY) ?? '').toContain('item-cancelled');
  });

  it('accumulates drops across loads until dismissed', async () => {
    serverDrops({ 'item-cancelled': 'cancelled' });
    await useCartStore.getState().loadActiveCart('exhibitor-1');

    serverDrops({ 'item-full': 'full' });
    await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(useCartStore.getState().droppedClosedClassItems.map(item => item.itemId)).toEqual([
      'item-cancelled',
      'item-full',
    ]);

    useCartStore.getState().dismissDroppedClosedClassItems();
    expect(useCartStore.getState().droppedClosedClassItems).toEqual([]);
  });

  it('keeps the cart on screen, unchanged and unexplained, when the re-check fails', async () => {
    holder.rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(cart?.items.map(item => item.id)).toEqual(['item-full', 'item-cancelled', 'item-open']);
    expect(useCartStore.getState().cart).not.toBeNull();
    expect(useCartStore.getState().droppedClosedClassItems).toEqual([]);
  });

  it("forgets another cart's removals when a different cart loads (Codex P2, PR #2438)", async () => {
    serverDrops({ 'item-cancelled': 'cancelled' });
    await useCartStore.getState().loadActiveCart('exhibitor-1');
    expect(useCartStore.getState().droppedClosedClassItems).toHaveLength(1);

    holder.db.carts = [
      fakeCart({ id: 'cart-2', show_id: 'show-2', created_at: '2026-09-02T00:00:00.000Z' }),
    ];
    holder.db.items = [
      fakeCartItem({ id: 'item-other', cart_id: 'cart-2', class_id: 'class-open' }),
    ];
    serverDrops({});
    await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(useCartStore.getState().cart?.id).toBe('cart-2');
    expect(useCartStore.getState().droppedClosedClassItems).toEqual([]);
  });

  it('records which cart each removal came from', async () => {
    serverDrops({ 'item-cancelled': 'cancelled' });
    await useCartStore.getState().loadActiveCart('exhibitor-1');
    expect(useCartStore.getState().droppedClosedClassItems[0]).toMatchObject({
      itemId: 'item-cancelled',
      cartId: 'cart-1',
    });
  });

  it('clears the explanation at an account boundary', async () => {
    serverDrops({ 'item-cancelled': 'cancelled' });
    await useCartStore.getState().loadActiveCart('exhibitor-1');

    useCartStore.getState().reset();

    expect(useCartStore.getState().droppedClosedClassItems).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('item-cancelled');
  });
});

/**
 * MYK9-2340: concurrent addItem / removeItem / updateItem must not drop items
 * or write stale totals.
 *
 * Each mutation used to snapshot `get().cart` BEFORE awaiting its
 * `entry_cart_items` write and then rebuild `items` and the `entry_carts`
 * totals from that snapshot, so two overlapping calls overwrote each other.
 * Every test here holds the item writes open on deferreds so the calls
 * genuinely overlap, then asserts the settled state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  table: string;
  op?: 'insert' | 'delete' | 'update';
  payload?: Record<string, unknown>;
  eqs: Array<{ column: string; value: unknown }>;
}

const calls = vi.hoisted(() => [] as Call[]);
const mockFrom = vi.hoisted(() => vi.fn());
const gates = vi.hoisted(() => ({
  /** Pending entry_cart_items writes, in the order they were issued. */
  pending: [] as Array<() => void>,
  hold: true,
  cartsUpdateError: null as { message: string } | null,
}));

class MockBuilder {
  private readonly call: Call;
  constructor(table: string) {
    this.call = { table, eqs: [] };
    calls.push(this.call);
  }
  select() {
    return this;
  }
  insert(payload: Record<string, unknown>) {
    this.call.op = 'insert';
    this.call.payload = payload;
    return this;
  }
  delete() {
    this.call.op = 'delete';
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.call.op = 'update';
    this.call.payload = payload;
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.eqs.push({ column, value });
    return this;
  }
  private result() {
    if (this.call.table === 'entry_carts') {
      return { data: null, error: gates.cartsUpdateError };
    }
    if (this.call.op === 'insert') {
      const p = this.call.payload as Record<string, unknown>;
      return {
        data: { ...p, id: `item-${p.class_id as string}`, created_at: '2026-09-15T00:00:00.000Z' },
        error: null,
      };
    }
    return { data: null, error: null };
  }
  private settle() {
    if (this.call.table !== 'entry_cart_items' || !gates.hold) {
      return Promise.resolve(this.result());
    }
    return new Promise(resolve => {
      gates.pending.push(() => resolve(this.result()));
    });
  }
  single() {
    return this.settle();
  }
  then(resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) {
    return this.settle().then(resolve, reject);
  }
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useCartStore } from './cartStore';
import {
  calculateCartTotals,
  hasPendingCartMutations,
  resetCartMutationQueue,
  runCartMutation,
} from './cartStore.helpers';

const FEE = 3000;

const row = (id: string, classId: string, fee = FEE) => ({
  id,
  cart_id: 'cart-1',
  dog_id: 'dog-1',
  class_id: classId,
  entry_fee_cents: fee,
  handler_id: null,
  jump_height: null,
  special_requests: null,
  created_at: '2026-09-15T00:00:00.000Z',
  junior_fee_declared: false,
});

const seedCart = (items: ReturnType<typeof row>[]) => {
  const totals = calculateCartTotals(items as never);
  useCartStore.setState({
    cart: {
      id: 'cart-1',
      show_id: 'show-1',
      exhibitor_id: 'exhibitor-1',
      status: 'active',
      expires_at: '2099-01-01T00:00:00.000Z',
      created_at: '2026-09-15T00:00:00.000Z',
      updated_at: '2026-09-15T00:00:00.000Z',
      subtotal_cents: totals.subtotal,
      platform_fee_cents: totals.platformFee,
      total_cents: totals.total,
      stripe_checkout_session_id: null,
      items,
    } as never,
    error: null,
  });
};

const newItem = (classId: string) => ({ dogId: 'dog-1', classId, entryFeeCents: FEE });

/** Let every awaiting mutation run to its next suspension point. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Release every gated item write issued so far, then let the mutations finish. */
const releaseAll = async () => {
  await flush();
  // Serialized mutations issue their next item write only after the previous one
  // finishes, so keep releasing until nothing new shows up.
  for (let round = 0; round < 20 && gates.pending.length > 0; round++) {
    for (const release of gates.pending.splice(0)) release();
    await flush();
  }
};

/** The order every table write was issued in, e.g. "entry_cart_items:insert". */
const writeOrder = () => calls.filter(c => c.op).map(c => `${c.table}:${c.op}`);

const cartsSubtotals = () =>
  calls
    .filter(c => c.table === 'entry_carts' && c.op === 'update')
    .map(c => c.payload?.subtotal_cents);

const lastCartsPayload = () => {
  const writes = calls.filter(c => c.table === 'entry_carts' && c.op === 'update');
  return writes[writes.length - 1]?.payload;
};

const assertTotalsMatchItems = () => {
  const cart = useCartStore.getState().cart!;
  const expected = calculateCartTotals(cart.items);
  expect(cart.subtotal_cents).toBe(expected.subtotal);
  expect(cart.platform_fee_cents).toBe(expected.platformFee);
  expect(cart.total_cents).toBe(expected.total);
};

describe('cartStore concurrent mutations (MYK9-2340)', () => {
  beforeEach(() => {
    calls.length = 0;
    gates.pending.length = 0;
    gates.hold = true;
    gates.cartsUpdateError = null;
    resetCartMutationQueue();
    mockFrom.mockReset();
    mockFrom.mockImplementation((table: string) => new MockBuilder(table));
    useCartStore.setState({ cart: null, error: null });
  });

  afterEach(() => {
    resetCartMutationQueue();
    useCartStore.setState({ cart: null, error: null });
  });

  it('reports pending edits until the last queued removal settles', async () => {
    seedCart([row('item-1', 'class-1'), row('item-2', 'class-2')]);
    const store = useCartStore.getState();
    expect(hasPendingCartMutations('cart-1')).toBe(false);

    const first = store.removeItem('item-1');
    const second = store.removeItem('item-2');
    await flush();
    // The first write is held open and the second is queued behind it.
    expect(hasPendingCartMutations('cart-1')).toBe(true);
    expect(useCartStore.getState().cart!.items).toHaveLength(2);

    gates.pending.splice(0).forEach(release => release());
    await first;
    expect(hasPendingCartMutations('cart-1')).toBe(true);

    await releaseAll();
    await second;
    await flush();
    expect(hasPendingCartMutations('cart-1')).toBe(false);
    expect(useCartStore.getState().cart!.items).toHaveLength(0);
  });

  it('clears the pending state after a rejected mutation', async () => {
    const failing = runCartMutation('cart-1', () => Promise.reject(new Error('write failed')));
    expect(hasPendingCartMutations('cart-1')).toBe(true);
    await expect(failing).rejects.toThrow('write failed');
    await flush();
    expect(hasPendingCartMutations('cart-1')).toBe(false);
  });

  it('two overlapping addItem calls keep both items and sum the totals', async () => {
    seedCart([]);
    const store = useCartStore.getState();

    const first = store.addItem(newItem('class-1'));
    const second = store.addItem(newItem('class-2'));
    await releaseAll();
    expect(await Promise.all([first, second])).toEqual([true, true]);

    const cart = useCartStore.getState().cart!;
    expect(cart.items.map(i => i.class_id).sort()).toEqual(['class-1', 'class-2']);
    assertTotalsMatchItems();
    expect(cart.subtotal_cents).toBe(2 * FEE);
    // The stored totals must carry both items too, not the truncated snapshot.
    expect(lastCartsPayload()).toMatchObject({ subtotal_cents: 2 * FEE });
  });

  it('two overlapping removeItem calls drop both rows and zero the totals', async () => {
    seedCart([row('item-a', 'class-1'), row('item-b', 'class-2'), row('item-c', 'class-3')]);
    const store = useCartStore.getState();

    const first = store.removeItem('item-a');
    const second = store.removeItem('item-b');
    await releaseAll();
    expect(await Promise.all([first, second])).toEqual([true, true]);

    const cart = useCartStore.getState().cart!;
    // A just-removed row must not be resurrected by the slower call.
    expect(cart.items.map(i => i.id)).toEqual(['item-c']);
    assertTotalsMatchItems();
    expect(cart.subtotal_cents).toBe(FEE);
    expect(lastCartsPayload()).toMatchObject({ subtotal_cents: FEE });
  });

  it('an addItem overlapping a removeItem keeps the add and honors the remove', async () => {
    seedCart([row('item-a', 'class-1')]);
    const store = useCartStore.getState();

    const add = store.addItem(newItem('class-2'));
    const remove = store.removeItem('item-a');
    await releaseAll();
    await Promise.all([add, remove]);

    const cart = useCartStore.getState().cart!;
    expect(cart.items.map(i => i.id)).toEqual(['item-class-2']);
    assertTotalsMatchItems();
  });

  it('two overlapping updateItem calls on different items keep both fee changes', async () => {
    seedCart([row('item-a', 'class-1'), row('item-b', 'class-2')]);
    const store = useCartStore.getState();

    const first = store.updateItem('item-a', { entryFeeCents: 4000 });
    const second = store.updateItem('item-b', { entryFeeCents: 5000 });
    await releaseAll();
    expect(await Promise.all([first, second])).toEqual([true, true]);

    const cart = useCartStore.getState().cart!;
    expect(cart.items.map(i => i.entry_fee_cents)).toEqual([4000, 5000]);
    assertTotalsMatchItems();
    expect(cart.subtotal_cents).toBe(9000);
    expect(lastCartsPayload()).toMatchObject({ subtotal_cents: 9000 });
  });

  it('an updateItem overlapping an addItem does not drop the added row', async () => {
    seedCart([row('item-a', 'class-1')]);
    const store = useCartStore.getState();

    const update = store.updateItem('item-a', { entryFeeCents: 4000 });
    const add = store.addItem(newItem('class-2'));
    await releaseAll();
    await Promise.all([update, add]);

    const cart = useCartStore.getState().cart!;
    expect(cart.items.map(i => i.id).sort()).toEqual(['item-a', 'item-class-2']);
    assertTotalsMatchItems();
    expect(cart.subtotal_cents).toBe(4000 + FEE);
  });

  it('issues the entry_carts totals writes in call order', async () => {
    seedCart([]);
    const store = useCartStore.getState();

    const first = store.addItem(newItem('class-1'));
    const second = store.addItem(newItem('class-2'));
    await releaseAll();
    await Promise.all([first, second]);

    expect(cartsSubtotals()).toEqual([FEE, 2 * FEE]);
    expect(writeOrder()).toEqual([
      'entry_cart_items:insert',
      'entry_carts:update',
      'entry_cart_items:insert',
      'entry_carts:update',
    ]);
  });

  it('an addItem whose cart is reset during the item write does not bring it back', async () => {
    seedCart([row('item-a', 'class-1')]);

    const add = useCartStore.getState().addItem(newItem('class-2'));
    await flush();
    useCartStore.setState({ cart: null });
    await releaseAll();
    await add;

    expect(useCartStore.getState().cart).toBeNull();
  });

  it('a clearCart issued during an addItem leaves the same-id cart empty', async () => {
    seedCart([row('item-a', 'class-1')]);
    const store = useCartStore.getState();

    const add = store.addItem(newItem('class-2'));
    await flush();
    const clear = store.clearCart();
    await releaseAll();
    expect(await Promise.all([add, clear])).toEqual([true, true]);

    const cart = useCartStore.getState().cart!;
    expect(cart.id).toBe('cart-1');
    expect(cart.items).toEqual([]);
    expect(cart.total_cents).toBe(0);
    expect(lastCartsPayload()).toMatchObject({ subtotal_cents: 0, total_cents: 0 });
  });

  it('an addItem queued behind a clearCart adds to the cleared cart', async () => {
    seedCart([row('item-a', 'class-1')]);
    const store = useCartStore.getState();

    const clear = store.clearCart();
    const add = store.addItem(newItem('class-2'));
    await releaseAll();
    await Promise.all([clear, add]);

    expect(useCartStore.getState().cart!.items.map(i => i.id)).toEqual(['item-class-2']);
    assertTotalsMatchItems();
  });

  it('updateItem commits locally before surfacing a failed entry_carts write', async () => {
    seedCart([row('item-a', 'class-1')]);
    gates.hold = false;
    gates.cartsUpdateError = { message: 'carts update failed' };

    const ok = await useCartStore.getState().updateItem('item-a', { entryFeeCents: 4000 });

    // The caller still learns the write failed...
    expect(ok).toBe(false);
    // ...but the entry_cart_items update committed, so local state must match it.
    const cart = useCartStore.getState().cart!;
    expect(cart.items[0]?.entry_fee_cents).toBe(4000);
    assertTotalsMatchItems();
  });

  it.each(['addItem', 'removeItem', 'updateItem'] as const)(
    '%s keeps the checkout link locally when the entry_carts write fails',
    async method => {
      seedCart([row('item-a', 'class-1')]);
      useCartStore.setState({
        cart: { ...useCartStore.getState().cart!, stripe_checkout_session_id: 'cs_open' },
      });
      gates.hold = false;
      gates.cartsUpdateError = { message: 'carts update failed' };
      const store = useCartStore.getState();

      const ok =
        method === 'addItem'
          ? await store.addItem(newItem('class-2'))
          : method === 'removeItem'
            ? await store.removeItem('item-a')
            : await store.updateItem('item-a', { entryFeeCents: 4000 });

      expect(ok).toBe(false);
      expect(useCartStore.getState().cart!.stripe_checkout_session_id).toBe('cs_open');
    }
  );

  it('drops the checkout link locally once the entry_carts write succeeds', async () => {
    seedCart([row('item-a', 'class-1')]);
    useCartStore.setState({
      cart: { ...useCartStore.getState().cart!, stripe_checkout_session_id: 'cs_open' },
    });
    gates.hold = false;

    expect(await useCartStore.getState().removeItem('item-a')).toBe(true);

    expect(useCartStore.getState().cart!.stripe_checkout_session_id).toBeNull();
    expect(lastCartsPayload()).toMatchObject({ stripe_checkout_session_id: null });
  });
});

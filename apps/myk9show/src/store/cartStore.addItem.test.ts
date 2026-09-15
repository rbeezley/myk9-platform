/**
 * addItem must tolerate a row that is already in the cart (MYK9-530).
 *
 * `entry_cart_items_unique_dog_class_idx (cart_id, dog_id, class_id)` turns a
 * re-insert into a 23505. That is not a failure to add — the exhibitor's intent
 * is already satisfied — so addItem refreshes the local list from the DB and
 * reports success instead of surfacing "Failed to add to cart".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  table: string;
  insertPayload?: unknown;
  updatePayload?: Record<string, unknown>;
  selected?: boolean;
  eqs: Array<{ column: string; value: unknown }>;
}

const calls = vi.hoisted(() => [] as Call[]);
const mockFrom = vi.hoisted(() => vi.fn());
const behaviour = vi.hoisted(() => ({
  insertError: null as { code?: string; message: string } | null,
  updateError: null as { message: string } | null,
  itemsInDb: [] as unknown[],
}));

class MockBuilder {
  private readonly call: Call;
  constructor(table: string) {
    this.call = { table, eqs: [] };
    calls.push(this.call);
  }
  select() {
    this.call.selected = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.eqs.push({ column, value });
    return this;
  }
  insert(payload: unknown) {
    this.call.insertPayload = payload;
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.call.updatePayload = payload;
    return this;
  }
  private result() {
    if (this.call.insertPayload !== undefined) {
      if (behaviour.insertError) return { data: null, error: behaviour.insertError };
      return { data: { ...(this.call.insertPayload as object), id: 'item-new' }, error: null };
    }
    if (this.call.updatePayload !== undefined) {
      return { data: null, error: behaviour.updateError };
    }
    // Plain read of entry_cart_items by cart_id — the refresh path.
    return { data: behaviour.itemsInDb, error: null };
  }
  single() {
    return Promise.resolve(this.result());
  }
  maybeSingle() {
    return Promise.resolve(this.result());
  }
  then(resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useCartStore } from './cartStore';

const existingRow = {
  id: 'item-existing',
  cart_id: 'cart-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  entry_fee_cents: 3000,
  handler_id: null,
  jump_height: null,
  special_requests: null,
};

const seedCart = () =>
  useCartStore.setState({
    cart: {
      id: 'cart-1',
      show_id: 'show-1',
      exhibitor_id: 'exhibitor-1',
      status: 'active',
      expires_at: '2099-01-01T00:00:00.000Z',
      created_at: '2026-09-15T00:00:00.000Z',
      updated_at: '2026-09-15T00:00:00.000Z',
      subtotal_cents: 0,
      platform_fee_cents: 0,
      total_cents: 0,
      stripe_checkout_session_id: null,
      items: [],
    },
    error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

describe('cartStore.addItem — duplicate tolerance (MYK9-530)', () => {
  beforeEach(() => {
    calls.length = 0;
    behaviour.insertError = null;
    behaviour.updateError = null;
    behaviour.itemsInDb = [];
    mockFrom.mockReset();
    mockFrom.mockImplementation((table: string) => new MockBuilder(table));
    useCartStore.setState({ cart: null, error: null });
    seedCart();
  });

  afterEach(() => {
    useCartStore.setState({ cart: null, error: null });
  });

  it('a 23505 on the unique index refreshes the local list from the DB and succeeds', async () => {
    behaviour.insertError = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "entry_cart_items_unique_dog_class_idx"',
    };
    behaviour.itemsInDb = [existingRow];

    const added = await useCartStore
      .getState()
      .addItem({ dogId: 'dog-1', classId: 'class-1', entryFeeCents: 3000 });

    expect(added).toBe(true);
    // The local list is no longer short of the DB.
    expect(useCartStore.getState().cart?.items.map(i => i.id)).toEqual(['item-existing']);
    expect(useCartStore.getState().cart?.subtotal_cents).toBe(3000);
    expect(useCartStore.getState().error).toBeNull();
    // It refreshed by reading entry_cart_items for this cart.
    expect(
      calls.some(
        c =>
          c.table === 'entry_cart_items' &&
          c.insertPayload === undefined &&
          c.eqs.some(e => e.column === 'cart_id' && e.value === 'cart-1')
      )
    ).toBe(true);
  });

  it('any other insert error still fails the add', async () => {
    behaviour.insertError = { code: '42501', message: 'permission denied' };

    const added = await useCartStore
      .getState()
      .addItem({ dogId: 'dog-1', classId: 'class-1', entryFeeCents: 3000 });

    expect(added).toBe(false);
    expect(useCartStore.getState().cart?.items).toEqual([]);
  });

  it('a failed totals write still commits the inserted row locally', async () => {
    // The row IS in the DB; leaving it out of the local list is what set up the
    // next click's 23505 in the first place.
    behaviour.updateError = { message: 'totals update failed' };

    const added = await useCartStore
      .getState()
      .addItem({ dogId: 'dog-1', classId: 'class-1', entryFeeCents: 3000 });

    expect(added).toBe(false);
    expect(useCartStore.getState().cart?.items.map(i => i.id)).toEqual(['item-new']);
  });

  it('the happy path inserts and commits normally', async () => {
    const added = await useCartStore
      .getState()
      .addItem({ dogId: 'dog-1', classId: 'class-1', entryFeeCents: 3000 });

    expect(added).toBe(true);
    expect(useCartStore.getState().cart?.items.map(i => i.id)).toEqual(['item-new']);
    expect(useCartStore.getState().cart?.subtotal_cents).toBe(3000);
  });
});

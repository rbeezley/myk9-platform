/**
 * removeItem must commit the local removal before the totals write can throw
 * (MYK9-530 review, P3-a).
 *
 * The DELETE has already committed by then, so the row is gone from the DB
 * whatever the totals update does. Throwing first left the local list holding a
 * row that no longer exists: the chip stayed checked, and the next click took
 * the REMOVE branch again and deleted nothing. This is the mirror of the
 * ordering fix `addItem` already carries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  table: string;
  deleted?: boolean;
  updatePayload?: Record<string, unknown>;
  eqs: Array<{ column: string; value: unknown }>;
}

const calls = vi.hoisted(() => [] as Call[]);
const mockFrom = vi.hoisted(() => vi.fn());
const behaviour = vi.hoisted(() => ({
  deleteError: null as { message: string } | null,
  updateError: null as { message: string } | null,
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
  eq(column: string, value: unknown) {
    this.call.eqs.push({ column, value });
    return this;
  }
  delete() {
    this.call.deleted = true;
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.call.updatePayload = payload;
    return this;
  }
  private result() {
    if (this.call.deleted) return { data: null, error: behaviour.deleteError };
    if (this.call.updatePayload !== undefined) return { data: null, error: behaviour.updateError };
    return { data: [], error: null };
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
import { logger } from '@/services/LoggingService';

const row = (id: string, classId: string) => ({
  id,
  cart_id: 'cart-1',
  dog_id: 'dog-1',
  class_id: classId,
  entry_fee_cents: 3000,
  handler_id: null,
  jump_height: null,
  special_requests: null,
});

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
      subtotal_cents: 6000,
      platform_fee_cents: 0,
      total_cents: 6000,
      stripe_checkout_session_id: null,
      items: [row('item-a', 'class-1'), row('item-b', 'class-2')],
    },
    error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

describe('cartStore.removeItem — the local list commits before the totals write', () => {
  beforeEach(() => {
    calls.length = 0;
    behaviour.deleteError = null;
    behaviour.updateError = null;
    mockFrom.mockReset();
    mockFrom.mockImplementation((table: string) => new MockBuilder(table));
    useCartStore.setState({ cart: null, error: null });
    seedCart();
  });

  afterEach(() => {
    useCartStore.setState({ cart: null, error: null });
  });

  it('a failed totals write still drops the deleted row from the local list', async () => {
    behaviour.updateError = { message: 'totals update failed' };

    const removed = await useCartStore.getState().removeItem('item-a');

    // The caller is still told the operation did not fully succeed...
    expect(removed).toBe(false);
    // ...but the row is gone from the DB, so the local list must not still
    // claim to hold it.
    expect(useCartStore.getState().cart?.items.map(i => i.id)).toEqual(['item-b']);
  });

  it('a failed DELETE leaves the local list untouched', async () => {
    behaviour.deleteError = { message: 'permission denied' };

    const removed = await useCartStore.getState().removeItem('item-a');

    expect(removed).toBe(false);
    expect(useCartStore.getState().cart?.items.map(i => i.id)).toEqual(['item-a', 'item-b']);
  });

  it('the happy path removes the row and recomputes the totals', async () => {
    const removed = await useCartStore.getState().removeItem('item-a');

    expect(removed).toBe(true);
    expect(useCartStore.getState().cart?.items.map(i => i.id)).toEqual(['item-b']);
    expect(useCartStore.getState().cart?.subtotal_cents).toBe(3000);
  });
});

describe('cartStore.addItem — the no-cart early return is diagnosable (MYK9-542)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockFrom.mockImplementation((table: string) => new MockBuilder(table));
    vi.mocked(logger.warn).mockClear();
    useCartStore.setState({ cart: null, error: null });
  });

  afterEach(() => {
    useCartStore.setState({ cart: null, error: null });
  });

  it('logs which add was dropped instead of only setting an opaque error', async () => {
    const added = await useCartStore
      .getState()
      .addItem({ dogId: 'dog-1', classId: 'class-1', entryFeeCents: 3000 });

    expect(added).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no active cart'),
      'cartStore',
      expect.objectContaining({
        item: expect.objectContaining({ dogId: 'dog-1', classId: 'class-1' }),
      })
    );
  });
});

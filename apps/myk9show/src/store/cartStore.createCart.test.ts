/**
 * createCart must not fire a doomed INSERT (MYK9-581).
 *
 * `loadCart` only returns a cart whose `expires_at` is still in the future, but
 * `entry_carts_active_show_exhibitor_unique_idx` is scoped to `status =
 * 'active'` alone. A lapsed active row is therefore invisible to the read and
 * still fatal to the insert, so the wizard's load-then-create opener POSTed a
 * row that could only 409. The lapsed row is retired first, and the 23505
 * tolerance that cleans up after a genuine race matches the index BY NAME so a
 * violation of some other constraint is not reported as a reclaimed cart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  table: string;
  insertPayload?: unknown;
  updatePayload?: Record<string, unknown>;
  selected?: string | boolean;
  eqs: Array<{ column: string; value: unknown }>;
  ors: string[];
}

const calls = vi.hoisted(() => [] as Call[]);
const mockFrom = vi.hoisted(() => vi.fn());
const behaviour = vi.hoisted(() => ({
  insertError: null as { code?: string; message?: string; details?: string } | null,
  existingCart: null as Record<string, unknown> | null,
}));

class MockBuilder {
  private readonly call: Call;
  constructor(table: string) {
    this.call = { table, eqs: [], ors: [] };
    calls.push(this.call);
  }
  select(columns?: string) {
    this.call.selected = columns ?? true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.eqs.push({ column, value });
    return this;
  }
  gt(column: string, value: unknown) {
    this.call.eqs.push({ column: `gt:${column}`, value });
    return this;
  }
  or(filter: string) {
    this.call.ors.push(filter);
    return this;
  }
  order() {
    return this;
  }
  limit() {
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
      return {
        data: { ...(this.call.insertPayload as object), id: 'cart-new', show: { id: 'show-1' } },
        error: null,
      };
    }
    if (this.call.updatePayload !== undefined) {
      return { data: null, error: null };
    }
    return { data: behaviour.existingCart, error: null };
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

import { logger } from '@/services/LoggingService';
import { useCartStore } from './cartStore';

const SHOW_ID = 'show-1';
const EXHIBITOR_ID = 'exhibitor-1';

const cartCalls = () => calls.filter(call => call.table === 'entry_carts');

beforeEach(() => {
  calls.length = 0;
  behaviour.insertError = null;
  behaviour.existingCart = null;
  mockFrom.mockImplementation((table: string) => new MockBuilder(table));
  useCartStore.setState({ cart: null, isLoading: false, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('cartStore.createCart', () => {
  it('retires a lapsed active cart before inserting, so the INSERT cannot 409', async () => {
    await useCartStore.getState().createCart(SHOW_ID, EXHIBITOR_ID);

    expect(mockFrom).toHaveBeenCalledWith('entry_carts');

    const [first, second] = cartCalls();

    // The retire must come FIRST: after the insert it is already too late, the
    // 409 has been logged.
    expect(first?.updatePayload).toEqual({ status: 'expired', stripe_checkout_session_id: null });
    expect(first?.eqs).toEqual([
      { column: 'show_id', value: SHOW_ID },
      { column: 'exhibitor_id', value: EXHIBITOR_ID },
      { column: 'status', value: 'active' },
    ]);
    // Scoped to rows `loadCart` cannot see: lapsed, or with no expiry at all.
    expect(first?.ors).toHaveLength(1);
    expect(first?.ors[0]).toMatch(/^expires_at\.is\.null,expires_at\.lte\./);

    expect(second?.insertPayload).toMatchObject({
      show_id: SHOW_ID,
      exhibitor_id: EXHIBITOR_ID,
      status: 'active',
      subtotal_cents: 0,
      platform_fee_cents: 0,
      total_cents: 0,
    });
    expect(second?.selected).toBe('*, show:shows(id, name, start_date, entry_close_date)');
  });

  it('does not treat a unique violation on some other constraint as a reclaimed cart', async () => {
    behaviour.insertError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "entry_carts_some_future_idx"',
      details: 'Key (stripe_checkout_session_id)=(cs_test_1) already exists.',
    };
    behaviour.existingCart = {
      id: 'cart-existing',
      show_id: SHOW_ID,
      exhibitor_id: EXHIBITOR_ID,
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      show: { id: SHOW_ID },
    };

    const result = await useCartStore.getState().createCart(SHOW_ID, EXHIBITOR_ID);

    expect(result).toBeNull();
    // The foreign conflict stays legible instead of being reported as a
    // reclaimed cart.
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      'Error creating cart',
      'cartStore',
      { showId: SHOW_ID, exhibitorId: EXHIBITOR_ID },
      behaviour.insertError
    );
    // No reclaim: nothing after the insert may touch the cart the conflict was
    // never about.
    const afterInsert = cartCalls().slice(
      cartCalls().findIndex(call => call.insertPayload !== undefined) + 1
    );
    expect(afterInsert).toEqual([]);
  });

  it('still reclaims a live cart when the active-cart index is the one violated', async () => {
    behaviour.insertError = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "entry_carts_active_show_exhibitor_unique_idx"',
      details: `Key (show_id, exhibitor_id)=(${SHOW_ID}, ${EXHIBITOR_ID}) already exists.`,
    };
    behaviour.existingCart = {
      id: 'cart-existing',
      show_id: SHOW_ID,
      exhibitor_id: EXHIBITOR_ID,
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      show: { id: SHOW_ID },
    };

    await useCartStore.getState().createCart(SHOW_ID, EXHIBITOR_ID);

    const reclaim = cartCalls().find(
      call => call.updatePayload !== undefined && 'expires_at' in call.updatePayload
    );
    expect(reclaim?.eqs).toContainEqual({ column: 'id', value: 'cart-existing' });
  });
});

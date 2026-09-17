/**
 * The wizard's cart opener must never insert while an active row exists, and
 * must never replace a lapsed cart with an empty one (MYK9-581).
 *
 * `entry_carts_active_show_exhibitor_unique_idx` is scoped to `status =
 * 'active'` and knows nothing about `expires_at`, so a read that filters on
 * expiry reports "no cart" for a row the index still rejects an insert against
 * — that is the 409 this pins. The recovery, not a retire, is the fix: `/cart`
 * and the header badge both read `status IN ('active','expired')` with no
 * expiry filter and RECOVER the drafted cart with its items.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  table: string;
  insertPayload?: Record<string, unknown>;
  updatePayload?: Record<string, unknown>;
  selected?: string | boolean;
  eqs: Array<{ column: string; value: unknown }>;
  ors: string[];
}

const calls = vi.hoisted(() => [] as Call[]);
const mockFrom = vi.hoisted(() => vi.fn());
const behaviour = vi.hoisted(() => ({
  insertError: null as { code?: string; message?: string; details?: string } | null,
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
  in(column: string, value: unknown) {
    this.call.eqs.push({ column: `in:${column}`, value });
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
  insert(payload: Record<string, unknown>) {
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
        data: { ...this.call.insertPayload, id: 'cart-new', show: { id: SHOW_ID } },
        error: null,
      };
    }
    if (this.call.updatePayload !== undefined) return { data: null, error: null };
    return { data: null, error: null };
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
import { resetEnsureCartInFlight } from './cartStore.ensureCart';

const SHOW_ID = 'show-1';
const EXHIBITOR_ID = 'exhibitor-1';

const cartCalls = () => calls.filter(call => call.table === 'entry_carts');
const insertCalls = () => cartCalls().filter(call => call.insertPayload !== undefined);

beforeEach(() => {
  calls.length = 0;
  behaviour.insertError = null;
  mockFrom.mockImplementation((table: string) => new MockBuilder(table));
  // Module-scope state: an in-flight entry that outlived its test would make
  // the next test's call return the previous cart and assert nothing.
  resetEnsureCartInFlight();
  useCartStore.setState({ cart: null, isLoading: false, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('cartStore.createCart', () => {
  it('inserts an active cart with a fresh hold and no expiry-filtered pre-write', async () => {
    const before = Date.now();
    await useCartStore.getState().createCart(SHOW_ID, EXHIBITOR_ID);

    expect(mockFrom).toHaveBeenCalledWith('entry_carts');
    // Exactly one write, and it is the INSERT: nothing retires or rewrites a
    // row on the way in.
    expect(cartCalls()).toHaveLength(1);

    const [insert] = insertCalls();
    expect(insert?.insertPayload).toMatchObject({
      show_id: SHOW_ID,
      exhibitor_id: EXHIBITOR_ID,
      status: 'active',
      subtotal_cents: 0,
      platform_fee_cents: 0,
      total_cents: 0,
    });
    // The hold is a real future timestamp, not an inherited or absent one.
    const expiresAt = new Date(insert?.insertPayload?.expires_at as string).getTime();
    expect(expiresAt).toBeGreaterThan(before);
    expect(expiresAt).toBeLessThanOrEqual(before + 30 * 60 * 1000 + 5_000);
    expect(insert?.selected).toBe('*, show:shows(id, name, start_date, entry_close_date)');

    // `.or('expires_at…')` on entry_carts is banned: a raw ISO timestamp inside
    // PostgREST's or() mini-language misparses (2026-06-20 incident).
    expect(cartCalls().flatMap(call => call.ors)).toEqual([]);
  });

  it('recovers the existing cart instead of expiring it when the active-cart index is violated', async () => {
    behaviour.insertError = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "entry_carts_active_show_exhibitor_unique_idx"',
      details: undefined,
    };
    const loadActiveCart = vi
      .fn()
      .mockResolvedValue({ id: 'cart-existing', items: [{ id: 'item-1' }] });
    useCartStore.setState({ loadActiveCart });

    const result = await useCartStore.getState().createCart(SHOW_ID, EXHIBITOR_ID);

    expect(loadActiveCart).toHaveBeenCalledWith(EXHIBITOR_ID, { showId: SHOW_ID });
    expect(result).toEqual({ id: 'cart-existing', items: [{ id: 'item-1' }] });
    // The drafted cart is never expired, and no second shell is inserted in
    // its place: that is what orphaned an exhibitor's items.
    expect(cartCalls().filter(call => call.updatePayload !== undefined)).toEqual([]);
    expect(insertCalls()).toHaveLength(1);
  });

  it('does not treat a unique violation on some other constraint as a recovered cart', async () => {
    behaviour.insertError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "entry_carts_some_future_idx"',
      details: 'Key (stripe_checkout_session_id)=(cs_test_1) already exists.',
    };
    const loadActiveCart = vi.fn();
    useCartStore.setState({ loadActiveCart });

    const result = await useCartStore.getState().createCart(SHOW_ID, EXHIBITOR_ID);

    expect(result).toBeNull();
    expect(loadActiveCart).not.toHaveBeenCalled();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      'Error creating cart',
      'cartStore',
      { showId: SHOW_ID, exhibitorId: EXHIBITOR_ID },
      behaviour.insertError
    );
  });
});

describe('cartStore.ensureCart', () => {
  it('returns the recovered cart and never inserts when one already exists', async () => {
    const recovered = { id: 'cart-existing', items: [{ id: 'item-1' }] };
    const loadActiveCart = vi.fn().mockResolvedValue(recovered);
    useCartStore.setState({ loadActiveCart });

    const result = await useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID);

    expect(loadActiveCart).toHaveBeenCalledWith(EXHIBITOR_ID, { showId: SHOW_ID });
    expect(result).toBe(recovered);
    expect(insertCalls()).toEqual([]);
  });

  it('coalesces the WHOLE load-then-create opener, not just the create', async () => {
    // The first caller's load resolves slowly; the second caller must join it
    // rather than run its own load and reach a second INSERT.
    const loadActiveCart = vi.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(() => resolve(null), 0);
        })
    );
    useCartStore.setState({ loadActiveCart });

    const [a, b] = await Promise.all([
      useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID),
      useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID),
    ]);

    expect(loadActiveCart).toHaveBeenCalledTimes(1);
    expect(insertCalls()).toHaveLength(1);
    expect(a).toBe(b);
  });
});

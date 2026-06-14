import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryCalls = vi.hoisted(() => [] as Array<QueryCall>);
const mockFrom = vi.hoisted(() => vi.fn());

interface QueryCall {
  table: string;
  select?: string;
  eqs: Array<{ column: string; value: unknown }>;
  gts: Array<{ column: string; value: unknown }>;
  ins: Array<{ column: string; values: unknown[] }>;
  ises: Array<{ column: string; value: unknown }>;
  ors: string[];
  updatePayload?: Record<string, unknown>;
  upsertPayload?: unknown;
  upsertOptions?: unknown;
}

interface QueryResult {
  data: unknown;
  error: unknown;
}

class MockQueryBuilder {
  private readonly call: QueryCall;

  constructor(
    table: string,
    private readonly resultFor: (call: QueryCall) => QueryResult
  ) {
    this.call = { table, eqs: [], gts: [], ins: [], ises: [], ors: [] };
    queryCalls.push(this.call);
  }

  select(value: string) {
    this.call.select = value;
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.eqs.push({ column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.call.gts.push({ column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.call.ins.push({ column, values });
    return this;
  }

  is(column: string, value: unknown) {
    this.call.ises.push({ column, value });
    return this;
  }

  or(value: string) {
    this.call.ors.push(value);
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.call.updatePayload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.call.upsertPayload = payload;
    this.call.upsertOptions = options;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.resultFor(this.call));
  }

  then(resolve: (value: QueryResult) => void, reject?: (reason?: unknown) => void) {
    return Promise.resolve(this.resultFor(this.call)).then(resolve, reject);
  }
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { useCartStore } from './cartStore';

const expiredCartLookup = {
  id: 'cart-expired',
  show_id: 'show-1',
  status: 'active',
  expires_at: '2026-06-14T19:00:00.000Z',
};

const hydratedCart = {
  ...expiredCartLookup,
  exhibitor_id: 'exhibitor-1',
  created_at: '2026-06-14T18:30:00.000Z',
  updated_at: '2026-06-14T18:30:00.000Z',
  subtotal_cents: 2500,
  platform_fee_cents: 175,
  total_cents: 2675,
  stripe_checkout_session_id: 'cs_test_old',
  show: {
    id: 'show-1',
    name: 'Reliable Recovery Trial',
    start_date: '2026-07-01',
    entry_close_date: '2026-06-28',
  },
};

const freshCartLookup = {
  id: 'cart-fresh',
  show_id: 'show-1',
  status: 'active',
  expires_at: '2026-06-14T20:20:00.000Z',
};

const freshHydratedCart = {
  ...hydratedCart,
  ...freshCartLookup,
  stripe_checkout_session_id: 'cs_test_open',
};

const hydratedItem = {
  id: 'item-1',
  cart_id: 'cart-expired',
  dog_id: 'dog-1',
  class_id: 'class-1',
  handler_id: null,
  entry_fee_cents: 2500,
  jump_height: '16',
  special_requests: null,
  created_at: '2026-06-14T18:30:00.000Z',
  dog: { id: 'dog-1', name: 'Rover', call_name: 'Rover', breed: 'Mixed' },
  class: { id: 'class-1', name: 'Novice Standard', level: 'Novice', trial_id: 'trial-1' },
  handler: null,
};

describe('cartStore payment recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T20:00:00.000Z'));
    queryCalls.length = 0;
    useCartStore.getState().reset();

    mockFrom.mockImplementation(
      (table: string) =>
        new MockQueryBuilder(table, call => {
          if (call.table === 'entry_carts' && call.select === 'id, show_id, status, expires_at') {
            return call.gts.length > 0
              ? { data: null, error: null }
              : { data: expiredCartLookup, error: null };
          }

          if (call.table === 'entry_carts' && call.updatePayload) {
            return { data: null, error: null };
          }

          if (call.table === 'entry_carts') {
            return { data: hydratedCart, error: null };
          }

          if (call.table === 'entry_cart_items') {
            return { data: [hydratedItem], error: null };
          }

          return { data: null, error: null };
        })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reopens and hydrates the latest active cart when its expiry is stale', async () => {
    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(cart?.id).toBe('cart-expired');
    expect(cart?.items).toHaveLength(1);
    expect(useCartStore.getState().cart?.id).toBe('cart-expired');

    const lookupCall = queryCalls[0];
    expect(lookupCall).toMatchObject({
      table: 'entry_carts',
      gts: [],
      eqs: [{ column: 'exhibitor_id', value: 'exhibitor-1' }],
      ins: [{ column: 'status', values: ['active', 'expired'] }],
    });

    const recoveryUpdate = queryCalls.find(call => call.updatePayload);
    expect(recoveryUpdate?.updatePayload).toMatchObject({
      stripe_checkout_session_id: null,
      expires_at: '2026-06-14T20:30:00.000Z',
    });
    expect(recoveryUpdate?.eqs).toEqual([{ column: 'id', value: 'cart-expired' }]);
    expect(recoveryUpdate?.ins).toEqual([{ column: 'status', values: ['active', 'expired'] }]);
  });

  it('hydrates a fresh active cart without severing its checkout session', async () => {
    queryCalls.length = 0;
    mockFrom.mockImplementation(
      (table: string) =>
        new MockQueryBuilder(table, call => {
          if (call.table === 'entry_carts' && call.select === 'id, show_id, status, expires_at') {
            return { data: freshCartLookup, error: null };
          }

          if (call.table === 'entry_carts' && call.updatePayload) {
            throw new Error('Fresh carts should not be recovered');
          }

          if (call.table === 'entry_carts') {
            return { data: freshHydratedCart, error: null };
          }

          if (call.table === 'entry_cart_items') {
            return { data: [hydratedItem], error: null };
          }

          return { data: null, error: null };
        })
    );

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(cart?.id).toBe('cart-fresh');
    expect(cart?.stripe_checkout_session_id).toBe('cs_test_open');
    expect(queryCalls.some(call => call.updatePayload)).toBe(false);
  });

  it('keeps empty recovered cart shells empty instead of sweeping pending entries into checkout', async () => {
    queryCalls.length = 0;
    mockFrom.mockImplementation(
      (table: string) =>
        new MockQueryBuilder(table, call => {
          if (call.table === 'entry_carts' && call.select === 'id, show_id, status, expires_at') {
            return { data: expiredCartLookup, error: null };
          }

          if (call.table === 'entry_carts' && call.updatePayload) {
            return { data: null, error: null };
          }

          if (call.table === 'entry_carts') {
            return {
              data: {
                ...hydratedCart,
                subtotal_cents: 0,
                platform_fee_cents: 0,
                total_cents: 0,
              },
              error: null,
            };
          }

          if (call.table === 'entry_cart_items' && call.upsertPayload) {
            return { data: null, error: null };
          }

          if (call.table === 'entry_cart_items') {
            return { data: [], error: null };
          }

          return { data: null, error: null };
        })
    );

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1');

    expect(cart?.items).toEqual([]);
    expect(cart?.subtotal_cents).toBe(0);
    expect(cart?.platform_fee_cents).toBe(0);
    expect(cart?.total_cents).toBe(0);
    expect(queryCalls.some(call => call.table === 'entries')).toBe(false);
    expect(queryCalls.some(call => call.upsertPayload)).toBe(false);
  });

  it('rebuilds an empty cart only from explicit pending entry ids', async () => {
    queryCalls.length = 0;
    let itemLoadCount = 0;
    mockFrom.mockImplementation(
      (table: string) =>
        new MockQueryBuilder(table, call => {
          if (call.table === 'entry_carts' && call.select === 'id, show_id, status, expires_at') {
            return { data: expiredCartLookup, error: null };
          }

          if (call.table === 'entry_carts' && call.updatePayload) {
            return { data: null, error: null };
          }

          if (call.table === 'entry_carts') {
            return {
              data: {
                ...hydratedCart,
                subtotal_cents: 0,
                platform_fee_cents: 0,
                total_cents: 0,
              },
              error: null,
            };
          }

          if (call.table === 'entry_cart_items' && call.upsertPayload) {
            return { data: null, error: null };
          }

          if (call.table === 'entry_cart_items') {
            itemLoadCount += 1;
            return { data: itemLoadCount === 1 ? [] : [hydratedItem], error: null };
          }

          if (call.table === 'exhibitor_profiles') {
            return { data: { person_id: 'person-1' }, error: null };
          }

          if (call.table === 'dogs') {
            return { data: [{ id: 'dog-1' }], error: null };
          }

          if (call.table === 'entries') {
            return {
              data: [
                {
                  class_id: 'class-1',
                  dog_id: 'dog-1',
                  handler_id: 'person-1',
                  entry_fee: 25,
                  jump_height: '16',
                  special_requests: null,
                },
              ],
              error: null,
            };
          }

          return { data: null, error: null };
        })
    );

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1', {
      showId: 'show-1',
      recoveryEntryIds: ['entry-1'],
    });

    expect(cart?.items).toHaveLength(1);
    expect(cart?.subtotal_cents).toBe(2500);
    expect(cart?.platform_fee_cents).toBe(175);
    expect(cart?.total_cents).toBe(2675);

    const lookupCall = queryCalls[0];
    expect(lookupCall?.eqs).toEqual([
      { column: 'exhibitor_id', value: 'exhibitor-1' },
      { column: 'show_id', value: 'show-1' },
    ]);

    const entriesCall = queryCalls.find(call => call.table === 'entries');
    expect(entriesCall?.eqs).toEqual([
      { column: 'show_id', value: 'show-1' },
      { column: 'payment_status', value: 'pending' },
    ]);
    expect(entriesCall?.ins).toEqual([
      { column: 'id', values: ['entry-1'] },
      {
        column: 'entry_status',
        values: ['pending', 'submitted', 'pending-payment', 'confirmed'],
      },
      { column: 'dog_id', values: ['dog-1'] },
    ]);
    expect(entriesCall?.ises).toEqual([{ column: 'deleted_at', value: null }]);
    expect(entriesCall?.ors).toEqual([]);

    const dogCall = queryCalls.find(call => call.table === 'dogs');
    expect(dogCall?.ors).toEqual(['owner_id.eq.person-1,co_owner_id.eq.person-1']);

    const upsertCall = queryCalls.find(call => call.upsertPayload);
    expect(upsertCall?.upsertPayload).toEqual([
      {
        cart_id: 'cart-expired',
        class_id: 'class-1',
        dog_id: 'dog-1',
        handler_id: 'person-1',
        entry_fee_cents: 2500,
        jump_height: '16',
        special_requests: null,
      },
    ]);
    expect(upsertCall?.upsertOptions).toEqual({
      onConflict: 'cart_id,dog_id,class_id',
      ignoreDuplicates: true,
    });
  });
});

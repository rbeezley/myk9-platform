/**
 * `ensureCart` must never resolve to "nothing, and no reason" (MYK9-581).
 *
 * The registration wizard's class step holds this one promise and renders from
 * it. When the opener could resolve a bare `null` while the store's `error`
 * stayed null, the step sat at "Loading your cart…" forever with every chip
 * inert and nothing said — a hang, not an error. `loadActiveCart` has SIX
 * exits that resolve `null` without setting an error, so guarding one path at
 * a time kept finding the next one; the result type is what removes the class.
 *
 * This file drives the REAL `loadActiveCart` through each of those six exits
 * (mocking the opener's own return value would prove nothing about them) and
 * asserts the opener on top of it always lands on `ready`, or on `failed` with
 * a message. If `loadActiveCart` ever grows a seventh null exit, the
 * enumeration here is what has to grow with it — so each case also asserts the
 * exit it claims to exercise really did resolve null.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SupabaseCall {
  table: string;
  op: 'lookup' | 'reread' | 'write' | 'insert';
  payload?: Record<string, unknown>;
}

const calls = vi.hoisted(() => [] as SupabaseCall[]);
const mockFrom = vi.hoisted(() => vi.fn());

interface Outcome {
  data?: unknown;
  error?: unknown;
}

const script = vi.hoisted(() => ({
  lookup: { data: null, error: null } as Outcome,
  write: { data: null, error: null } as Outcome,
  reread: { data: null, error: null } as Outcome,
  insert: { data: null, error: null } as Outcome,
}));

class MockBuilder {
  private op: SupabaseCall['op'] = 'reread';
  private readonly call: SupabaseCall;
  constructor(table: string) {
    this.call = { table, op: 'reread' };
    calls.push(this.call);
  }
  private setOp(op: SupabaseCall['op']) {
    this.op = op;
    this.call.op = op;
  }
  select(columns?: string) {
    // A write names its returning columns through the same `.select()`, so it
    // must not be reclassified as a read here.
    if (this.op === 'insert' || this.op === 'write') return this;
    // The lookup is the only read that asks for the narrow column list; the
    // recovered-cart re-read embeds the show.
    this.setOp(columns === 'id, show_id, status, expires_at' ? 'lookup' : 'reread');
    return this;
  }
  eq() {
    return this;
  }
  in() {
    return this;
  }
  gt() {
    return this;
  }
  or() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.setOp('write');
    this.call.payload = payload;
    return this;
  }
  insert(payload: Record<string, unknown>) {
    this.setOp('insert');
    this.call.payload = payload;
    return this;
  }
  private result() {
    const outcome = script[this.op];
    return { data: outcome.data ?? null, error: outcome.error ?? null };
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
vi.mock('./cartStore.recovery', () => ({
  findRecoverableEntries: vi.fn(async () => []),
  loadCartItemsByCartId: vi.fn(async () => []),
  recoverCartItemsFromEntryIds: vi.fn(async () => []),
}));
vi.mock('./cartStore.reconciliation', () => ({
  reconcileCartItemsAgainstExistingEntries: vi.fn(async ({ items }: { items: unknown[] }) => items),
}));

import { loadCartItemsByCartId } from './cartStore.recovery';
import { reconcileCartItemsAgainstExistingEntries } from './cartStore.reconciliation';
import { useCartStore } from './cartStore';
import {
  CART_OPEN_TIMED_OUT_MESSAGE,
  CART_OPEN_TIMEOUT_MS,
  resetEnsureCartInFlight,
} from './cartStore.ensureCart';

const SHOW_ID = 'show-1';
const EXHIBITOR_ID = 'exhibitor-1';
const LIVE_ROW = {
  id: 'cart-1',
  show_id: SHOW_ID,
  status: 'active',
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
};
const LAPSED_ROW = { ...LIVE_ROW, status: 'expired', expires_at: new Date(0).toISOString() };
const FULL_ROW = { ...LIVE_ROW, exhibitor_id: EXHIBITOR_ID, show: { id: SHOW_ID } };
const PG_ERROR = { code: '42501', message: 'permission denied for table entry_carts' };

const resetStore = () => {
  resetEnsureCartInFlight();
  useCartStore.setState({ cart: null, isLoading: false, error: null });
};

beforeEach(() => {
  calls.length = 0;
  script.lookup = { data: null, error: null };
  script.write = { data: null, error: null };
  script.reread = { data: null, error: null };
  // Every null-path case below must land on `failed`, so the fallback create is
  // held down too: a case that only passed because the create rescued it would
  // not be testing the null path at all.
  script.insert = { data: null, error: PG_ERROR };
  mockFrom.mockImplementation((table: string) => new MockBuilder(table));
  vi.mocked(loadCartItemsByCartId).mockResolvedValue([]);
  vi.mocked(reconcileCartItemsAgainstExistingEntries).mockImplementation(
    async ({ items }) => items
  );
  resetStore();
});

/** Every exit in `loadActiveCart` that resolves `null`, and how to reach it. */
const nullPaths: Array<{ name: string; arrange: () => void }> = [
  {
    name: 'the cart lookup itself errors',
    arrange: () => {
      script.lookup = { data: null, error: PG_ERROR };
    },
  },
  {
    name: 'no recoverable row exists for this exhibitor and show',
    arrange: () => {
      script.lookup = { data: null, error: null };
    },
  },
  {
    name: 'extending the hold on a lapsed row errors',
    arrange: () => {
      script.lookup = { data: LAPSED_ROW, error: null };
      script.write = { data: null, error: PG_ERROR };
    },
  },
  {
    name: 're-reading the recovered cart errors',
    arrange: () => {
      script.lookup = { data: LIVE_ROW, error: null };
      script.reread = { data: null, error: PG_ERROR };
    },
  },
  {
    name: "the winner's row is gone by the time it is re-read",
    arrange: () => {
      script.lookup = { data: LIVE_ROW, error: null };
      script.reread = { data: null, error: null };
    },
  },
  {
    name: 'the cart items read throws',
    arrange: () => {
      script.lookup = { data: LIVE_ROW, error: null };
      script.reread = { data: FULL_ROW, error: null };
      vi.mocked(loadCartItemsByCartId).mockRejectedValue(new Error('items read failed'));
    },
  },
];

describe('ensureCart never resolves without a cart or an error', () => {
  it.each(nullPaths)('$name', async ({ arrange }) => {
    arrange();

    // The exit this case claims to exercise really is a null one; otherwise the
    // assertion below would be about some other path.
    const direct = await useCartStore.getState().loadActiveCart(EXHIBITOR_ID, { showId: SHOW_ID });
    expect(direct).toBeNull();

    resetStore();
    arrange();

    const result = await useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID);

    expect(result).toMatchObject({ kind: 'failed' });
    if (result.kind === 'failed') {
      expect(result.error).toEqual(expect.any(String));
      expect(result.error.length).toBeGreaterThan(0);
    }
    // A hang is `isLoading` left true with nothing to render from; the step
    // renders its alert from `kind`, but the store must not be left mid-load.
    expect(useCartStore.getState().isLoading).toBe(false);
  });

  it('maps a rejection to failed rather than rethrowing', async () => {
    script.lookup = { data: LIVE_ROW, error: null };
    script.reread = { data: FULL_ROW, error: null };
    vi.mocked(reconcileCartItemsAgainstExistingEntries).mockRejectedValue(
      new Error('entries reconcile read failed')
    );

    const result = await useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID);

    expect(result).toEqual({ kind: 'failed', error: 'entries reconcile read failed' });
    expect(useCartStore.getState().isLoading).toBe(false);
  });

  it('returns ready with the recovered cart when the row is readable', async () => {
    script.lookup = { data: LIVE_ROW, error: null };
    script.reread = { data: FULL_ROW, error: null };

    const result = await useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID);

    expect(result).toMatchObject({ kind: 'ready' });
    if (result.kind === 'ready') expect(result.cart.id).toBe('cart-1');
    expect(calls.some(call => call.op === 'insert')).toBe(false);
  });

  it('returns ready with a created cart when there is nothing to recover', async () => {
    script.lookup = { data: null, error: null };
    script.insert = { data: FULL_ROW, error: null };

    const result = await useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID);

    expect(result).toMatchObject({ kind: 'ready' });
    if (result.kind === 'ready') expect(result.cart.id).toBe('cart-1');
  });
});

describe('recovering a lapsed cart puts it back under the active-cart index', () => {
  it("reactivates the row, not just its hold, when it is 'expired'", async () => {
    // `entry_carts_active_show_exhibitor_unique_idx` is `WHERE status =
    // 'active'`, so a row recovered as 'expired' is unprotected: a second
    // createCart inserts a rival empty cart, every `created_at desc` read then
    // returns the empty one, and stripe-checkout marks the real draft
    // 'abandoned' (review C P2-1).
    script.lookup = { data: LAPSED_ROW, error: null };
    script.reread = { data: FULL_ROW, error: null };

    const cart = await useCartStore.getState().loadActiveCart(EXHIBITOR_ID, { showId: SHOW_ID });

    expect(cart?.id).toBe('cart-1');
    const write = calls.find(call => call.op === 'write');
    expect(write, 'the lapsed row must be written at all').toBeDefined();
    expect(write?.payload).toMatchObject({ status: 'active' });
    expect(write?.payload?.stripe_checkout_session_id).toBeNull();
    expect(new Date(write?.payload?.expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('does not rewrite a row whose hold is still live', async () => {
    script.lookup = { data: LIVE_ROW, error: null };
    script.reread = { data: FULL_ROW, error: null };

    await useCartStore.getState().loadActiveCart(EXHIBITOR_ID, { showId: SHOW_ID });

    expect(calls.filter(call => call.op === 'write')).toEqual([]);
  });
});

describe('the opener is bounded in time, not only in its result type', () => {
  it('reports failed when the request never settles, so the alert and Try again appear', async () => {
    // The union makes "resolved with nothing and no reason" unrepresentable. It
    // says nothing about a request that never resolves — and the supabase client
    // carries no timeout — so a stalled fetch reproduced the original screen
    // exactly: inert chips, nothing said, nothing to retry (review D2).
    vi.useFakeTimers();
    try {
      const loadActiveCart = vi.fn().mockReturnValue(new Promise(() => {}));
      useCartStore.setState({ loadActiveCart, isLoading: true, error: null });

      const pending = useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID);
      await vi.advanceTimersByTimeAsync(CART_OPEN_TIMEOUT_MS - 1);
      let settled: unknown = null;
      void pending.then(value => {
        settled = value;
      });
      await Promise.resolve();
      expect(settled, 'must not give up before the bound').toBeNull();

      await vi.advanceTimersByTimeAsync(2);
      expect(await pending).toEqual({ kind: 'failed', error: CART_OPEN_TIMED_OUT_MESSAGE });
      // The spinner the step renders from must stop too.
      expect(useCartStore.getState().isLoading).toBe(false);
      expect(useCartStore.getState().error).toBe(CART_OPEN_TIMED_OUT_MESSAGE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the in-flight entry on a timeout so Try again re-runs rather than joining the stall', async () => {
    vi.useFakeTimers();
    try {
      const loadActiveCart = vi
        .fn()
        .mockReturnValueOnce(new Promise(() => {}))
        .mockResolvedValueOnce({ id: 'cart-1', items: [] });
      useCartStore.setState({ loadActiveCart });

      const stalled = useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID);
      await vi.advanceTimersByTimeAsync(CART_OPEN_TIMEOUT_MS + 1);
      expect(await stalled).toMatchObject({ kind: 'failed' });

      const retried = await useCartStore.getState().ensureCart(SHOW_ID, EXHIBITOR_ID);
      expect(retried).toEqual({ kind: 'ready', cart: { id: 'cart-1', items: [] } });
      expect(loadActiveCart).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

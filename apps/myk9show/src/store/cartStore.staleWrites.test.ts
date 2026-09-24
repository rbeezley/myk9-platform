/**
 * A cart read that resolves after its moment has passed must not write the
 * store.
 *
 * MYK9-651: sign-out never reset the store, and a read in flight at sign-out
 * repopulated it (and the persisted recovery ids) with the departed user's cart.
 *
 * MYK9-655: the wizard opener gives up after CART_OPEN_TIMEOUT_MS, but the
 * stalled opener kept running; when it finally resolved, its full-replace
 * `set({ cart })` wiped an item added after a successful retry, and its failure
 * path could report a second time.
 *
 * Both are driven against the in-memory table with the real column shapes. A
 * held response is evaluated when the request is issued, as the server would,
 * so the stale read carries the rows as they were before the item was added.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  createFakeCartDb,
  fakeCart,
  type FakeCartDb,
  type FakeQueryInfo,
} from '@/test/utils/fakeCartDb';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeCartDb }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => holder.db.from(table) },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { logger } from '@/services/LoggingService';
import { useCartStore } from './cartStore';
import { CART_OPEN_TIMEOUT_MS, resetEnsureCartInFlight } from './cartStore.ensureCart';
import { useNotifyAccountBoundary } from '@/hooks/useNotifyAccountBoundary';

const STORAGE_KEY = 'myk9-cart-storage';
const isLookup = (q: FakeQueryInfo) =>
  q.table === 'entry_carts' &&
  q.op === 'select' &&
  /entry_cart_items\(count\)/.test(q.columns ?? '');
const isItemsRead = (q: FakeQueryInfo) => q.table === 'entry_cart_items' && q.op === 'select';

/** Let every already-settled promise chain run. */
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const openFailures = () =>
  vi.mocked(logger.error).mock.calls.filter(([message]) => message === 'Failed to open cart');

beforeEach(() => {
  vi.mocked(logger.error).mockClear();
  resetEnsureCartInFlight();
  useCartStore.getState().reset();
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sign-out while a cart read is in flight (MYK9-651)', () => {
  it('leaves the store empty and persists none of the previous user’s ids', async () => {
    holder.db = createFakeCartDb({ carts: [fakeCart({ id: 'cart-previous-user' })] });
    const release = holder.db.hold(isLookup);

    const pending = useCartStore.getState().loadActiveCart('exhibitor-1');
    useCartStore.getState().reset();
    release();
    await pending;
    await flush();

    expect(useCartStore.getState().cart).toBeNull();
    expect(useCartStore.getState().cartRecoveryInfo ?? null).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('cart-previous-user');
  });

  it('reset clears the persisted recovery ids of a cart already loaded', async () => {
    holder.db = createFakeCartDb({ carts: [fakeCart({ id: 'cart-previous-user' })] });
    await useCartStore.getState().loadActiveCart('exhibitor-1');
    expect(localStorage.getItem(STORAGE_KEY)).toContain('cart-previous-user');

    useCartStore.getState().reset();

    expect(localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('cart-previous-user');
  });
});

describe('useNotifyAccountBoundary (MYK9-651)', () => {
  const loadCart = async () => {
    holder.db = createFakeCartDb({ carts: [fakeCart({ id: 'cart-previous-user' })] });
    await useCartStore.getState().loadActiveCart('exhibitor-1');
    expect(useCartStore.getState().cart?.id).toBe('cart-previous-user');
  };

  it('resets the cart on sign-out', async () => {
    const { rerender } = renderHook(
      ({ userId }: { userId: string | null }) =>
        useNotifyAccountBoundary({ authReady: true, userId }),
      { initialProps: { userId: 'auth-user-1' as string | null } }
    );
    await loadCart();

    rerender({ userId: null });

    expect(useCartStore.getState().cart).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('cart-previous-user');
  });

  it('resets the cart when a different user signs in', async () => {
    const { rerender } = renderHook(
      ({ userId }: { userId: string | null }) =>
        useNotifyAccountBoundary({ authReady: true, userId }),
      { initialProps: { userId: 'auth-user-1' as string | null } }
    );
    await loadCart();

    rerender({ userId: 'auth-user-2' });

    expect(useCartStore.getState().cart).toBeNull();
  });

  it('keeps the cart across a session restore and a token refresh', async () => {
    const { rerender } = renderHook(
      ({ authReady, userId }: { authReady: boolean; userId: string | null }) =>
        useNotifyAccountBoundary({ authReady, userId }),
      { initialProps: { authReady: false, userId: null as string | null } }
    );
    await loadCart();

    rerender({ authReady: true, userId: 'auth-user-1' });
    rerender({ authReady: true, userId: 'auth-user-1' });

    expect(useCartStore.getState().cart?.id).toBe('cart-previous-user');
  });

  it('clears persisted ids when the first settled session is signed out', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          lastSyncedAt: null,
          cartRecoveryInfo: { id: 'cart-previous-user', showId: 's', exhibitorId: 'e' },
        },
        version: 0,
      })
    );
    useCartStore.setState({
      cartRecoveryInfo: { id: 'cart-previous-user', showId: 's', exhibitorId: 'e' },
    });

    renderHook(() => useNotifyAccountBoundary({ authReady: true, userId: null }));

    expect(useCartStore.getState().cartRecoveryInfo ?? null).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('cart-previous-user');
  });
});

describe('a superseded cart opener (MYK9-655)', () => {
  it('cannot overwrite an item added after a successful retry', async () => {
    vi.useFakeTimers();
    holder.db = createFakeCartDb({ carts: [fakeCart({ id: 'cart-1' })] });
    // The first opener's items read stalls, carrying the cart as it was: empty.
    const releaseStalled = holder.db.hold(isItemsRead);

    const first = useCartStore.getState().ensureCart('show-1', 'exhibitor-1');
    await vi.advanceTimersByTimeAsync(CART_OPEN_TIMEOUT_MS);
    expect(await first).toMatchObject({ kind: 'failed' });

    const retry = await useCartStore.getState().ensureCart('show-1', 'exhibitor-1');
    expect(retry).toMatchObject({ kind: 'ready' });
    const added = await useCartStore
      .getState()
      .addItem({ dogId: 'dog-1', classId: 'class-1', entryFeeCents: 3000 });
    expect(added).toBe(true);
    expect(useCartStore.getState().cart?.items).toHaveLength(1);

    releaseStalled();
    await vi.advanceTimersByTimeAsync(0);
    await flush();

    expect(useCartStore.getState().cart?.items.map(item => item.dog_id)).toEqual(['dog-1']);
    expect(useCartStore.getState().error).toBeNull();
    expect(openFailures()).toHaveLength(1);
  });

  it('reports failure at most once, and does not go on to insert a rival cart', async () => {
    vi.useFakeTimers();
    holder.db = createFakeCartDb();
    // The stalled lookup eventually answers with an error, then the fallback
    // insert would fail too: both are ways the opener could report again.
    const releaseLookup = holder.db.hold(isLookup, {
      data: null,
      error: { code: '42501', message: 'permission denied for table entry_carts' },
    });
    holder.db.hold(q => q.table === 'entry_carts' && q.op === 'insert', {
      data: null,
      error: { code: '42501', message: 'permission denied for table entry_carts' },
    })();

    const first = useCartStore.getState().ensureCart('show-1', 'exhibitor-1');
    await vi.advanceTimersByTimeAsync(CART_OPEN_TIMEOUT_MS);
    expect(await first).toMatchObject({ kind: 'failed' });
    expect(openFailures()).toHaveLength(1);

    releaseLookup();
    await vi.advanceTimersByTimeAsync(0);
    await flush();

    expect(openFailures()).toHaveLength(1);
    expect(holder.db.log.some(q => q.table === 'entry_carts' && q.op === 'insert')).toBe(false);
  });
});

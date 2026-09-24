/**
 * MYK9-650: a newer EMPTY cart must not hide an older cart's drafted items.
 *
 * Live data on 2026-09-18 had three (show, exhibitor) pairs holding both an
 * active and an expired cart. `/cart`, the wizard opener and the header badge
 * each read `ORDER BY created_at DESC LIMIT 1`, so the exhibitor saw the empty
 * one. These tests drive the REAL store and the REAL badge hook against an
 * in-memory table with the real column shapes and the real unique indexes.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createFakeCartDb, fakeCart, fakeCartItem, type FakeCartDb } from '@/test/utils/fakeCartDb';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeCartDb }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => holder.db.from(table) },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useCartStore } from './cartStore';
import { pickRecoverableCart } from './cartStore.pickCart';
import { resetEnsureCartInFlight } from './cartStore.ensureCart';
import { useActiveCartItemCount } from '@/hooks/queries/useActiveCartItemCount';

const OLDER_WITH_ITEMS = fakeCart({
  id: 'cart-older',
  status: 'expired',
  expires_at: '2026-08-01T00:30:00.000Z',
  created_at: '2026-08-01T00:00:00.000Z',
});
const DRAFTED_ITEM = fakeCartItem({ id: 'item-drafted', cart_id: 'cart-older' });

function seed(newer: ReturnType<typeof fakeCart>) {
  holder.db = createFakeCartDb({
    carts: [{ ...OLDER_WITH_ITEMS }, newer],
    items: [{ ...DRAFTED_ITEM }],
  });
}

beforeEach(() => {
  resetEnsureCartInFlight();
  useCartStore.getState().reset();
});

describe('pickRecoverableCart', () => {
  it('picks the newest cart that has items over a newer empty one', () => {
    const picked = pickRecoverableCart([
      {
        ...fakeCart({ id: 'new', created_at: '2026-09-02T00:00:00Z' }),
        entry_cart_items: [{ count: 0 }],
      },
      {
        ...fakeCart({ id: 'mid', created_at: '2026-09-01T00:00:00Z' }),
        entry_cart_items: [{ count: 2 }],
      },
      {
        ...fakeCart({ id: 'old', created_at: '2026-08-01T00:00:00Z' }),
        entry_cart_items: [{ count: 5 }],
      },
    ]);
    expect(picked?.id).toBe('mid');
    expect(picked?.itemCount).toBe(2);
  });

  it('falls back to the newest cart when none has items', () => {
    const picked = pickRecoverableCart([
      {
        ...fakeCart({ id: 'old', created_at: '2026-08-01T00:00:00Z' }),
        entry_cart_items: [{ count: 0 }],
      },
      {
        ...fakeCart({ id: 'new', created_at: '2026-09-02T00:00:00Z' }),
        entry_cart_items: [{ count: 0 }],
      },
    ]);
    expect(picked?.id).toBe('new');
  });

  it('returns null when there is no cart', () => {
    expect(pickRecoverableCart([])).toBeNull();
  });
});

describe('loadActiveCart recovers the cart that has items (MYK9-650)', () => {
  it('prefers the older expired cart with items over a newer EXPIRED empty cart', async () => {
    seed(
      fakeCart({
        id: 'cart-newer-empty',
        status: 'expired',
        expires_at: '2026-09-10T00:30:00.000Z',
        created_at: '2026-09-10T00:00:00.000Z',
      })
    );

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1', { showId: 'show-1' });

    expect(cart?.id).toBe('cart-older');
    expect(cart?.items.map(item => item.id)).toEqual(['item-drafted']);
    expect(holder.db.carts.find(c => c.id === 'cart-older')?.status).toBe('active');
  });

  it('prefers the older cart with items over a newer ACTIVE empty cart, retiring the empty one', async () => {
    seed(
      fakeCart({
        id: 'cart-newer-empty',
        status: 'active',
        created_at: '2026-09-10T00:00:00.000Z',
      })
    );

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1', { showId: 'show-1' });

    // The store holds the picked cart, so checkout is handed THAT cart's id and
    // therefore exactly its items.
    expect(cart?.id).toBe('cart-older');
    expect(useCartStore.getState().cart?.id).toBe('cart-older');
    expect(cart?.items.map(item => item.id)).toEqual(['item-drafted']);
    // Exactly one active cart remains for the pair: the unique index holds.
    expect(holder.db.carts.filter(c => c.status === 'active').map(c => c.id)).toEqual([
      'cart-older',
    ]);
    expect(holder.db.carts.find(c => c.id === 'cart-newer-empty')?.status).toBe('expired');
  });

  it('keeps the newer active cart when IT has the items', async () => {
    holder.db = createFakeCartDb({
      carts: [
        fakeCart({ id: 'cart-older-empty', status: 'expired', created_at: '2026-08-01T00:00:00Z' }),
        fakeCart({ id: 'cart-newer', status: 'active', created_at: '2026-09-10T00:00:00Z' }),
      ],
      items: [fakeCartItem({ id: 'item-new', cart_id: 'cart-newer' })],
    });

    const cart = await useCartStore.getState().loadActiveCart('exhibitor-1', { showId: 'show-1' });

    expect(cart?.id).toBe('cart-newer');
    expect(holder.db.carts.find(c => c.id === 'cart-older-empty')?.status).toBe('expired');
  });
});

describe('useActiveCartItemCount reads the same pick (MYK9-650)', () => {
  it('counts the older cart that has items, not the newer empty one', async () => {
    seed(
      fakeCart({
        id: 'cart-newer-empty',
        status: 'active',
        created_at: '2026-09-10T00:00:00.000Z',
      })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useActiveCartItemCount('exhibitor-1'), { wrapper });

    await waitFor(() => expect(result.current).toBe(1));
  });
});

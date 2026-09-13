import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore, type CartWithDetails } from '@/store/cartStore';
import { useCartExpiredGate } from './useCartExpiredGate';

function seedCart(expiresInMs: number, overrides: Partial<CartWithDetails> = {}) {
  const cart = {
    id: 'cart-1',
    show_id: 'show-1',
    exhibitor_id: 'exhibitor-1',
    status: 'active',
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    items: [],
    ...overrides,
  } as unknown as CartWithDetails;
  useCartStore.setState({ cart, expirationWarning: false });
}

const own = { enabled: true, showId: 'show-1', exhibitorId: 'exhibitor-1' };

describe('useCartExpiredGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCartStore.setState({ cart: null, expirationWarning: false });
  });
  afterEach(() => {
    useCartStore.setState({ cart: null, expirationWarning: false });
    vi.useRealTimers();
  });

  it('is false for a live owned cart and flips to true when it lapses on screen', () => {
    seedCart(45_000);
    const { result } = renderHook(() => useCartExpiredGate(own));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(true);
  });

  it('is true immediately for an owned cart that has already expired', () => {
    seedCart(-1_000);
    const { result } = renderHook(() => useCartExpiredGate(own));
    expect(result.current).toBe(true);
  });

  it("ignores another show's expired cart", () => {
    seedCart(-1_000, { show_id: 'show-2' } as Partial<CartWithDetails>);
    const { result } = renderHook(() => useCartExpiredGate(own));
    expect(result.current).toBe(false);
  });

  it('is inert in staff flows even for an owned expired cart', () => {
    seedCart(-1_000);
    const { result } = renderHook(() => useCartExpiredGate({ ...own, enabled: false }));
    expect(result.current).toBe(false);
  });

  it('runs no timer when there is no cart', () => {
    renderHook(() => useCartExpiredGate(own));
    expect(vi.getTimerCount()).toBe(0);
  });
});

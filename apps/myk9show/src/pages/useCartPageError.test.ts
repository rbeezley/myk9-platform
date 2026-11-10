/**
 * MYK9-1823: the cart page's error line, against the real cart store. The page
 * tests mock the store, so only this file proves a sentence the page set is the
 * one shown, and raw store text is not.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { useCartStore } from '@/store/cartStore';
import {
  CART_OPEN_FAILED_MESSAGE,
  CART_OPEN_TIMED_OUT_MESSAGE,
} from '@/store/cartStore.ensureCart';
import { RECOVERY_FAILED_MESSAGE } from '@/store/cartStore.recovery';
import { CART_ERROR } from './cartErrorCopy';
import { useCartPageError } from './useCartPageError';

afterEach(() => {
  useCartStore.getState().reset();
});

describe('useCartPageError (MYK9-1823)', () => {
  it('returns a sentence the page set through setError as it is', () => {
    const { result } = renderHook(() => useCartPageError());

    act(() => result.current.setError(CART_ERROR.removeFailed));

    expect(result.current.error).toBe(CART_ERROR.removeFailed);
    expect(useCartStore.getState().error).toBe(CART_ERROR.removeFailed);
  });

  it('returns the fixed sentence for raw text written straight to the store', () => {
    const { result } = renderHook(() => useCartPageError());

    act(() => useCartStore.setState({ error: 'JWT expired' }));

    expect(result.current.error).toBe(CART_ERROR.unknown);
  });

  it('returns raw store text as the fixed sentence even after the page set its own', () => {
    const { result } = renderHook(() => useCartPageError());

    act(() => result.current.setError(CART_ERROR.clearFailed));
    act(() => useCartStore.setState({ error: 'new row violates row-level security policy' }));

    expect(result.current.error).toBe(CART_ERROR.unknown);
  });

  it.each([RECOVERY_FAILED_MESSAGE, CART_OPEN_FAILED_MESSAGE, CART_OPEN_TIMED_OUT_MESSAGE])(
    'returns the store sentence "%s" as it is',
    message => {
      const { result } = renderHook(() => useCartPageError());

      act(() => useCartStore.setState({ error: message }));

      expect(result.current.error).toBe(message);
    }
  );

  it('clears both the page sentence and the store error on setError(null)', () => {
    const { result } = renderHook(() => useCartPageError());

    act(() => result.current.setError(CART_ERROR.waitlistFailed));
    act(() => result.current.setError(null));

    expect(result.current.error).toBeNull();
    expect(useCartStore.getState().error).toBeNull();
    // The page sentence is gone too: the same text arriving from the store later is not trusted.
    act(() => useCartStore.setState({ error: CART_ERROR.waitlistFailed }));
    expect(result.current.error).toBe(CART_ERROR.unknown);
  });
});

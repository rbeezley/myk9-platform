import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useShowDetailsDisclosure } from '../useShowDetailsDisclosure';

const KEY = 'myk9.showDetailsOpen';

describe('useShowDetailsDisclosure', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts collapsed and remembers a toggle', () => {
    const { result } = renderHook(() => useShowDetailsDisclosure(null));
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('1');
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('0');
  });

  it('starts open when the remembered choice is open', () => {
    localStorage.setItem(KEY, '1');
    const { result } = renderHook(() => useShowDetailsDisclosure(null));
    expect(result.current.open).toBe(true);
  });

  it('opens for a link into the panel and closes again when the link is gone, without remembering it', () => {
    const { result, rerender } = renderHook(({ k }) => useShowDetailsDisclosure(k), {
      initialProps: { k: 'a:#setup-publish-premium' as string | null },
    });
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    // Another tab: no link, so the collapsed preference is back.
    rerender({ k: null });
    expect(result.current.open).toBe(false);
  });

  it('can be collapsed while the link is active, and a new click on the same link opens it again', () => {
    const { result, rerender } = renderHook(({ k }) => useShowDetailsDisclosure(k), {
      initialProps: { k: 'a:#setup-publish-premium' as string | null },
    });
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    // The same link clicked again is a new navigation, so a new key.
    rerender({ k: 'b:#setup-publish-premium' });
    expect(result.current.open).toBe(true);
  });

  it('opens for this visit only from the attention chip', () => {
    const { result } = renderHook(() => useShowDetailsDisclosure(null));
    act(() => result.current.openPanel());
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });
});

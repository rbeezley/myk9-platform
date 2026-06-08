import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  ShowPresenceContext,
  type ShowPresenceContextValue,
} from '@/features/show-presence/showPresenceContext';
import { useEditingPresence } from '@/features/show-presence/useEditingPresence';

const wrapperFor =
  (value: ShowPresenceContextValue) =>
  ({ children }: { children: ReactNode }) => (
    <ShowPresenceContext.Provider value={value}>{children}</ShowPresenceContext.Provider>
  );

describe('useEditingPresence', () => {
  it('advertises on mount and clears on unmount', () => {
    const setEditing = vi.fn();
    const clearEditing = vi.fn();
    const { unmount } = renderHook(() => useEditingPresence('show', 's1'), {
      wrapper: wrapperFor({ present: [], setEditing, clearEditing }),
    });

    expect(setEditing).toHaveBeenCalledWith({ entityType: 'show', entityId: 's1' });
    expect(clearEditing).not.toHaveBeenCalled();

    unmount();
    expect(clearEditing).toHaveBeenCalledTimes(1);
  });

  it('no-ops while the entity id is unknown (e.g. a closed panel)', () => {
    const setEditing = vi.fn();
    const clearEditing = vi.fn();
    renderHook(() => useEditingPresence('show', undefined), {
      wrapper: wrapperFor({ present: [], setEditing, clearEditing }),
    });
    expect(setEditing).not.toHaveBeenCalled();
  });

  it('does not throw outside a provider (no setters in context)', () => {
    expect(() => renderHook(() => useEditingPresence('show', 's1'))).not.toThrow();
  });

  it('clears the old advisory and re-advertises when the entity id changes', () => {
    const setEditing = vi.fn();
    const clearEditing = vi.fn();
    const { rerender } = renderHook(({ id }: { id: string }) => useEditingPresence('show', id), {
      wrapper: wrapperFor({ present: [], setEditing, clearEditing }),
      initialProps: { id: 's1' },
    });

    rerender({ id: 's2' });
    expect(clearEditing).toHaveBeenCalledTimes(1);
    expect(setEditing).toHaveBeenLastCalledWith({ entityType: 'show', entityId: 's2' });
  });
});

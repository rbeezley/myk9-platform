import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRingsideReturnStore } from './ringsideReturnStore';
import { useRingsideTrip } from './useRingsideTrip';

// MYK9-1697: Find a dog and the setup sheet are menu destinations on the entry
// list too, and live under /at-show where the return bar is hidden, so their
// own Up must take the judge back to the list they came from.
const DOGS = '/at-show/show-1/dogs';
const CLASSES = '/at-show/show-1';
const entriesState = {
  ringsideList: {
    kind: 'entries' as const,
    filters: { activeTab: 'pending', searchTerm: 'rex', sortBy: 'run', sectionFilter: 'all' },
  },
  scrollY: 640,
} as unknown as NonNullable<ReturnType<typeof useRingsideTrip>['state']>;

describe('useRingsideTrip', () => {
  beforeEach(() => {
    useRingsideReturnStore.getState().clear();
  });

  it('goes to the fixed parent, the class list, when the page was opened directly', () => {
    const { result } = renderHook(() => useRingsideTrip(DOGS, CLASSES));
    expect(result.current).toEqual({ to: CLASSES, state: undefined, label: 'Classes' });
  });

  it('goes back to the entry list, with its filters and scroll, when opened from its menu', () => {
    useRingsideReturnStore.getState().set({
      returnTo: '/at-show/show-1/class/class-1',
      scope: DOGS,
      state: entriesState,
    });
    const { result } = renderHook(() => useRingsideTrip(DOGS, CLASSES));
    expect(result.current).toEqual({
      to: '/at-show/show-1/class/class-1',
      state: entriesState,
      label: 'Entries',
    });
  });

  it('names the class list when the menu was opened there, query included', () => {
    useRingsideReturnStore.getState().set({ returnTo: `${CLASSES}?view=all`, scope: DOGS });
    const { result } = renderHook(() => useRingsideTrip(DOGS, CLASSES));
    expect(result.current).toMatchObject({ to: `${CLASSES}?view=all`, label: 'Classes' });
  });

  it('ignores a trip recorded for another destination', () => {
    useRingsideReturnStore.getState().set({
      returnTo: '/at-show/show-1/class/class-1',
      scope: '/at-show/show-1/setup-sheet',
    });
    const { result } = renderHook(() => useRingsideTrip(DOGS, CLASSES));
    expect(result.current.to).toBe(CLASSES);
  });
});

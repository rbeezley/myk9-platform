import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  FILTER_STRIP_MIN_SHOWS,
  countDistinctShows,
  shouldShowEntryFilterStrip,
  useEntryFilterStripVisible,
} from './entryFilterStripVisibility';

const defaults = { selectedTab: 'all', selectedStatus: 'any' } as const;

describe('shouldShowEntryFilterStrip', () => {
  it('threshold is three shows', () => {
    expect(FILTER_STRIP_MIN_SHOWS).toBe(3);
  });

  it.each([0, 1, 2])('hides the rail for %i shows with default filters', n => {
    expect(shouldShowEntryFilterStrip({ distinctShowCount: n, ...defaults })).toBe(false);
  });

  it('shows the rail from the third show', () => {
    expect(shouldShowEntryFilterStrip({ distinctShowCount: 3, ...defaults })).toBe(true);
  });

  it('keeps the rail when a deep link narrows by tab', () => {
    expect(
      shouldShowEntryFilterStrip({ distinctShowCount: 2, ...defaults, selectedTab: 'upcoming' })
    ).toBe(true);
  });

  it('keeps the rail when a deep link narrows by status', () => {
    expect(
      shouldShowEntryFilterStrip({ distinctShowCount: 2, ...defaults, selectedStatus: 'pending' })
    ).toBe(true);
  });
});

describe('countDistinctShows', () => {
  it('counts two entries in one show as one show', () => {
    expect(countDistinctShows([{ showId: 'a' }, { showId: 'a' }, { showId: 'b' }])).toBe(2);
  });

  it('is zero with no entries', () => {
    expect(countDistinctShows([])).toBe(0);
  });
});

describe('useEntryFilterStripVisible', () => {
  it('stays visible once shown, even after the narrowing is undone', () => {
    type Args = Parameters<typeof shouldShowEntryFilterStrip>[0];
    const narrowed: Args = { distinctShowCount: 2, ...defaults, selectedTab: 'completed' };
    const { result, rerender } = renderHook((args: Args) => useEntryFilterStripVisible(args), {
      initialProps: narrowed,
    });
    expect(result.current).toBe(true);
    rerender({ distinctShowCount: 2, ...defaults });
    expect(result.current).toBe(true);
  });

  it('stays hidden when it was never shown', () => {
    const { result } = renderHook(() =>
      useEntryFilterStripVisible({ distinctShowCount: 2, ...defaults })
    );
    expect(result.current).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS,
  useMyEntriesLiveRefresh,
} from './useMyEntriesLiveRefresh';

const { listeners, makeTable } = vi.hoisted(() => {
  const listeners: Record<string, Set<() => void>> = {};
  const makeTable = (name: string) => {
    listeners[name] = new Set();
    return {
      subscribe: vi.fn((listener: () => void) => {
        listeners[name].add(listener);
        return () => listeners[name].delete(listener);
      }),
    };
  };
  return { listeners, makeTable };
});

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: makeTable('entries'),
  replicatedDogsTable: makeTable('dogs'),
  replicatedClassesTable: makeTable('classes'),
}));

import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
} from '@/services/replication';

const notify = (table: string) => listeners[table].forEach(listener => listener());

describe('useMyEntriesLiveRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('subscribes to entries, dogs and classes without the initial emit', () => {
    renderHook(() => useMyEntriesLiveRefresh(vi.fn().mockResolvedValue(undefined), true));
    for (const table of [replicatedEntriesTable, replicatedDogsTable, replicatedClassesTable]) {
      expect(table.subscribe).toHaveBeenCalledWith(expect.any(Function), { emitCurrent: false });
    }
  });

  it('refreshes once after a burst of notices across tables', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useMyEntriesLiveRefresh(refresh, true));

    notify('entries');
    vi.advanceTimersByTime(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS - 1);
    notify('classes');
    vi.advanceTimersByTime(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS - 1);
    notify('dogs');
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('calls the latest refresh after a re-render', () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ refresh }) => useMyEntriesLiveRefresh(refresh, true), {
      initialProps: { refresh: first },
    });
    notify('entries');
    rerender({ refresh: second });
    vi.advanceTimersByTime(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('defers the refresh while busy, then runs it once the busy state clears', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    let busy = true;
    renderHook(() => useMyEntriesLiveRefresh(refresh, true, () => busy));
    notify('entries');
    vi.advanceTimersByTime(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS * 3);
    expect(refresh).not.toHaveBeenCalled();

    busy = false;
    vi.advanceTimersByTime(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe while disabled', () => {
    renderHook(() => useMyEntriesLiveRefresh(vi.fn().mockResolvedValue(undefined), false));
    expect(replicatedEntriesTable.subscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes and drops a pending refresh on unmount', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useMyEntriesLiveRefresh(refresh, true));
    notify('entries');
    unmount();
    vi.advanceTimersByTime(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
    expect(listeners.entries.size + listeners.dogs.size + listeners.classes.size).toBe(0);
  });
});

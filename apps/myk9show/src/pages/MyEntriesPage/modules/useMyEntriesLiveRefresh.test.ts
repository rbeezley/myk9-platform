import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS,
  useMyEntriesLiveRefresh,
} from './useMyEntriesLiveRefresh';
import { getUserEntriesFromReplica } from '@/services/database/entries';

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
vi.mock('@/services/database/entries', () => ({
  getUserEntriesFromReplica: vi.fn(),
  getUserEntries: vi.fn(),
}));
vi.mock('@/services/LoggingService', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import {
  replicatedClassesTable,
  replicatedDogsTable,
  replicatedEntriesTable,
} from '@/services/replication';
import { getUserEntries } from '@/services/database/entries';

const notify = (table: string) => listeners[table].forEach(listener => listener());
const flush = async () => {
  await vi.advanceTimersByTimeAsync(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS);
};
const rows = [{ id: 'entry-1' }];

describe('useMyEntriesLiveRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getUserEntriesFromReplica).mockResolvedValue(rows);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const render = (applyRows = vi.fn(), identity: string | null = 'user-1::person-1') => ({
    applyRows,
    ...renderHook(() => useMyEntriesLiveRefresh({ identity, personId: 'person-1', applyRows })),
  });

  it('subscribes to entries, dogs and classes without the initial emit', () => {
    render();
    for (const table of [replicatedEntriesTable, replicatedDogsTable, replicatedClassesTable]) {
      expect(table.subscribe).toHaveBeenCalledWith(expect.any(Function), { emitCurrent: false });
    }
    expect(getUserEntriesFromReplica).not.toHaveBeenCalled();
  });

  it('reads the replica once for a burst of notices across tables, never the server view', async () => {
    const { applyRows } = render();

    notify('entries');
    await vi.advanceTimersByTimeAsync(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS - 1);
    notify('classes');
    await vi.advanceTimersByTimeAsync(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS - 1);
    notify('dogs');
    expect(getUserEntriesFromReplica).not.toHaveBeenCalled();

    await flush();
    expect(getUserEntriesFromReplica).toHaveBeenCalledTimes(1);
    expect(getUserEntriesFromReplica).toHaveBeenCalledWith('person-1');
    expect(applyRows).toHaveBeenCalledWith(rows, 'user-1::person-1');
    expect(getUserEntries).not.toHaveBeenCalled();
  });

  it('applies nothing when the replica cannot be read', async () => {
    vi.mocked(getUserEntriesFromReplica).mockResolvedValue(null);
    const { applyRows } = render();
    notify('entries');
    await flush();
    expect(applyRows).not.toHaveBeenCalled();
  });

  it('does not subscribe without an identity', () => {
    render(vi.fn(), null);
    expect(replicatedEntriesTable.subscribe).not.toHaveBeenCalled();
  });

  it('drops a pending read and unsubscribes on unmount', async () => {
    const { applyRows, unmount } = render();
    notify('entries');
    unmount();
    await vi.advanceTimersByTimeAsync(MY_ENTRIES_LIVE_REFRESH_DEBOUNCE_MS * 2);
    expect(getUserEntriesFromReplica).not.toHaveBeenCalled();
    expect(applyRows).not.toHaveBeenCalled();
    expect(listeners.entries.size + listeners.dogs.size + listeners.classes.size).toBe(0);
  });

  it('discards a slow read that lands after unmount', async () => {
    let resolveRead!: (value: Record<string, unknown>[]) => void;
    vi.mocked(getUserEntriesFromReplica).mockReturnValue(
      new Promise(resolve => {
        resolveRead = resolve;
      })
    );
    const { applyRows, unmount } = render();
    notify('entries');
    await flush();
    unmount();
    resolveRead(rows);
    await vi.advanceTimersByTimeAsync(0);
    expect(applyRows).not.toHaveBeenCalled();
  });
});

/**
 * Hand placement (MYK9-972) through the real hook: every write goes through the
 * replicated entries table (offline-first), only the dogs that moved are
 * written, and Undo restores exactly those.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useShowMapRunOrderAutoSort } from '../useShowMapRunOrderAutoSort';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const { getEntriesByClassMock, updateEntryMock, toastMock } = vi.hoisted(() => ({
  getEntriesByClassMock: vi.fn<(classId: string) => Promise<ReplicatedEntry[]>>(),
  updateEntryMock:
    vi.fn<(id: string, updates: Partial<ReplicatedEntry>) => Promise<string | null>>(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: getEntriesByClassMock,
    updateEntry: updateEntryMock,
  },
}));
vi.mock('sonner', () => ({ toast: toastMock }));

const e = (id: string, runOrder: number, extra: Partial<ReplicatedEntry> = {}) =>
  ({ id, armband: String(100 + Number(id.slice(1))), runOrder, ...extra }) as ReplicatedEntry;

function wrapper() {
  const client = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const render = () =>
  renderHook(() => useShowMapRunOrderAutoSort({ showId: 's1' }), { wrapper: wrapper() });

beforeEach(() => {
  getEntriesByClassMock.mockReset();
  updateEntryMock.mockReset().mockResolvedValue('mutation-id');
  Object.values(toastMock).forEach(fn => fn.mockReset());
  getEntriesByClassMock.mockResolvedValue([
    e('e1', 1),
    e('e2', 2, { isScored: true }),
    e('e3', 3),
    e('e4', 4),
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('placeEntry', () => {
  it('writes run_order through the replicated table for the dogs that moved, nothing else', async () => {
    const { result } = render();
    act(() =>
      result.current.placeEntry({ classId: 'c1', entryId: 'e4', toPosition: 1, entryLabel: '#104' })
    );
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());

    // e2 is scored: it holds slot 2 and is never written.
    expect(updateEntryMock.mock.calls.map(([id, u]) => [id, u])).toEqual([
      ['e4', { runOrder: 1 }],
      ['e1', { runOrder: 3 }],
      ['e3', { runOrder: 4 }],
    ]);
    expect(toastMock.success).toHaveBeenCalledWith('Moved #104 to position 1');
  });

  it('still saves while offline: the write is the queued replicated update, not a network call', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = render();
    act(() => result.current.placeEntry({ classId: 'c1', entryId: 'e4', toPosition: 3 }));
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());

    expect(updateEntryMock).toHaveBeenCalledWith('e4', { runOrder: 3 });
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.warning).not.toHaveBeenCalled();
  });

  it('refuses a pinned dog without writing anything', async () => {
    const { result } = render();
    act(() => result.current.placeEntry({ classId: 'c1', entryId: 'e2', toPosition: 3 }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(updateEntryMock).not.toHaveBeenCalled();
    expect(result.current.lastAutoSort).toBeNull();
  });

  it('warns and keeps Undo when a write is rejected', async () => {
    updateEntryMock.mockImplementation(async id => {
      if (id === 'e1') throw new Error('queue full');
      return 'm';
    });
    const { result } = render();
    act(() => result.current.placeEntry({ classId: 'c1', entryId: 'e4', toPosition: 1 }));
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
    expect(result.current.lastAutoSort?.kind).toBe('hand');
  });

  it('Undo puts back only the moved dogs, to their prior slots', async () => {
    const { result } = render();
    act(() => result.current.placeEntry({ classId: 'c1', entryId: 'e4', toPosition: 1 }));
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
    updateEntryMock.mockClear();

    act(() => result.current.undoLastAutoSort());
    await waitFor(() => expect(updateEntryMock).toHaveBeenCalledTimes(3));
    expect(
      Object.fromEntries(updateEntryMock.mock.calls.map(([id, u]) => [id, u.runOrder]))
    ).toEqual({
      e4: 4,
      e1: 1,
      e3: 3,
    });
  });

  it('a preset after a hand move re-sorts every open dog by armband', async () => {
    getEntriesByClassMock.mockResolvedValue([e('e1', 2), e('e2', 3), e('e3', 1)]); // e3 hand-placed first
    const { result } = render();
    act(() => result.current.autoSort({ classId: 'c1', kind: 'armband-asc' }));
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
    expect(
      Object.fromEntries(updateEntryMock.mock.calls.map(([id, u]) => [id, u.runOrder]))
    ).toEqual({
      e1: 1,
      e2: 2,
      e3: 3,
    });
  });
});

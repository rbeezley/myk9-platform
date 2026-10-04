/**
 * Hand placement (MYK9-972) through the real hook: every write goes through the
 * replicated entries table (offline-first), only the dogs that moved are
 * written, and Undo restores exactly those.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useShowMapRunOrderAutoSort } from '../useShowMapRunOrderAutoSort';
import { classPlacementKey, loadClassPlacement } from '../classPlacementSource';
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
const { getArmbandsMock } = vi.hoisted(() => ({
  getArmbandsMock: vi.fn<(showId: string) => Promise<unknown[]>>(),
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: getArmbandsMock },
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
  getArmbandsMock.mockReset().mockResolvedValue([]);
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

    // e2 is scored: it is not waiting, never written, and its number (2) is the
    // base the three waiting dogs are renumbered after.
    expect(updateEntryMock.mock.calls.map(([id, u]) => [id, u])).toEqual([
      ['e4', { runOrder: 3 }],
      ['e1', { runOrder: 4 }],
      ['e3', { runOrder: 5 }],
    ]);
    expect(toastMock.success).toHaveBeenCalledWith('Moved #104 to position 1');
  });

  describe('offline (React Query onlineManager)', () => {
    beforeEach(() => {
      onlineManager.setOnline(false);
    });
    afterEach(() => {
      onlineManager.setOnline(true);
    });

    it('a hand move still writes to the replicated table and offers Undo', async () => {
      const { result } = render();
      act(() => result.current.placeEntry({ classId: 'c1', entryId: 'e4', toPosition: 1 }));
      await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
      expect(updateEntryMock).toHaveBeenCalledWith('e4', { runOrder: 3 });
      expect(toastMock.error).not.toHaveBeenCalled();
      expect(toastMock.warning).not.toHaveBeenCalled();
      expect(result.current.isAutoSorting).toBe(false);
    });

    it('a preset still writes', async () => {
      const { result } = render();
      act(() => result.current.autoSort({ classId: 'c1', kind: 'armband-desc' }));
      await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
      expect(updateEntryMock).toHaveBeenCalled();
    });

    it('Undo still writes', async () => {
      const { result } = render();
      act(() => result.current.placeEntry({ classId: 'c1', entryId: 'e4', toPosition: 1 }));
      await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
      updateEntryMock.mockClear();
      act(() => result.current.undoLastAutoSort());
      await waitFor(() => expect(updateEntryMock).toHaveBeenCalled());
      expect(result.current.lastAutoSort).toBeNull();
    });
  });

  it('refuses a dog that is not waiting without writing anything', async () => {
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

describe('placeEntry reads the same inputs the panel shows (round 3)', () => {
  it('an in-ring dog flagged only by is_in_ring keeps its slot', async () => {
    getEntriesByClassMock.mockResolvedValue([
      e('e1', 1),
      e('e2', 2, { isInRing: true }),
      e('e3', 3),
    ]);
    const { result } = render();
    act(() => result.current.placeEntry({ classId: 'c1', entryId: 'e3', toPosition: 1 }));
    await waitFor(() => expect(result.current.lastAutoSort).not.toBeNull());
    expect(
      Object.fromEntries(updateEntryMock.mock.calls.map(([id, u]) => [id, u.runOrder]))
    ).toEqual({ e1: 4 });
  });

  it('positions follow armbands that exist only in the armbands table', async () => {
    getEntriesByClassMock.mockResolvedValue([
      { id: 'e1', dogId: 'd1', entryStatus: 'confirmed' } as ReplicatedEntry,
      { id: 'e2', dogId: 'd2', entryStatus: 'confirmed' } as ReplicatedEntry,
      { id: 'e3', dogId: 'd3', entryStatus: 'confirmed' } as ReplicatedEntry,
    ]);
    getArmbandsMock.mockResolvedValue([
      { armbandNumber: '103', dogId: 'd1' },
      { armbandNumber: '101', dogId: 'd2' },
      { armbandNumber: '102', dogId: 'd3' },
    ]);
    // Order by armband: e2, e3, e1. Move e1 to slot 1.
    const { result } = render();
    act(() => result.current.placeEntry({ classId: 'c1', entryId: 'e1', toPosition: 1 }));
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

describe('controls stay busy until the panel shows the new order', () => {
  // The hook plus the panel's placement query, as the cockpit mounts them.
  const renderWithPanel = () =>
    renderHook(
      () => {
        const sort = useShowMapRunOrderAutoSort({ showId: 's1' });
        const placement = useQuery({
          queryKey: classPlacementKey('s1', 'c1'),
          queryFn: () => loadClassPlacement('s1', 'c1'),
          networkMode: 'always',
        });
        return { sort, placement };
      },
      { wrapper: wrapper() }
    );

  it('a slow refresh keeps the controls disabled until the new data arrives', async () => {
    const { result } = renderWithPanel();
    await waitFor(() => expect(result.current.placement.data).toBeDefined());

    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const rows = [e('e1', 1), e('e2', 2, { isScored: true }), e('e3', 3), e('e4', 4)];
    getEntriesByClassMock.mockImplementation(async () => {
      await gate;
      return rows;
    });
    // The write itself reads before the gate matters; let it through first.
    getEntriesByClassMock.mockImplementationOnce(async () => rows);

    act(() => result.current.sort.placeEntry({ classId: 'c1', entryId: 'e4', toPosition: 1 }));
    await waitFor(() => expect(updateEntryMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.placement.isFetching).toBe(true));
    expect(result.current.sort.isAutoSorting).toBe(true);

    release();
    await waitFor(() => expect(result.current.sort.isAutoSorting).toBe(false));
    expect(result.current.placement.isFetching).toBe(false);
  });

  it('offline, the controls are usable again after the local write', async () => {
    const { result } = renderWithPanel();
    await waitFor(() => expect(result.current.placement.data).toBeDefined());
    onlineManager.setOnline(false);
    try {
      act(() => result.current.sort.placeEntry({ classId: 'c1', entryId: 'e4', toPosition: 1 }));
      await waitFor(() => expect(updateEntryMock).toHaveBeenCalled());
      await waitFor(() => expect(result.current.sort.isAutoSorting).toBe(false));
    } finally {
      onlineManager.setOnline(true);
    }
  });
});

/**
 * Hook-level tests for useShowMapReorderMode covering:
 *  - The in-flight guard so a second drag dispatched before the first
 *    write settles does NOT fire a second persistMutation.
 *  - The Alt+ArrowUp/Down keyboard path skipping pinned neighbors and
 *    dispatching the same persist contract as a drag.
 *
 * Both behaviors were post-merge review findings on PR #320 — the race
 * landed without a guard in the original ship, and Alt+Arrow was missed
 * entirely. This file pins both so regressions break here.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useShowMapReorderMode } from '../useShowMapReorderMode';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { DragEndEvent } from '@dnd-kit/core';

const { getEntriesByClassMock, updateEntryMock } = vi.hoisted(() => ({
  getEntriesByClassMock: vi.fn<(classId: string) => Promise<ReplicatedEntry[]>>(),
  updateEntryMock:
    vi.fn<(id: string, updates: Partial<ReplicatedEntry>) => Promise<string | null>>(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: getEntriesByClassMock,
    updateEntry: updateEntryMock,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function entry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return {
    id: overrides.id ?? 'e',
    armband: overrides.armband ?? '0',
    runOrder: overrides.runOrder,
    isScored: overrides.isScored,
    ...overrides,
  } as ReplicatedEntry;
}

function makeWrapper() {
  const client = createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getEntriesByClassMock.mockReset();
  updateEntryMock.mockReset();
  updateEntryMock.mockResolvedValue('mutation-id');
});

describe('useShowMapReorderMode — in-flight guard', () => {
  it('drops a second onDragEnd while a previous persist is still in flight', async () => {
    // Hold the first updateEntry call indefinitely so isPersistingRef stays
    // true while we fire the second drag.
    let resolveFirstWrite: (() => void) | undefined;
    updateEntryMock.mockImplementation(
      () =>
        new Promise<string | null>(resolve => {
          if (!resolveFirstWrite) {
            resolveFirstWrite = () => resolve('mutation-id');
          } else {
            resolve('mutation-id');
          }
        })
    );
    getEntriesByClassMock.mockResolvedValue([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
      entry({ id: 'c', armband: '30', runOrder: 3 }),
    ]);

    const { result } = renderHook(() => useShowMapReorderMode({ showId: 'show-1' }), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.enter({ classId: 'class-1', classLabel: 'Container Novice' }));

    const dragEvent = (active: string, over: string): DragEndEvent =>
      ({ active: { id: `entry:${active}` }, over: { id: `entry:${over}` } } as DragEndEvent);

    // First drag: enters the mutation, in-flight ref becomes true.
    act(() => result.current.onDragEnd(dragEvent('a', 'c')));
    await waitFor(() => expect(getEntriesByClassMock).toHaveBeenCalledTimes(1));

    // Second drag while first is in flight: must be a no-op.
    act(() => result.current.onDragEnd(dragEvent('b', 'a')));

    // Give React Query a microtask tick — second persist should NOT have
    // refetched entries.
    await Promise.resolve();
    expect(getEntriesByClassMock).toHaveBeenCalledTimes(1);

    // Resolve the first write so the hook can settle for cleanup.
    resolveFirstWrite?.();
    await waitFor(() => expect(result.current.isPersisting).toBe(false));
  });
});

describe('useShowMapReorderMode — optimistic reorder overlay', () => {
  it('commits the optimistic order synchronously in onDragEnd and clears it onSettled', async () => {
    const writeResolvers: Array<() => void> = [];
    updateEntryMock.mockImplementation(
      () =>
        new Promise<string | null>(resolve => {
          writeResolvers.push(() => resolve('mutation-id'));
        })
    );
    getEntriesByClassMock.mockResolvedValue([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
      entry({ id: 'c', armband: '30', runOrder: 3 }),
    ]);

    const { result } = renderHook(() => useShowMapReorderMode({ showId: 'show-1' }), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.enter({ classId: 'class-1', classLabel: 'Container Novice' }));

    // Simulate the SortableContext call: structure table passes the
    // current visible items + the drag event.
    const items = ['entry:a', 'entry:b', 'entry:c'];
    const dragEvent: DragEndEvent = {
      active: { id: 'entry:a' },
      over: { id: 'entry:c' },
    } as DragEndEvent;

    act(() => result.current.buildOnDragEnd(items)(dragEvent));

    // Immediately after the drop the optimistic overlay reflects the
    // new order — no waiting for the DB write.
    expect(result.current.getOptimisticOrder('class-1')).toEqual([
      'entry:b',
      'entry:c',
      'entry:a',
    ]);

    // Wait for the mutation to dispatch its updateEntry calls, then
    // resolve them all and confirm the overlay clears so the next
    // render falls back to server truth.
    await waitFor(() => expect(writeResolvers.length).toBeGreaterThan(0));
    writeResolvers.forEach(fn => fn());
    await waitFor(() => expect(result.current.getOptimisticOrder('class-1')).toBeUndefined());
  });

  it('exit() clears any pending optimistic overlays', async () => {
    updateEntryMock.mockResolvedValue('mutation-id');
    getEntriesByClassMock.mockResolvedValue([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
    ]);

    const { result } = renderHook(() => useShowMapReorderMode({ showId: 'show-1' }), {
      wrapper: makeWrapper(),
    });
    act(() => result.current.enter({ classId: 'class-1', classLabel: 'Container Novice' }));

    const items = ['entry:a', 'entry:b'];
    act(() =>
      result.current.buildOnDragEnd(items)({
        active: { id: 'entry:a' },
        over: { id: 'entry:b' },
      } as DragEndEvent)
    );

    // Drain the in-flight persist before exit so the ref-guard releases.
    await waitFor(() => expect(result.current.isPersisting).toBe(false));

    act(() => result.current.exit());
    expect(result.current.getOptimisticOrder('class-1')).toBeUndefined();
  });
});

describe('useShowMapReorderMode — keyboard reorder optimistic overlay', () => {
  it('commits the optimistic order synchronously in onKeyboardReorder and clears it onSettled', async () => {
    // Hold the writes open so we can assert the overlay reflects the
    // new order BEFORE the DB write settles. Mirrors the drag-end
    // overlay test above — the keyboard path used to skip this and
    // the focused row visibly snapped back until the refetch landed.
    const writeResolvers: Array<() => void> = [];
    updateEntryMock.mockImplementation(
      () =>
        new Promise<string | null>(resolve => {
          writeResolvers.push(() => resolve('mutation-id'));
        })
    );
    getEntriesByClassMock.mockResolvedValue([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
      entry({ id: 'c', armband: '30', runOrder: 3 }),
    ]);

    const { result } = renderHook(() => useShowMapReorderMode({ showId: 'show-1' }), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.enter({ classId: 'class-1', classLabel: 'Container Novice' }));

    // Alt+ArrowDown on A: A swaps past B → expected new order [B, A, C].
    await act(async () => {
      await result.current.onKeyboardReorder('entry:a', 'down');
    });

    expect(result.current.getOptimisticOrder('class-1')).toEqual([
      'entry:b',
      'entry:a',
      'entry:c',
    ]);

    await waitFor(() => expect(writeResolvers.length).toBeGreaterThan(0));
    writeResolvers.forEach(fn => fn());
    await waitFor(() => expect(result.current.getOptimisticOrder('class-1')).toBeUndefined());
  });
});

describe('useShowMapReorderMode — Alt+Arrow keyboard reorder skips pinned neighbors', () => {
  it('Alt+ArrowDown on an unpinned entry hops past a pinned neighbor', async () => {
    // Layout: [A, B(pinned), C, D]. Alt+ArrowDown on A should move A to
    // C's slot (the next UNPINNED entry), not into B's pinned position.
    getEntriesByClassMock.mockResolvedValue([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2, isScored: true }), // pinned
      entry({ id: 'c', armband: '30', runOrder: 3 }),
      entry({ id: 'd', armband: '40', runOrder: 4 }),
    ]);

    const { result } = renderHook(() => useShowMapReorderMode({ showId: 'show-1' }), {
      wrapper: makeWrapper(),
    });

    act(() => result.current.enter({ classId: 'class-1', classLabel: 'Container Novice' }));

    await act(async () => {
      await result.current.onKeyboardReorder('entry:a', 'down');
    });

    await waitFor(() => expect(updateEntryMock).toHaveBeenCalled());

    // After the move:
    //  - B stays pinned at slot 2
    //  - Unpinned list was [A, C, D]; A moves to C's slot → [C, A, D]
    //  - Re-merged with pinned: slot1=C, slot2=B, slot3=A, slot4=D
    const calls = updateEntryMock.mock.calls.map(([id, updates]) => ({ id, updates }));
    expect(calls).toEqual(
      expect.arrayContaining([
        { id: 'c', updates: { runOrder: 1 } },
        { id: 'b', updates: { runOrder: 2 } },
        { id: 'a', updates: { runOrder: 3 } },
        { id: 'd', updates: { runOrder: 4 } },
      ])
    );
  });

  it('Alt+ArrowUp at the first unpinned slot is a no-op', async () => {
    getEntriesByClassMock.mockResolvedValue([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
    ]);
    const { result } = renderHook(() => useShowMapReorderMode({ showId: 'show-1' }), {
      wrapper: makeWrapper(),
    });
    act(() => result.current.enter({ classId: 'class-1', classLabel: 'Container Novice' }));

    await act(async () => {
      await result.current.onKeyboardReorder('entry:a', 'up');
    });

    // No persist writes should happen — A was already at the top of the
    // unpinned list.
    expect(updateEntryMock).not.toHaveBeenCalled();
  });
});

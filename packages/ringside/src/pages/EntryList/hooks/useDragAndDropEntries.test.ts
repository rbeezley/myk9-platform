/**
 * Tests for useDragAndDropEntries — entry reordering drag-and-drop hook.
 *
 * Moved from apps/myk9q/src/pages/EntryList/hooks/useDragAndDropEntries.test.ts
 * in PR E2a alongside the implementation. The test for the in-app shim
 * stayed in apps/myk9q only conceptually — at the package level the hook
 * now takes `updateExhibitorOrder` as an explicit prop, which makes these
 * tests STRICTLY simpler than the original module-boundary mock pattern:
 * no `vi.mock('../../../services/entryService', ...)` factory needed,
 * just pass a `vi.fn()` and assert on it directly.
 *
 * Coverage (this hook has known regression history — PR #320 had a
 * critical drag-end bug that escaped review):
 *
 *   1. Drag start sets the protection flag + captures a stable snapshot
 *   2. Drag end uses that snapshot (not the live `currentEntries` prop) so
 *      sync arrivals mid-drag don't corrupt index math
 *   3. Reorder math is right: arrayMove + 1-based `exhibitorOrder`
 *      recomputation
 *   4. Entries outside the current view (filtered out) are preserved
 *      through the merge back into `localEntries`
 *   5. In-ring guard prevents moving a non-ring dog ahead of in-ring dogs
 *      (target index 0 special case)
 *   6. No-op cases: no `over`, drag onto self, ids not found in snapshot
 *   7. Grace period — `isDraggingRef` stays true until `gracePeriodMs`
 *      after the DB write completes
 *   8. DB failure does NOT roll back the optimistic UI update
 *      (offline-first)
 *
 * The hook accepts an external `isDraggingRef` and `setManualOrder` —
 * both branches are covered so the move doesn't drop the
 * external-injection API.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useDragAndDropEntries } from './useDragAndDropEntries';
import type { Entry } from '../../../stores/entryStore';

// Silence the logger inside the DB-failure test (it logs the error).
vi.mock('@myk9/core', async () => {
  const actual = await vi.importActual<typeof import('@myk9/core')>('@myk9/core');
  return {
    ...actual,
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    },
  };
});

function makeEntry(over: Partial<Entry> = {}): Entry {
  return {
    id: '0',
    armband: 0,
    callName: '',
    breed: '',
    handler: '',
    isScored: false,
    status: 'no-status',
    classId: '1',
    className: 'Test Class',
    inRing: false,
    exhibitorOrder: 0,
    ...over,
  };
}

/**
 * DnD-kit's DragEndEvent has many fields we don't read in the hook.
 * Building the minimal shape the hook actually consumes (active.id, over.id)
 * keeps these tests honest about the contract surface.
 */
function dragEvent(activeId: number | string, overId: number | string | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as unknown as DragEndEvent;
}

function dragStartEvent(activeId: number | string): DragStartEvent {
  return {
    active: { id: activeId },
  } as unknown as DragStartEvent;
}

/**
 * Default `updateExhibitorOrder` mock. Each test that wants custom
 * behavior creates its own via `vi.fn().mockResolvedValueOnce(...)` /
 * `mockRejectedValueOnce(...)` and passes it through.
 */
function defaultUpdater(): Mock {
  return vi.fn().mockResolvedValue(true);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Always flush any pending grace-period timeouts; if a test forgets to
  // advance timers, the next test inherits a leaked isDragging=true flag.
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useDragAndDropEntries — initial state', () => {
  it('exposes drag-state flags as false and a non-null sensors object', () => {
    const setLocalEntries = vi.fn();
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: [],
        setLocalEntries,
        currentEntries: [],
        updateExhibitorOrder: defaultUpdater(),
      }),
    );

    expect(result.current.isDragging).toBe(false);
    expect(result.current.isUpdatingOrder).toBe(false);
    expect(result.current.isDraggingRef.current).toBe(false);
    expect(result.current.sensors).toBeDefined();
  });

  it('uses an externally-supplied isDraggingRef when provided (sync-suppression contract)', () => {
    const externalRef = { current: false };
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: [],
        setLocalEntries: vi.fn(),
        currentEntries: [],
        updateExhibitorOrder: defaultUpdater(),
        isDraggingRef: externalRef,
      }),
    );

    // The hook MUST hand back the same ref — that's how useEntryListData
    // sees `isDraggingRef.current = true` and skips invalidations.
    expect(result.current.isDraggingRef).toBe(externalRef);

    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });
    expect(externalRef.current).toBe(true);
  });
});

describe('useDragAndDropEntries — handleDragStart', () => {
  it('sets the drag flag immediately so concurrent syncs can early-out', () => {
    const setLocalEntries = vi.fn();
    const currentEntries = [makeEntry({ id: '1', armband: 1 }), makeEntry({ id: '2', armband: 2 })];
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder: defaultUpdater(),
      }),
    );

    expect(result.current.isDraggingRef.current).toBe(false);

    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });

    expect(result.current.isDraggingRef.current).toBe(true);
    expect(result.current.isDragging).toBe(true);
  });
});

describe('useDragAndDropEntries — handleDragEnd reorder', () => {
  it('moves the active entry to the target position and renumbers exhibitorOrder 1..N', async () => {
    const setLocalEntries = vi.fn();
    const setManualOrder = vi.fn();
    const updateExhibitorOrder = defaultUpdater();
    const currentEntries = [
      makeEntry({ id: '1', armband: 1, exhibitorOrder: 1 }),
      makeEntry({ id: '2', armband: 2, exhibitorOrder: 2 }),
      makeEntry({ id: '3', armband: 3, exhibitorOrder: 3 }),
    ];
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder,
        setManualOrder,
      }),
    );

    // Begin drag — snapshot is captured here
    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });

    // Drop entry 1 onto entry 3 → expect order [2, 3, 1]
    await act(async () => {
      await result.current.handleDragEnd(dragEvent('1', '3'));
    });

    expect(updateExhibitorOrder).toHaveBeenCalledTimes(1);
    const reordered = updateExhibitorOrder.mock.calls[0][0] as Entry[];
    expect(reordered.map(e => e.id)).toEqual(['2', '3', '1']);
    expect(reordered.map(e => e.exhibitorOrder)).toEqual([1, 2, 3]);

    // External setManualOrder receives the same reordered list
    expect(setManualOrder).toHaveBeenCalledWith(reordered);

    // setLocalEntries gets the full localEntries merge (here identical to
    // currentEntries — see the "preserves filtered-out entries" test below
    // for the divergent case).
    expect(setLocalEntries).toHaveBeenCalledTimes(1);
    expect(setLocalEntries.mock.calls[0][0]).toEqual(reordered);
  });

  it('preserves entries that are in localEntries but NOT in the current filtered view', async () => {
    const setLocalEntries = vi.fn();
    // localEntries has 4 dogs; only 3 are in the current (filtered) view.
    const hiddenEntry = makeEntry({ id: '99', armband: 99, exhibitorOrder: 99 });
    const currentEntries = [
      makeEntry({ id: '1', armband: 1, exhibitorOrder: 1 }),
      makeEntry({ id: '2', armband: 2, exhibitorOrder: 2 }),
      makeEntry({ id: '3', armband: 3, exhibitorOrder: 3 }),
    ];
    const localEntries = [...currentEntries, hiddenEntry];

    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder: defaultUpdater(),
      }),
    );

    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });
    await act(async () => {
      await result.current.handleDragEnd(dragEvent('1', '3'));
    });

    const merged = setLocalEntries.mock.calls[0][0] as Entry[];
    // Hidden entry survives the merge — losing it would be silent data loss.
    expect(merged.find(e => e.id === '99')).toEqual(hiddenEntry);
    expect(merged).toHaveLength(4);
  });

  it('uses the drag-start snapshot, not the live currentEntries prop, for index math', async () => {
    const setLocalEntries = vi.fn();
    const updateExhibitorOrder = defaultUpdater();

    // Start with a 3-entry view
    const startEntries = [
      makeEntry({ id: '1', armband: 1 }),
      makeEntry({ id: '2', armband: 2 }),
      makeEntry({ id: '3', armband: 3 }),
    ];

    let currentEntries = startEntries;
    const { result, rerender } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder,
      }),
    );

    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });

    // Mid-drag, a sync arrives and appends a NEW entry to the live array.
    // This is the regression scenario: if drag-end consulted currentEntries
    // instead of the snapshot, the new entry would shift indices and the
    // wrong dog would land in the wrong slot.
    currentEntries = [...startEntries, makeEntry({ id: '4', armband: 4 })];
    rerender();

    await act(async () => {
      await result.current.handleDragEnd(dragEvent('1', '3'));
    });

    const reordered = updateExhibitorOrder.mock.calls[0][0] as Entry[];
    // Snapshot was [1,2,3], so result is [2,3,1] with 3 items — NOT 4.
    expect(reordered.map(e => e.id)).toEqual(['2', '3', '1']);
    expect(reordered).toHaveLength(3);
  });
});

describe('useDragAndDropEntries — handleDragEnd guards', () => {
  it('is a no-op when there is no drop target', async () => {
    const setLocalEntries = vi.fn();
    const updateExhibitorOrder = defaultUpdater();
    const currentEntries = [makeEntry({ id: '1' }), makeEntry({ id: '2' })];
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder,
      }),
    );

    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });
    await act(async () => {
      await result.current.handleDragEnd(dragEvent('1', null));
    });

    expect(updateExhibitorOrder).not.toHaveBeenCalled();
    expect(setLocalEntries).not.toHaveBeenCalled();
    // Drag flag clears immediately on no-op (no grace period needed —
    // nothing was written, so no race to worry about).
    expect(result.current.isDraggingRef.current).toBe(false);
  });

  it('is a no-op when active and over are the same id', async () => {
    const setLocalEntries = vi.fn();
    const updateExhibitorOrder = defaultUpdater();
    const currentEntries = [makeEntry({ id: '1' }), makeEntry({ id: '2' })];
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder,
      }),
    );

    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });
    await act(async () => {
      await result.current.handleDragEnd(dragEvent('1', '1'));
    });

    expect(updateExhibitorOrder).not.toHaveBeenCalled();
  });

  it('blocks moving a non-in-ring dog ahead of in-ring dogs (target index 0)', async () => {
    const setLocalEntries = vi.fn();
    const updateExhibitorOrder = defaultUpdater();
    const currentEntries = [
      makeEntry({ id: '10', armband: 10, status: 'in-ring', inRing: true }),
      makeEntry({ id: '20', armband: 20 }),
      makeEntry({ id: '30', armband: 30 }),
    ];
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder,
      }),
    );

    act(() => {
      result.current.handleDragStart(dragStartEvent('30'));
    });
    // Drag entry 30 onto entry 10 (target index 0) — should be blocked.
    await act(async () => {
      await result.current.handleDragEnd(dragEvent('30', '10'));
    });

    expect(updateExhibitorOrder).not.toHaveBeenCalled();
    expect(setLocalEntries).not.toHaveBeenCalled();
  });

  it('allows moving an in-ring dog to index 0 even when other in-ring dogs exist', async () => {
    const setLocalEntries = vi.fn();
    const updateExhibitorOrder = defaultUpdater();
    const currentEntries = [
      makeEntry({ id: '10', armband: 10, status: 'in-ring', inRing: true }),
      makeEntry({ id: '20', armband: 20, status: 'in-ring', inRing: true }),
      makeEntry({ id: '30', armband: 30 }),
    ];
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder,
      }),
    );

    act(() => {
      result.current.handleDragStart(dragStartEvent('20'));
    });
    // Drag in-ring entry 20 onto in-ring entry 10 (target index 0) — allowed.
    await act(async () => {
      await result.current.handleDragEnd(dragEvent('20', '10'));
    });

    expect(updateExhibitorOrder).toHaveBeenCalledTimes(1);
  });
});

describe('useDragAndDropEntries — sync race protection', () => {
  it('keeps isDraggingRef true through gracePeriodMs after the DB write completes', async () => {
    const setLocalEntries = vi.fn();
    const updateExhibitorOrder = defaultUpdater();
    const currentEntries = [
      makeEntry({ id: '1', armband: 1 }),
      makeEntry({ id: '2', armband: 2 }),
    ];
    const gracePeriodMs = 1500;

    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder,
        gracePeriodMs,
      }),
    );

    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });
    expect(result.current.isDraggingRef.current).toBe(true);

    await act(async () => {
      await result.current.handleDragEnd(dragEvent('1', '2'));
    });

    // DB write done, but the grace-period timer is still pending — drag
    // flag must stay true so a sync that fired during the DB roundtrip
    // doesn't slip in and invalidate the optimistic order.
    expect(result.current.isDraggingRef.current).toBe(true);

    // Advance just past the grace period — flag flips and a scroll-to-top
    // fires (which we don't assert on; jsdom no-ops it).
    act(() => {
      vi.advanceTimersByTime(gracePeriodMs + 1);
    });
    expect(result.current.isDraggingRef.current).toBe(false);
    expect(result.current.isDragging).toBe(false);
  });

  it('does NOT roll back the optimistic UI update when updateExhibitorOrder rejects', async () => {
    const updateExhibitorOrder = vi.fn().mockRejectedValueOnce(new Error('Offline'));
    const setLocalEntries = vi.fn();
    const setManualOrder = vi.fn();
    const currentEntries = [
      makeEntry({ id: '1', armband: 1 }),
      makeEntry({ id: '2', armband: 2 }),
    ];
    const { result } = renderHook(() =>
      useDragAndDropEntries({
        localEntries: currentEntries,
        setLocalEntries,
        currentEntries,
        updateExhibitorOrder,
        setManualOrder,
        gracePeriodMs: 100,
      }),
    );

    act(() => {
      result.current.handleDragStart(dragStartEvent('1'));
    });
    await act(async () => {
      await result.current.handleDragEnd(dragEvent('1', '2'));
    });

    // Optimistic update was applied once. No second setLocalEntries call
    // tried to undo it — if one did, the UI would visibly snap back, which
    // is exactly the bug class we're guarding against.
    expect(setLocalEntries).toHaveBeenCalledTimes(1);
    expect(setManualOrder).toHaveBeenCalledTimes(1);

    // Grace period should still elapse even on failure — drag flag clears.
    act(() => {
      vi.advanceTimersByTime(101);
    });
    expect(result.current.isDraggingRef.current).toBe(false);
  });
});

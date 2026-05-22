/**
 * Tests for the move-up undo banner auto-dismiss behavior in useShowMapActionExecutor.
 *
 * Covers:
 *  - The banner appears after a successful move-up
 *  - The banner auto-clears 8000ms later
 *  - A second move-up resets the timer (the first move-up's pending timer must not
 *    clear the fresh banner)
 *  - Manual undo cancels the pending timer
 *  - Unmounting the hook cancels the pending timer
 */
import React from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import {
  MOVE_UP_UNDO_BANNER_TIMEOUT_MS,
  useShowMapActionExecutor,
} from '../useShowMapActionExecutor';
import type { ShowMapAction } from '../showMapActions';

const { moveUpShowMapEntryMock, undoShowMapMoveUpMock } = vi.hoisted(() => ({
  moveUpShowMapEntryMock: vi.fn(),
  undoShowMapMoveUpMock: vi.fn(),
}));

vi.mock('../showMapActionMutations', async () => {
  const actual =
    await vi.importActual<typeof import('../showMapActionMutations')>(
      '../showMapActionMutations'
    );
  return {
    ...actual,
    moveUpShowMapEntry: moveUpShowMapEntryMock,
    undoShowMapMoveUp: undoShowMapMoveUpMock,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (s: unknown) => unknown) =>
    selector({
      getOrCreateThread: vi.fn(),
      sendMessage: vi.fn(),
    }),
}));

function makeMoveUpAction(nodeId: string, classId: string): ShowMapAction {
  return {
    id: 'move-up-entry',
    nodeId,
    label: `Move up ${nodeId}`,
    why: 'Move up',
    priority: 32,
    icon: ArrowUpCircle,
    classId,
  };
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

async function triggerMoveUp(
  result: { current: ReturnType<typeof useShowMapActionExecutor> },
  action: ShowMapAction,
  targetClassId: string
) {
  await act(async () => {
    result.current.executeAction(action, { kind: 'dialog', dialog: 'move-up-entry' });
  });
  await act(async () => {
    result.current.confirmMoveUp({ targetClassId });
  });
}

describe('useShowMapActionExecutor — move-up undo banner auto-dismiss', () => {
  beforeEach(() => {
    moveUpShowMapEntryMock.mockReset();
    undoShowMapMoveUpMock.mockReset();
    // Only fake setTimeout/clearTimeout (the auto-dismiss primitives) so that
    // React Query, sonner, and @testing-library/react's waitFor — which rely on
    // setInterval / queueMicrotask — keep working with real scheduling.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-clears the banner after the timeout', async () => {
    moveUpShowMapEntryMock.mockResolvedValue({
      originalEntryId: 'entry-1',
      newEntryId: 'entry-2',
      previousEntryStatus: 'pre-entered',
      previousCheckInStatus: null,
      previousSpecialRequests: null,
      targetClassName: 'Novice A',
    });

    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });

    await triggerMoveUp(result, makeMoveUpAction('entry:entry-1', 'class-1'), 'class-2');

    expect(result.current.lastMoveUp).not.toBeNull();
    expect(result.current.lastMoveUp?.targetClassName).toBe('Novice A');

    await act(async () => {
      vi.advanceTimersByTime(MOVE_UP_UNDO_BANNER_TIMEOUT_MS);
    });

    expect(result.current.lastMoveUp).toBeNull();
  });

  it('keeps a fresh banner visible when a prior timeout would have fired', async () => {
    moveUpShowMapEntryMock
      .mockResolvedValueOnce({
        originalEntryId: 'entry-1',
        newEntryId: 'entry-2',
        previousEntryStatus: 'pre-entered',
        previousCheckInStatus: null,
        previousSpecialRequests: null,
        targetClassName: 'Novice A',
      })
      .mockResolvedValueOnce({
        originalEntryId: 'entry-3',
        newEntryId: 'entry-4',
        previousEntryStatus: 'pre-entered',
        previousCheckInStatus: null,
        previousSpecialRequests: null,
        targetClassName: 'Advanced B',
      });

    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });

    await triggerMoveUp(result, makeMoveUpAction('entry:entry-1', 'class-1'), 'class-2');

    expect(result.current.lastMoveUp?.targetClassName).toBe('Novice A');

    // Advance halfway through the first banner's timeout, then trigger a second move-up.
    await act(async () => {
      vi.advanceTimersByTime(MOVE_UP_UNDO_BANNER_TIMEOUT_MS / 2);
    });

    await triggerMoveUp(result, makeMoveUpAction('entry:entry-3', 'class-1'), 'class-3');

    expect(result.current.lastMoveUp?.targetClassName).toBe('Advanced B');

    // Now total elapsed since move-up #1 will exceed the original deadline. If the
    // first timer were still pending, it would fire here and wipe the fresh banner.
    await act(async () => {
      vi.advanceTimersByTime(MOVE_UP_UNDO_BANNER_TIMEOUT_MS / 2 + 1000);
    });

    expect(result.current.lastMoveUp?.targetClassName).toBe('Advanced B');

    // The fresh banner's own timer should still fire after a full timeout from move-up #2.
    await act(async () => {
      vi.advanceTimersByTime(MOVE_UP_UNDO_BANNER_TIMEOUT_MS);
    });

    expect(result.current.lastMoveUp).toBeNull();
  });

  it('cancels the pending timer when the user manually undoes the move-up', async () => {
    moveUpShowMapEntryMock.mockResolvedValue({
      originalEntryId: 'entry-1',
      newEntryId: 'entry-2',
      previousEntryStatus: 'pre-entered',
      previousCheckInStatus: null,
      previousSpecialRequests: null,
      targetClassName: 'Novice A',
    });
    undoShowMapMoveUpMock.mockResolvedValue(undefined);

    // Capture the handle our hook receives from setTimeout so we can verify it
    // is the one passed to clearTimeout during undo (other timers from React
    // Query etc. share the same global setTimeout / clearTimeout).
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });

    await triggerMoveUp(result, makeMoveUpAction('entry:entry-1', 'class-1'), 'class-2');
    expect(result.current.lastMoveUp).not.toBeNull();

    const bannerSetTimeoutIndex = setTimeoutSpy.mock.calls.findIndex(
      ([, delay]) => delay === MOVE_UP_UNDO_BANNER_TIMEOUT_MS
    );
    expect(bannerSetTimeoutIndex).toBeGreaterThanOrEqual(0);
    const bannerTimerHandle = setTimeoutSpy.mock.results[bannerSetTimeoutIndex]?.value;

    clearTimeoutSpy.mockClear();

    await act(async () => {
      result.current.undoLastMoveUp();
    });

    expect(result.current.lastMoveUp).toBeNull();
    expect(undoShowMapMoveUpMock).toHaveBeenCalledTimes(1);
    // The exact handle scheduled by the move-up must have been cancelled by undo,
    // not just any clearTimeout call (React Query may issue its own).
    expect(clearTimeoutSpy.mock.calls.some(([handle]) => handle === bannerTimerHandle)).toBe(
      true
    );
  });

  it('cancels the auto-dismiss timer even when the undo network call fails', async () => {
    moveUpShowMapEntryMock.mockResolvedValue({
      originalEntryId: 'entry-1',
      newEntryId: 'entry-2',
      previousEntryStatus: 'pre-entered',
      previousCheckInStatus: null,
      previousSpecialRequests: null,
      targetClassName: 'Novice A',
    });
    // The undo call fails — banner should remain visible so the user can retry,
    // but the pending auto-dismiss timer must still be cancelled (the banner
    // should not vanish on its own while the user is mid-recovery).
    undoShowMapMoveUpMock.mockRejectedValue(new Error('network down'));

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { result } = renderHook(() => useShowMapActionExecutor({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });

    await triggerMoveUp(result, makeMoveUpAction('entry:entry-1', 'class-1'), 'class-2');

    const bannerSetTimeoutIndex = setTimeoutSpy.mock.calls.findIndex(
      ([, delay]) => delay === MOVE_UP_UNDO_BANNER_TIMEOUT_MS
    );
    const bannerTimerHandle = setTimeoutSpy.mock.results[bannerSetTimeoutIndex]?.value;

    clearTimeoutSpy.mockClear();

    await act(async () => {
      result.current.undoLastMoveUp();
    });

    // Banner stays so the user can retry; timer was already cancelled in onMutate.
    expect(result.current.lastMoveUp).not.toBeNull();
    expect(clearTimeoutSpy.mock.calls.some(([handle]) => handle === bannerTimerHandle)).toBe(
      true
    );

    // Confirm the cancelled timer can no longer auto-dismiss the banner.
    await act(async () => {
      vi.advanceTimersByTime(MOVE_UP_UNDO_BANNER_TIMEOUT_MS * 2);
    });
    expect(result.current.lastMoveUp).not.toBeNull();
  });

  it('cancels the pending timer when the hook unmounts', async () => {
    moveUpShowMapEntryMock.mockResolvedValue({
      originalEntryId: 'entry-1',
      newEntryId: 'entry-2',
      previousEntryStatus: 'pre-entered',
      previousCheckInStatus: null,
      previousSpecialRequests: null,
      targetClassName: 'Novice A',
    });

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { result, unmount } = renderHook(
      () => useShowMapActionExecutor({ showId: 'show-1' }),
      { wrapper: createWrapper() }
    );

    await triggerMoveUp(result, makeMoveUpAction('entry:entry-1', 'class-1'), 'class-2');

    const bannerSetTimeoutIndex = setTimeoutSpy.mock.calls.findIndex(
      ([, delay]) => delay === MOVE_UP_UNDO_BANNER_TIMEOUT_MS
    );
    expect(bannerSetTimeoutIndex).toBeGreaterThanOrEqual(0);
    const bannerTimerHandle = setTimeoutSpy.mock.results[bannerSetTimeoutIndex]?.value;

    clearTimeoutSpy.mockClear();

    unmount();

    expect(clearTimeoutSpy.mock.calls.some(([handle]) => handle === bannerTimerHandle)).toBe(
      true
    );
  });
});

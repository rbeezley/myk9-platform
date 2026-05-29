/**
 * Tests for useAtShowEntryListHandlers — focused on in-ring exclusivity, the
 * ring-management invariant that only one dog may be marked in-ring at a time.
 *
 * Assertion-first (CLAUDE.md): the regression guarded here is a value going to
 * the wrong place — other in-ring dogs must be CLEARED (handleToggleInRing →
 * 'no-status'), not re-marked in-ring. The prior code called
 * handleMarkInRing(e.id, ...) on the others, which left multiple dogs in-ring.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Entry, EntryListActions } from '@myk9/ringside';
import type { EntryStatus } from '@myk9/core';

vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { useAtShowEntryListHandlers } from './useAtShowEntryListHandlers';

function makeEntry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    armband: 1,
    callName: 'Rex',
    breed: 'Border Collie',
    handler: 'Pat',
    isScored: false,
    status: 'no-status' as EntryStatus,
    classId: 'class-1',
    className: 'Excellent A',
    ...overrides,
  };
}

function makeActions(): EntryListActions {
  return {
    handleStatusChange: vi.fn(() => Promise.resolve()),
    handleResetScore: vi.fn(() => Promise.resolve()),
    handleToggleInRing: vi.fn(() => Promise.resolve()),
    handleMarkInRing: vi.fn(() => Promise.resolve()),
    handleMarkCompleted: vi.fn(() => Promise.resolve()),
    handleBatchStatusUpdate: vi.fn(() => Promise.resolve()),
    isSyncing: false,
    hasError: false,
  };
}

function renderHandlers(localEntries: Entry[], actions: EntryListActions) {
  return renderHook(() =>
    useAtShowEntryListHandlers({
      actions,
      replication: { updateClassStatus: vi.fn(() => Promise.resolve()) } as never,
      classId: 'class-1',
      localEntries,
      hasPermission: () => true,
      navigate: vi.fn(),
      buildScoreSheetRoute: () => '/route',
      refresh: vi.fn(() => Promise.resolve()),
      setActiveStatusPopup: vi.fn(),
      setActiveResetMenu: vi.fn(),
      setResetMenuPosition: vi.fn(),
      setResetConfirmDialog: vi.fn(),
      setIsDragMode: vi.fn(),
      setIsManualRefreshing: vi.fn(),
      setActiveTab: vi.fn(),
      setLocalEntries: vi.fn(),
    })
  );
}

describe('useAtShowEntryListHandlers — setDogInRingStatus exclusivity', () => {
  let actions: EntryListActions;

  beforeEach(() => {
    actions = makeActions();
  });
  afterEach(() => vi.clearAllMocks());

  it('clears every other in-ring dog (→ no-status) before marking the target', async () => {
    const entries = [
      makeEntry({ id: 'other-by-flag', inRing: true }),
      makeEntry({ id: 'other-by-status', status: 'in-ring' as EntryStatus }),
      makeEntry({ id: 'idle', status: 'no-status' as EntryStatus }),
      makeEntry({ id: 'target' }),
    ];
    const { result } = renderHandlers(entries, actions);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.setDogInRingStatus('target', true);
    });

    expect(ok).toBe(true);
    // Both occupants cleared via toggle (currentInRing=true → writes no-status).
    expect(actions.handleToggleInRing).toHaveBeenCalledWith('other-by-flag', true);
    expect(actions.handleToggleInRing).toHaveBeenCalledWith('other-by-status', true);
    expect(actions.handleToggleInRing).toHaveBeenCalledTimes(2);
    // The idle dog is untouched.
    expect(actions.handleToggleInRing).not.toHaveBeenCalledWith('idle', expect.anything());
    // The target is marked in-ring exactly once.
    expect(actions.handleMarkInRing).toHaveBeenCalledTimes(1);
    expect(actions.handleMarkInRing).toHaveBeenCalledWith('target');
  });

  it('does not clear or re-mark the target dog even if it is already in-ring', async () => {
    const entries = [makeEntry({ id: 'target', status: 'in-ring' as EntryStatus })];
    const { result } = renderHandlers(entries, actions);

    await act(async () => {
      await result.current.setDogInRingStatus('target', true);
    });

    expect(actions.handleToggleInRing).not.toHaveBeenCalled();
    expect(actions.handleMarkInRing).toHaveBeenCalledWith('target');
    expect(actions.handleMarkInRing).toHaveBeenCalledTimes(1);
  });

  it('removing a dog from the ring (inRing=false) toggles only that dog', async () => {
    const entries = [makeEntry({ id: 'target', status: 'in-ring' as EntryStatus })];
    const { result } = renderHandlers(entries, actions);

    await act(async () => {
      await result.current.setDogInRingStatus('target', false);
    });

    expect(actions.handleToggleInRing).toHaveBeenCalledWith('target', true);
    expect(actions.handleToggleInRing).toHaveBeenCalledTimes(1);
    expect(actions.handleMarkInRing).not.toHaveBeenCalled();
  });

  it('returns false when a clear mutation throws', async () => {
    (actions.handleToggleInRing as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('offline')
    );
    const entries = [makeEntry({ id: 'other', inRing: true }), makeEntry({ id: 'target' })];
    const { result } = renderHandlers(entries, actions);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.setDogInRingStatus('target', true);
    });

    expect(ok).toBe(false);
    // A failed clear must abort before the target is marked in-ring —
    // otherwise we'd leave two dogs in-ring, the bug this handler guards.
    expect(actions.handleMarkInRing).not.toHaveBeenCalled();
  });

  it('serializes overlapping calls so two dogs cannot be marked in-ring at once', async () => {
    // Hold the FIRST call's mark open until released; the second call must not
    // begin its own mark until the first fully settles (mutex serialization).
    let releaseFirstMark!: () => void;
    const firstMark = new Promise<void>((resolve) => {
      releaseFirstMark = resolve;
    });
    (actions.handleMarkInRing as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => firstMark)
      .mockImplementation(() => Promise.resolve());

    const entries = [
      makeEntry({ id: 'A', status: 'in-ring' as EntryStatus }),
      makeEntry({ id: 'B' }),
      makeEntry({ id: 'C' }),
    ];
    const { result } = renderHandlers(entries, actions);

    let p1!: Promise<boolean>;
    let p2!: Promise<boolean>;
    act(() => {
      p1 = result.current.setDogInRingStatus('B', true);
      p2 = result.current.setDogInRingStatus('C', true);
    });

    // Call 1 has reached (and is stuck on) marking B; call 2 is still queued
    // behind the mutex, so C must not have been marked yet.
    await waitFor(() => expect(actions.handleMarkInRing).toHaveBeenCalledWith('B'));
    expect(actions.handleMarkInRing).toHaveBeenCalledTimes(1);
    expect(actions.handleMarkInRing).not.toHaveBeenCalledWith('C');

    // Release call 1; call 2 now proceeds and marks C.
    await act(async () => {
      releaseFirstMark();
      await Promise.all([p1, p2]);
    });
    expect(actions.handleMarkInRing).toHaveBeenCalledWith('C');
  });
});

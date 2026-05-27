/**
 * Tests for useResetScore — EntryList reset-score state machine.
 *
 * Scope (PR E1.5 backfill before EntryList page move into @myk9/ringside):
 * - Menu open/close + position calculation from click event
 * - Reset confirm dialog show/cancel
 * - confirmResetScore optimistic update — clears scoring fields, switches tab,
 *   closes dialog, then awaits background sync
 * - Silent-failure contract: background `handleResetScoreHook` rejection does
 *   NOT throw, does NOT revert optimistic update (offline-first)
 *
 * Regression class: PR #320 had a silent data-loss bug where undo paths
 * filtered `null` out of optional fields. The optimistic update here clears
 * five scoring fields plus `placement: undefined`; if anyone later replaces
 * the inline object with a merge helper, these assertions catch dropped
 * fields.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useResetScore } from './useResetScore';
import type { Entry } from '../../../stores/entryStore';
import { logger } from '@/utils/logger';

// Silence expected error logs; the silent-failure test asserts on this spy.
vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const baseEntry: Entry = {
  id: 42,
  armband: 101,
  callName: 'Rex',
  breed: 'GSD',
  handler: 'Alice',
  isScored: true,
  status: 'completed',
  resultText: 'Q',
  searchTime: '1:23.45',
  faultCount: 2,
  placement: 1,
  inRing: false,
  checkinStatus: 'checked-in',
  checkedIn: true,
  classId: 7,
  className: 'Novice A',
};

function setup(overrides: Partial<Parameters<typeof useResetScore>[0]> = {}) {
  const setLocalEntries = vi.fn();
  const setActiveTab = vi.fn();
  const handleResetScoreHook = vi.fn().mockResolvedValue(undefined);

  const hook = renderHook(() =>
    useResetScore({
      setLocalEntries,
      setActiveTab,
      handleResetScoreHook,
      ...overrides,
    }),
  );

  return { hook, setLocalEntries, setActiveTab, handleResetScoreHook };
}

/**
 * The hook reads `e.currentTarget.getBoundingClientRect()`. JSDOM stubs this
 * to a zero rect, so we fabricate a MouseEvent-shaped object with a real rect.
 */
function fakeClickEvent(rect: { top: number; left: number; bottom: number }) {
  const button = {
    getBoundingClientRect: () => ({ ...rect, right: 0, width: 0, height: 0, x: 0, y: 0 }),
  } as unknown as HTMLElement;
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: button,
  } as unknown as React.MouseEvent;
}

describe('useResetScore — menu state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with no active menu and no confirm dialog', () => {
    const { hook } = setup();
    expect(hook.result.current.activeResetMenu).toBeNull();
    expect(hook.result.current.resetMenuPosition).toBeNull();
    expect(hook.result.current.resetConfirmDialog).toEqual({ show: false, entry: null });
  });

  it('handleResetMenuClick opens the menu, positions it below the button, and stops propagation', () => {
    const { hook } = setup();
    const event = fakeClickEvent({ top: 100, left: 50, bottom: 120 });

    act(() => {
      hook.result.current.handleResetMenuClick(event, 42);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(hook.result.current.activeResetMenu).toBe(42);
    // 4px gap below the button bottom — preserve this; it's a visual contract.
    expect(hook.result.current.resetMenuPosition).toEqual({ top: 124, left: 50 });
  });

  it('closeResetMenu clears menu id and position', () => {
    const { hook } = setup();

    act(() => {
      hook.result.current.handleResetMenuClick(fakeClickEvent({ top: 0, left: 0, bottom: 0 }), 7);
    });
    expect(hook.result.current.activeResetMenu).toBe(7);

    act(() => {
      hook.result.current.closeResetMenu();
    });
    expect(hook.result.current.activeResetMenu).toBeNull();
    expect(hook.result.current.resetMenuPosition).toBeNull();
  });
});

describe('useResetScore — confirm dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleResetScore opens the confirm dialog with the entry and clears any open menu', () => {
    const { hook } = setup();

    // Open menu first
    act(() => {
      hook.result.current.handleResetMenuClick(fakeClickEvent({ top: 0, left: 0, bottom: 0 }), 42);
    });
    expect(hook.result.current.activeResetMenu).toBe(42);

    // Then ask to reset — menu closes, dialog opens
    act(() => {
      hook.result.current.handleResetScore(baseEntry);
    });

    expect(hook.result.current.activeResetMenu).toBeNull();
    expect(hook.result.current.resetMenuPosition).toBeNull();
    expect(hook.result.current.resetConfirmDialog).toEqual({ show: true, entry: baseEntry });
  });

  it('cancelResetScore hides the dialog and clears the entry', () => {
    const { hook } = setup();

    act(() => {
      hook.result.current.handleResetScore(baseEntry);
    });
    expect(hook.result.current.resetConfirmDialog.show).toBe(true);

    act(() => {
      hook.result.current.cancelResetScore();
    });
    expect(hook.result.current.resetConfirmDialog).toEqual({ show: false, entry: null });
  });

  it('confirmResetScore is a no-op when no entry is staged', async () => {
    const { hook, setLocalEntries, setActiveTab, handleResetScoreHook } = setup();

    await act(async () => {
      await hook.result.current.confirmResetScore();
    });

    expect(setLocalEntries).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(handleResetScoreHook).not.toHaveBeenCalled();
  });
});

describe('useResetScore — confirmResetScore happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears scoring fields on the targeted entry only, switches tab, closes dialog, then awaits sync', async () => {
    const { hook, setLocalEntries, setActiveTab, handleResetScoreHook } = setup();

    act(() => {
      hook.result.current.handleResetScore(baseEntry);
    });

    await act(async () => {
      await hook.result.current.confirmResetScore();
    });

    // setLocalEntries was called with a functional updater — exercise it
    // against a representative prior state to assert the exact reset shape.
    expect(setLocalEntries).toHaveBeenCalledTimes(1);
    const updater = setLocalEntries.mock.calls[0][0] as (prev: Entry[]) => Entry[];

    const otherEntry: Entry = { ...baseEntry, id: 99, armband: 999, isScored: true, status: 'completed' };
    const next = updater([baseEntry, otherEntry]);

    // Non-target entry untouched
    expect(next[1]).toBe(otherEntry);

    // Target entry: every scoring/check-in field zeroed deterministically.
    // Keep this assertion field-by-field — a partial merge could silently
    // leave one of these stale, which is the bug class we're guarding.
    expect(next[0]).toEqual({
      ...baseEntry,
      isScored: false,
      status: 'no-status',
      checkinStatus: 'no-status',
      checkedIn: false,
      resultText: '',
      searchTime: '',
      faultCount: 0,
      placement: undefined,
      inRing: false,
    });

    expect(setActiveTab).toHaveBeenCalledWith('pending');
    expect(hook.result.current.resetConfirmDialog).toEqual({ show: false, entry: null });
    expect(handleResetScoreHook).toHaveBeenCalledWith(42);
  });

  it('background sync failure is swallowed silently (offline-first) and the optimistic update is NOT reverted', async () => {
    const handleResetScoreHook = vi.fn().mockRejectedValue(new Error('Network down'));
    const { hook, setLocalEntries } = setup({ handleResetScoreHook });

    act(() => {
      hook.result.current.handleResetScore(baseEntry);
    });

    // Should not throw even though the background call rejects.
    await act(async () => {
      await expect(hook.result.current.confirmResetScore()).resolves.toBeUndefined();
    });

    // Optimistic update ran exactly once — no second setLocalEntries call
    // attempting to roll back. (Reverting on offline-first hooks is the bug.)
    expect(setLocalEntries).toHaveBeenCalledTimes(1);
    expect(handleResetScoreHook).toHaveBeenCalledWith(42);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to reset score in background:',
      expect.any(Error),
    );
  });
});

/**
 * MYK9-1847: while a class is cancelled the entry list offers no scoring, check-in or in-ring
 * change; setting the class back restores them.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Entry, EntryListActions, EntryListHandlers } from '@myk9/ringside';
import type { EntryStatus } from '@myk9/core';

const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { info: toastInfo, error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ error: null })) },
}));

import { useAtShowEntryListHandlers } from './useAtShowEntryListHandlers';
import { CANCELLED_CLASS_MESSAGE } from './cancelledClassGuard';

const entry: Entry = {
  id: 'entry-1',
  armband: 1,
  callName: 'Rex',
  breed: 'Border Collie',
  handler: 'Pat',
  isScored: false,
  status: 'no-status' as EntryStatus,
  classId: 'class-1',
  className: 'Container Novice',
};

const entryB: Entry = { ...entry, id: 'entry-2', armband: 2, classId: 'class-2' };

function setup(classCancelled: boolean, cancelledIds?: string[]) {
  const actions: EntryListActions = {
    handleStatusChange: vi.fn(() => Promise.resolve()),
    handleResetScore: vi.fn(() => Promise.resolve()),
    handleToggleInRing: vi.fn(() => Promise.resolve()),
    handleMarkInRing: vi.fn(() => Promise.resolve()),
    handleMarkCompleted: vi.fn(() => Promise.resolve()),
    handleBatchStatusUpdate: vi.fn(() => Promise.resolve()),
    isSyncing: false,
    hasError: false,
  };
  const navigate = vi.fn();
  const setActiveStatusPopup = vi.fn();
  const setResetConfirmDialog = vi.fn();
  const { result, rerender } = renderHook(
    ({ cancelled }) =>
      useAtShowEntryListHandlers({
        actions,
        replication: { updateClassStatus: vi.fn(() => Promise.resolve()) } as never,
        classId: 'class-1',
        localEntries: [entry, entryB],
        hasPermission: () => true,
        navigate,
        buildScoreSheetRoute: () => '/route',
        isClassCancelled: (id: string) => (cancelledIds ? cancelledIds.includes(id) : cancelled),
        refresh: vi.fn(() => Promise.resolve()),
        manualRefresh: vi.fn(() => Promise.resolve()),
        setActiveStatusPopup,
        setActiveResetMenu: vi.fn(),
        setResetMenuPosition: vi.fn(),
        setResetConfirmDialog,
        setIsDragMode: vi.fn(),
        setIsManualRefreshing: vi.fn(),
        setActiveTab: vi.fn(),
        setLocalEntries: vi.fn() as never,
      }),
    { initialProps: { cancelled: classCancelled } }
  );
  return { result, rerender, actions, navigate, setActiveStatusPopup, setResetConfirmDialog };
}

const clickEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as never;

describe('useAtShowEntryListHandlers while the class is cancelled', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not open the scoresheet and says why', () => {
    const { result, navigate } = setup(true);
    act(() => result.current.handleEntryClick(entry));
    expect(navigate).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith(CANCELLED_CLASS_MESSAGE);
  });

  it('does not open the check-in popup', () => {
    const { result, setActiveStatusPopup } = setup(true);
    act(() => (result.current as EntryListHandlers).handleStatusClick(clickEvent, 'entry-1'));
    expect(setActiveStatusPopup).not.toHaveBeenCalledWith('entry-1');
    expect(toastInfo).toHaveBeenCalledWith(CANCELLED_CLASS_MESSAGE);
  });

  it('writes no check-in or in-ring status', async () => {
    const { result, actions } = setup(true);
    await act(async () => {
      await result.current.handleStatusChange('entry-1', 'checked-in' as never);
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.setDogInRingStatus('entry-1', true);
    });
    expect(ok).toBe(false);
    expect(actions.handleStatusChange).not.toHaveBeenCalled();
    expect(actions.handleMarkInRing).not.toHaveBeenCalled();
  });

  it('restores scoring and check-in once the class is no longer cancelled', async () => {
    const { result, rerender, actions, navigate } = setup(true);
    rerender({ cancelled: false });
    act(() => result.current.handleEntryClick(entry));
    expect(navigate).toHaveBeenCalledWith('/route');
    await act(async () => {
      await result.current.handleStatusChange('entry-1', 'checked-in' as never);
    });
    expect(actions.handleStatusChange).toHaveBeenCalledWith('entry-1', 'checked-in');
  });

  it('does not open the reset confirmation for a cancelled class', async () => {
    const { result, actions, setResetConfirmDialog } = setup(true);
    act(() => result.current.handleResetScore(entry));
    await act(async () => {
      await result.current.confirmResetScore();
    });
    expect(setResetConfirmDialog).not.toHaveBeenCalledWith({ show: true, entry });
    expect(actions.handleResetScore).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith(CANCELLED_CLASS_MESSAGE);
  });

  it('still resets a score once the class is no longer cancelled', async () => {
    const { result, actions } = setup(false);
    act(() => result.current.handleResetScore(entry));
    await act(async () => {
      await result.current.confirmResetScore();
    });
    expect(actions.handleResetScore).toHaveBeenCalledWith('entry-1');
  });

  it('decides per entry: only the cancelled section is blocked', async () => {
    const { result, actions, navigate } = setup(false, ['class-2']);
    act(() => result.current.handleEntryClick(entry));
    expect(navigate).toHaveBeenCalledWith('/route');
    navigate.mockClear();
    act(() => result.current.handleEntryClick(entryB));
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleStatusChange('entry-2', 'checked-in' as never);
    });
    expect(actions.handleStatusChange).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.handleStatusChange('entry-1', 'checked-in' as never);
    });
    expect(actions.handleStatusChange).toHaveBeenCalledWith('entry-1', 'checked-in');
  });
});

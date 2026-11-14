/**
 * MYK9-1807: an exhibitor's refused check-in change. The predicate turns the impossible ones away
 * before anything is sent or shown; a refusal that still comes back from the server rolls the card
 * back and says why in plain words.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Entry, EntryListActions } from '@myk9/ringside';
import type { EntryStatus } from '@myk9/core';

const { toastInfo, toastError } = vi.hoisted(() => ({ toastInfo: vi.fn(), toastError: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { info: toastInfo, error: toastError, success: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));

import { useAtShowEntryListHandlers } from './useAtShowEntryListHandlers';
import { NOT_RUNNING_STAFF_MESSAGE, SELF_CHECKIN_REFUSED_MESSAGE } from './entryStatusAccess';

const entry: Entry = {
  id: 'e1',
  armband: 1,
  callName: 'Rex',
  breed: 'Border Collie',
  handler: 'Pat',
  isScored: false,
  status: 'no-status' as EntryStatus,
  classId: 'class-1',
  className: 'Excellent A',
};

function setup(
  options: {
    statusRefusalFor?: (entry: Entry, status: string) => string | null;
    handleStatusChange?: EntryListActions['handleStatusChange'];
  } = {}
) {
  const actions: EntryListActions = {
    handleStatusChange: options.handleStatusChange ?? vi.fn(() => Promise.resolve()),
    handleResetScore: vi.fn(() => Promise.resolve()),
    handleMarkInRing: vi.fn(() => Promise.resolve()),
    handleMarkCompleted: vi.fn(() => Promise.resolve()),
    isSyncing: false,
    hasError: false,
  };
  const setLocalEntries = vi.fn();
  const { result } = renderHook(() =>
    useAtShowEntryListHandlers({
      actions,
      replication: { updateClassStatus: vi.fn(() => Promise.resolve()) } as never,
      classId: 'class-1',
      localEntries: [entry],
      hasPermission: () => true,
      navigate: vi.fn(),
      buildScoreSheetRoute: () => '/route',
      ...(options.statusRefusalFor ? { statusRefusalFor: options.statusRefusalFor } : {}),
      refresh: vi.fn(() => Promise.resolve()),
      manualRefresh: vi.fn(() => Promise.resolve()),
      setActiveStatusPopup: vi.fn(),
      setActiveResetMenu: vi.fn(),
      setResetMenuPosition: vi.fn(),
      setResetConfirmDialog: vi.fn(),
      setIsDragMode: vi.fn(),
      setIsManualRefreshing: vi.fn(),
      setActiveTab: vi.fn(),
      setLocalEntries: setLocalEntries as never,
    })
  );
  return { result, actions, setLocalEntries };
}

describe('handleStatusChange with a viewer-specific rule', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends nothing and says why when the viewer may not set the status', async () => {
    const statusRefusalFor = vi.fn(() => NOT_RUNNING_STAFF_MESSAGE);
    const { result, actions, setLocalEntries } = setup({ statusRefusalFor });

    await act(async () => {
      await result.current.handleStatusChange('e1', 'in-ring');
    });

    expect(statusRefusalFor).toHaveBeenCalledWith(entry, 'in-ring');
    expect(toastError).toHaveBeenCalledWith(NOT_RUNNING_STAFF_MESSAGE);
    expect(actions.handleMarkInRing).not.toHaveBeenCalled();
    expect(actions.handleStatusChange).not.toHaveBeenCalled();
    // No optimistic flip, so nothing to snap back.
    expect(setLocalEntries).not.toHaveBeenCalled();
  });

  it('writes as before when the viewer may set the status (staff path unchanged)', async () => {
    const { result, actions } = setup({ statusRefusalFor: () => null });

    await act(async () => {
      await result.current.handleStatusChange('e1', 'at-gate');
    });

    expect(actions.handleStatusChange).toHaveBeenCalledWith('e1', 'at-gate');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('writes as before when no rule is supplied', async () => {
    const { result, actions } = setup();

    await act(async () => {
      await result.current.handleStatusChange('e1', 'in-ring');
    });

    expect(actions.handleMarkInRing).toHaveBeenCalledWith('e1');
  });

  it('rolls the card back and says why when the server refuses anyway', async () => {
    const { result, setLocalEntries } = setup({
      statusRefusalFor: () => null,
      handleStatusChange: vi.fn(() =>
        Promise.reject(
          new Error('Not authorized: caller does not own entry e1 or self check-in is disabled')
        )
      ),
    });

    await act(async () => {
      await result.current.handleStatusChange('e1', 'checked-in');
    });

    expect(toastError).toHaveBeenCalledWith(SELF_CHECKIN_REFUSED_MESSAGE);
    // Optimistic flip, then the rollback to the entry as it was.
    expect(setLocalEntries).toHaveBeenCalledTimes(2);
    const rollback = setLocalEntries.mock.calls[1]?.[0] as (prev: Entry[]) => Entry[];
    expect(rollback([{ ...entry, status: 'checked-in' as EntryStatus }])).toEqual([entry]);
  });

  it('does not word a network failure as a refusal', async () => {
    const { result } = setup({
      handleStatusChange: vi.fn(() => Promise.reject(new Error('Failed to fetch'))),
    });

    await act(async () => {
      await result.current.handleStatusChange('e1', 'checked-in');
    });

    expect(toastError).not.toHaveBeenCalled();
  });
});

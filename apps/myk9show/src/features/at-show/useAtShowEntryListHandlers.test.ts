/**
 * Tests for useAtShowEntryListHandlers — entry taps, the cancelled-class and
 * max-time gates, placement recompute and the optimistic check-in path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Entry, EntryListActions } from '@myk9/ringside';
import type { EntryStatus } from '@myk9/core';

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(() => Promise.resolve({ error: null })),
}));

const { toastInfo, toastError, toastSuccess } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { info: toastInfo, error: toastError, success: toastSuccess, warning: vi.fn() },
}));
vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: supabaseMocks,
}));

import { StaleCheckInError } from '@/services/show-day/checkInStatus';
import {
  useAtShowEntryListHandlers,
  type UseAtShowEntryListHandlersDeps,
} from './useAtShowEntryListHandlers';

type EntryListActionsDep = UseAtShowEntryListHandlersDeps['actions'];

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
    handleMarkInRing: vi.fn(() => Promise.resolve()),
    handleMarkCompleted: vi.fn(() => Promise.resolve()),
    isSyncing: false,
    hasError: false,
  };
}

function renderHandlers(
  localEntries: Entry[],
  actions: EntryListActionsDep,
  setLocalEntries: (updater: (prev: Entry[]) => Entry[]) => void = vi.fn(),
  refresh: (forceSync?: boolean) => Promise<void> = vi.fn(() => Promise.resolve()),
  hasPermission: () => boolean = () => true
) {
  const navigate = vi.fn();
  return renderHook(() =>
    useAtShowEntryListHandlers({
      actions,
      replication: { updateClassStatus: vi.fn(() => Promise.resolve()) } as never,
      classId: 'class-1',
      localEntries,
      hasPermission,
      navigate,
      buildScoreSheetRoute: () => '/route',
      refresh,
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
}

describe('useAtShowEntryListHandlers — entry-card view intent', () => {
  let actions: EntryListActions;

  beforeEach(() => {
    actions = makeActions();
  });

  it('navigates to the scoresheet without optimistically enqueuing an in-ring write', () => {
    const { result } = renderHandlers([makeEntry({ id: 'entry-1' })], actions);

    act(() => {
      result.current.handleEntryClick(makeEntry({ id: 'entry-1' }));
    });

    expect(actions.handleMarkInRing).not.toHaveBeenCalled();
  });

  /**
   * Tapping a SCORED dog used to `return` silently — no navigation, no message,
   * indistinguishable from a missed tap or a frozen app. A judge who spots a
   * typo two dogs later reaches for the obvious action and gets nothing.
   *
   * It deliberately still does not navigate: `toScoresheetEntry` maps identity
   * only, so the sheet would open BLANK rather than pre-filled — turning a dead
   * tap into a silent-overwrite path is not an improvement.
   */
  it('explains itself when a scored entry is tapped, instead of doing nothing', () => {
    toastInfo.mockClear();
    const scored = makeEntry({ id: 'entry-1', isScored: true, callName: 'Rex' });
    const { result } = renderHandlers([scored], actions);

    act(() => {
      result.current.handleEntryClick(scored);
    });

    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo.mock.calls[0]?.[0]).toMatch(/already scored/i);
    expect(actions.handleMarkInRing).not.toHaveBeenCalled();
  });
});

describe('useAtShowEntryListHandlers — entry awaiting a registration number (MYK9-1162)', () => {
  it('still opens the scoresheet route, where the lock is explained and absent is allowed', () => {
    toastInfo.mockClear();
    const held = makeEntry({ id: 'entry-1', callName: 'Rex', awaitingRegistrationNumber: true });
    const actions = makeActions();
    const { result } = renderHandlers([held], actions);

    act(() => {
      result.current.handleEntryClick(held);
    });

    expect(toastInfo).not.toHaveBeenCalled();
    expect(actions.handleMarkInRing).not.toHaveBeenCalled();
  });
});

describe('useAtShowEntryListHandlers — placement recompute RPC', () => {
  let actions: EntryListActions;

  beforeEach(() => {
    actions = makeActions();
    supabaseMocks.rpc.mockClear();
  });

  it('uses the authorized placement refresh wrapper, not the internal definer function', async () => {
    const { result } = renderHandlers([makeEntry({ id: 'entry-1' })], actions);

    await act(async () => {
      await result.current.handleRecalculatePlacements();
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('refresh_class_scoring_state_authorized', {
      p_class_id: 'class-1',
    });
    expect(supabaseMocks.rpc).not.toHaveBeenCalledWith(
      'refresh_class_scoring_state',
      expect.anything()
    );
  });

  it('toasts an offline failure and does not refresh after RPC rejection', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    supabaseMocks.rpc.mockRejectedValueOnce(new Error('Failed to fetch'));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHandlers([makeEntry({ id: 'entry-1' })], actions, vi.fn(), refresh);

    await act(async () => {
      await result.current.handleRecalculatePlacements();
    });

    expect(toastError).toHaveBeenCalledWith(
      "Couldn't recalculate placements while offline. Reconnect and try again."
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

/**
 * Optimistic check-in (MYK9-260).
 *
 * For an exhibitor the write goes through `self_checkin_entry`, a bare RPC that
 * never touches the replicated store -- so the `refresh()` that follows re-reads
 * a cache which has not heard about the change and the card snaps back to its
 * old status. The dog is checked in on the server and the exhibitor cannot tell,
 * so they tap again.
 *
 * The deleted combined A/B page carried its own optimistic update; the
 * single-class route never had one, which is how a bug that reproduces on BOTH
 * went unnoticed on one. The collapse removed the combined copy and made that
 * visible. This lives in the shared handler so both routes are covered.
 */
describe('useAtShowEntryListHandlers - optimistic check-in', () => {
  let actions: EntryListActions;
  let mirror: Entry[];
  const applyToMirror = (updater: (prev: Entry[]) => Entry[]) => {
    mirror = updater(mirror);
  };

  beforeEach(() => {
    actions = makeActions();
    mirror = [makeEntry({ id: 'e1', status: 'no-status' as EntryStatus })];
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the new status before the write resolves', async () => {
    const { result } = renderHandlers(mirror, actions, applyToMirror);

    await act(async () => {
      await result.current.handleStatusChange('e1', 'checked-in');
    });

    expect(mirror[0]?.status).toBe('checked-in');
    expect(mirror[0]?.checkedIn).toBe(true);
    expect(actions.handleStatusChange).toHaveBeenCalledWith('e1', 'checked-in');
  });

  it('rolls the card back when the write is rejected', async () => {
    // Showing a status the server refused is worse than showing none -- the
    // gate would be worked from a check-in that does not exist.
    actions.handleStatusChange = vi.fn(() => Promise.reject(new Error('denied')));
    const { result } = renderHandlers(mirror, actions, applyToMirror);

    await act(async () => {
      await result.current.handleStatusChange('e1', 'checked-in');
    });

    expect(mirror[0]?.status).toBe('no-status');
  });

  it('offers Undo after a Pulled, and Undo writes the prior status back through the same path', async () => {
    mirror = [makeEntry({ id: 'e1', status: 'checked-in' as EntryStatus, callName: 'Abby' })];
    const { result } = renderHandlers(mirror, actions, applyToMirror);

    await act(async () => {
      await result.current.handleStatusChange('e1', 'pulled');
    });

    expect(actions.handleStatusChange).toHaveBeenCalledWith('e1', 'pulled');
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const options = toastSuccess.mock.calls[0]?.[1] as { action: { onClick: () => void } };

    await act(async () => {
      options.action.onClick();
    });

    // Undo now checks the dog's current status first, so the write lands a read later.
    await waitFor(() =>
      expect(actions.handleStatusChange).toHaveBeenLastCalledWith('e1', 'checked-in')
    );
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('an exhibitor Undo names the version its own Pull produced (MYK9-1911)', async () => {
    mirror = [makeEntry({ id: 'e1', status: 'checked-in' as EntryStatus, callName: 'Abby' })];
    const handleUndoPull = vi.fn(() => Promise.resolve());
    const lastWriteVersion = vi.fn(() => 12);
    const exhibitorActions = {
      ...actions,
      writer: 'self-checkin-rpc' as const,
      handleUndoPull,
      lastWriteVersion,
    };
    const { result } = renderHandlers(mirror, exhibitorActions, applyToMirror);

    await act(async () => {
      await result.current.handleStatusChange('e1', 'pulled');
    });
    const options = toastSuccess.mock.calls[0]?.[1] as { action: { onClick: () => void } };
    await act(async () => {
      options.action.onClick();
    });

    await waitFor(() => expect(handleUndoPull).toHaveBeenCalledWith('e1', 'checked-in', 12));
  });

  describe('a refused Undo of a Pull shows the server status (MYK9-1911)', () => {
    // The page mirrors fetched entries into local state; a forced sync that brings the other
    // device's change replaces it. `refresh(true)` stands in for that here.
    async function pullThenRefusedUndo(refresh: (forceSync?: boolean) => Promise<void>) {
      mirror = [makeEntry({ id: 'e1', status: 'checked-in' as EntryStatus, callName: 'Abby' })];
      const handleUndoPull = vi.fn(() => Promise.reject(new StaleCheckInError()));
      const exhibitorActions = {
        ...actions,
        writer: 'self-checkin-rpc' as const,
        handleUndoPull,
        lastWriteVersion: vi.fn(() => 3),
      };
      const { result } = renderHandlers(mirror, exhibitorActions, applyToMirror, refresh);
      await act(async () => {
        await result.current.handleStatusChange('e1', 'pulled');
      });
      const options = toastSuccess.mock.calls[0]?.[1] as { action: { onClick: () => void } };
      await act(async () => {
        options.action.onClick();
      });
      await waitFor(() => expect(handleUndoPull).toHaveBeenCalled());
    }

    it('ends on the status the forced sync returned, not the rolled-back Pulled', async () => {
      const refresh = vi.fn((forceSync?: boolean) => {
        if (forceSync) mirror = [makeEntry({ id: 'e1', status: 'at-gate' as EntryStatus })];
        return Promise.resolve();
      });
      await pullThenRefusedUndo(refresh);

      await waitFor(() => expect(mirror[0]?.status).toBe('at-gate'));
      expect(refresh).toHaveBeenCalledWith(true);
      expect(toastInfo).toHaveBeenCalledWith(
        expect.stringContaining('status changed after the Pull')
      );
    });

    it('keeps the rolled-back card and still shows the notice when the sync fails offline', async () => {
      const refresh = vi.fn(() => Promise.reject(new Error('offline')));
      await pullThenRefusedUndo(refresh);

      await waitFor(() =>
        expect(toastInfo).toHaveBeenCalledWith(
          expect.stringContaining('status changed after the Pull')
        )
      );
      // The card stays on the local copy; nothing from a failed sync replaced it.
      expect(mirror[0]?.status).not.toBe('at-gate');
      expect(refresh).toHaveBeenCalledWith(true);
    });
  });

  it('offers no Undo to a exhibitor writer when the prior status is staff-set', async () => {
    mirror = [makeEntry({ id: 'e1', status: 'come-to-gate' as EntryStatus })];
    const exhibitorActions = { ...actions, writer: 'self-checkin-rpc' as const };
    const { result } = renderHandlers(mirror, exhibitorActions, applyToMirror);

    await act(async () => {
      await result.current.handleStatusChange('e1', 'pulled');
    });

    expect(exhibitorActions.handleStatusChange).toHaveBeenCalledWith('e1', 'pulled');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('keeps Undo for a staff writer even when the prior status is staff-set and canScore is false', async () => {
    mirror = [makeEntry({ id: 'e1', status: 'come-to-gate' as EntryStatus })];
    const { result } = renderHandlers(
      mirror,
      { ...actions, writer: 'replicated' },
      applyToMirror,
      undefined,
      () => false
    );

    await act(async () => {
      await result.current.handleStatusChange('e1', 'pulled');
    });

    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('offers no Undo for a non-Pulled status', async () => {
    const { result } = renderHandlers(mirror, actions, applyToMirror);

    await act(async () => {
      await result.current.handleStatusChange('e1', 'checked-in');
    });

    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('useAtShowEntryListHandlers — max time gate (MYK9-1099)', () => {
  function renderGated(gated: boolean) {
    const navigate = vi.fn();
    const gateEntryClick = vi.fn(() => gated);
    const hook = renderHook(() =>
      useAtShowEntryListHandlers({
        actions: makeActions(),
        replication: { updateClassStatus: vi.fn(() => Promise.resolve()) } as never,
        classId: 'class-1',
        localEntries: [],
        hasPermission: () => true,
        navigate,
        buildScoreSheetRoute: () => '/route',
        gateEntryClick,
        refresh: vi.fn(() => Promise.resolve()),
        manualRefresh: vi.fn(() => Promise.resolve()),
        setActiveStatusPopup: vi.fn(),
        setActiveResetMenu: vi.fn(),
        setResetMenuPosition: vi.fn(),
        setResetConfirmDialog: vi.fn(),
        setIsDragMode: vi.fn(),
        setIsManualRefreshing: vi.fn(),
        setActiveTab: vi.fn(),
        setLocalEntries: vi.fn() as never,
      })
    );
    return { ...hook, navigate, gateEntryClick };
  }

  it('opens Set Max Time instead of the scoresheet while the class has no max time', () => {
    const { result, navigate, gateEntryClick } = renderGated(true);
    act(() => result.current.handleEntryClick(makeEntry({ id: 'entry-1' })));
    expect(gateEntryClick).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes to the scoresheet once the gate is clear', () => {
    const { result, navigate } = renderGated(false);
    act(() => result.current.handleEntryClick(makeEntry({ id: 'entry-1' })));
    expect(navigate).toHaveBeenCalledWith('/route');
  });
});

/**
 * Undo: offered to the deleter, only inside the server's 10-minute window, and
 * it brings the item back onto this device so it reappears in its list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('./deleteServer', () => ({ softDeleteOnServer: vi.fn(), restoreOnServer: mocks.restore }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import {
  replicatedClassesTable,
  replicatedClubsTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClubStore } from '@/store/clubStore';
import { offerUndoToast, undoDelete } from './deleteUndoToast';
import { refreshAfterRestore } from './deleteRestoreRefresh';
import { UNDO_WINDOW_MS } from './deleteTypes';

const show = { id: 's1', name: 'Heartland Classic' };

const sync = {
  shows: vi.spyOn(replicatedShowsTable, 'sync'),
  trials: vi.spyOn(replicatedTrialsTable, 'sync'),
  trialsGetAll: vi.spyOn(replicatedTrialsTable, 'getAllOrThrow'),
  classes: vi.spyOn(replicatedClassesTable, 'sync'),
  entries: vi.spyOn(replicatedEntriesTable, 'sync'),
  clubs: vi.spyOn(replicatedClubsTable, 'sync'),
};
const loadShows = vi.fn();
const loadTrials = vi.fn();
const loadTrialClasses = vi.fn();
const loadClubs = vi.fn();

beforeEach(() => {
  mocks.restore.mockReset().mockResolvedValue(undefined);
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  for (const spy of Object.values(sync)) spy.mockReset().mockResolvedValue(undefined as never);
  sync.trialsGetAll.mockResolvedValue([{ id: 't1', showId: 's1' }] as never);
  for (const fn of [loadShows, loadTrials, loadTrialClasses, loadClubs]) {
    fn.mockReset().mockResolvedValue(undefined);
  }
  useShowStore.setState({ loadShows });
  useTrialStore.setState({ loadTrials, loadTrialClasses });
  useClubStore.setState({ loadClubs });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('the Undo toast', () => {
  it('is offered with an Undo action after a delete', () => {
    offerUndoToast({
      kind: 'show',
      deleted: [show],
      deletedAt: Date.now(),
      queryClient: new QueryClient(),
    });

    const [message, options] = mocks.toastSuccess.mock.calls[0] ?? [];
    expect(message).toBe('Show deleted: Heartland Classic');
    expect(options).toMatchObject({ action: { label: 'Undo' } });
  });

  it('is not offered when nothing was deleted by this person (e.g. already deleted elsewhere)', () => {
    offerUndoToast({
      kind: 'show',
      deleted: [],
      deletedAt: Date.now(),
      queryClient: new QueryClient(),
    });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('inside the window: calls the matching restore_ and the show reappears in its list', async () => {
    const deletedAt = 1_000;
    await undoDelete({
      kind: 'show',
      deleted: [show],
      deletedAt,
      queryClient: new QueryClient(),
      now: () => deletedAt + 60_000,
    });

    expect(mocks.restore).toHaveBeenCalledWith('show', 's1');
    expect(sync.shows).toHaveBeenCalledWith('');
    expect(loadShows).toHaveBeenCalled();
    expect(sync.trials).toHaveBeenCalledWith('s1');
    expect(sync.classes).toHaveBeenCalledWith('t1');
    expect(sync.entries).toHaveBeenCalledWith('s1');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Show restored');
  });

  it('after the window: no restore call, and it says who can restore instead', async () => {
    const deletedAt = 1_000;
    await undoDelete({
      kind: 'show',
      deleted: [show],
      deletedAt,
      queryClient: new QueryClient(),
      now: () => deletedAt + UNDO_WINDOW_MS,
    });

    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'The 10 minutes to undo this are over. Ask a myK9 administrator to restore it.'
    );
  });

  it('a refusal from the server (not the deleter, or late) is plain language', async () => {
    mocks.restore.mockRejectedValue({ code: '42501', message: 'Permission denied' });
    await undoDelete({
      kind: 'club',
      deleted: [{ id: 'k1', name: 'Heartland KC' }],
      deletedAt: Date.now(),
      queryClient: new QueryClient(),
    });

    expect(mocks.toastError).toHaveBeenCalledWith(
      'The 10 minutes to undo this are over. Ask a myK9 administrator to restore it.'
    );
    expect(loadClubs).not.toHaveBeenCalled();
  });
});

describe('refreshAfterRestore', () => {
  it('entry: stops guarding the row and re-syncs its show', async () => {
    const forget = vi.spyOn(replicatedEntriesTable, 'forgetServerDeletion');
    await refreshAfterRestore('entry', { id: 'e1', name: 'Biscuit', context: { showId: 's1' } });
    expect(forget).toHaveBeenCalledWith('e1');
    expect(sync.entries).toHaveBeenCalledWith('s1');
  });

  it('class: re-syncs its trial and the trial store', async () => {
    await refreshAfterRestore('class', {
      id: 'c1',
      name: 'Novice A',
      context: { showId: 's1', trialId: 't1' },
    });
    expect(sync.classes).toHaveBeenCalledWith('t1');
    expect(loadTrialClasses).toHaveBeenCalled();
  });

  it('club: re-syncs clubs and reloads the club list', async () => {
    await refreshAfterRestore('club', { id: 'k1', name: 'Heartland KC' });
    expect(sync.clubs).toHaveBeenCalled();
    expect(loadClubs).toHaveBeenCalled();
  });

  it('never throws, even when every sync fails', async () => {
    for (const spy of Object.values(sync)) spy.mockRejectedValue(new Error('offline'));
    await expect(refreshAfterRestore('show', { id: 's1', name: 'Show' })).resolves.toBeUndefined();
  });
});

import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialsTab } from '../TrialsTab';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Trial } from '@/components/trials/types/trial.types';

// MYK9-900: Setup → Trials rows get Edit / Delete that open the SAME TrialEditPanel and
// delete dialog the trial's own page uses. Managers only; the row still opens detail.

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// The global permission is NOT club-scoped, so it is held constantly here; only the show-scoped
// answer varies.
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

const replicatedTrialsSync = vi.hoisted(() => vi.fn());
vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedTrialsTable: { ...actual.replicatedTrialsTable, sync: replicatedTrialsSync },
  };
});

// The shared delete dialog's server and device halves (features/delete).
const deleteMocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
}));
const NOTHING_BLOCKS = {
  trials: 0,
  classes: 6,
  entries: 12,
  shows: 0,
  dogs: 0,
  paid: 0,
  scored: 0,
  blocking: 0,
};

let mockCanManage = true;
let mockScopeStatus: 'resolved' | 'resolving' | 'unavailable' = 'resolved';
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: (p: string) => p === 'show:manage' }),
}));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: mockScopeStatus,
    canManage: mockCanManage && mockScopeStatus === 'resolved',
  }),
}));

let mockViewMode = 'cards';
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [
    mockViewMode,
    (mode: string) => {
      mockViewMode = mode;
    },
  ],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));

const trials: Trial[] = [
  {
    id: 't1',
    showId: 's1',
    showName: 'Test Show',
    trialDate: '2026-05-09',
    trialNumber: '1',
    status: 'Upcoming',
    name: 'Saturday Trial 1',
    plannedStartTime: '8:00 AM',
  },
  {
    id: 't2',
    showId: 's1',
    showName: 'Test Show',
    trialDate: '2026-05-10',
    trialNumber: '2',
    status: 'Upcoming',
    name: 'Sunday Trial 2',
    plannedStartTime: '8:00 AM',
  },
];
const stats = {
  t1: { classCount: 6, entryCount: 12, completedClasses: 0 },
  t2: { classCount: 4, entryCount: 8, completedClasses: 0 },
};

const syncable = (trial: Trial): SyncableTrial => ({
  eventNumber: '1',
  order: '1',
  ...trial,
  _version: 1,
  _lastModified: new Date('2026-05-01T00:00:00Z'),
  _lastModifiedBy: 'user-1',
  _syncStatus: 'synced',
});
const seedStore = () => useTrialStore.setState({ trials: trials.map(syncable) });

const renderTab = () => render(<TrialsTab trials={trials} showId="s1" trialStats={stats} />);

describe.each(['cards', 'table'])('TrialsTab row actions (%s view)', view => {
  beforeEach(() => {
    mockNavigate.mockClear();
    deleteMocks.preview.mockReset().mockResolvedValue(NOTHING_BLOCKS);
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    mockCanManage = true;
    mockScopeStatus = 'resolved';
    mockViewMode = view;
    seedStore();
  });

  it('shows a row menu for every trial to a manager', () => {
    renderTab();
    expect(
      screen.getByRole('button', { name: 'Trial actions for Saturday Trial 1' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' })).toBeVisible();
  });

  it('shows Add Trial only when the viewer manages THIS show, whatever the global permission', () => {
    const first = renderTab();
    expect(screen.getByRole('button', { name: 'Add Trial' })).toBeVisible();
    first.unmount();

    mockCanManage = false;
    renderTab();
    expect(screen.queryByRole('button', { name: 'Add Trial' })).not.toBeInTheDocument();
  });

  it('shows no menu while the show scope is still resolving or unavailable', () => {
    mockScopeStatus = 'resolving';
    const first = renderTab();
    expect(screen.queryByRole('button', { name: /^Trial actions for/ })).not.toBeInTheDocument();
    first.unmount();
    mockScopeStatus = 'unavailable';
    renderTab();
    expect(screen.queryByRole('button', { name: /^Trial actions for/ })).not.toBeInTheDocument();
  });

  it('shows no menu when the viewer holds the global permission but does not manage THIS show', () => {
    mockCanManage = false;
    renderTab();
    expect(screen.queryByRole('button', { name: /^Trial actions for/ })).not.toBeInTheDocument();
  });

  it('Edit opens the real trial edit panel for that trial', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));

    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByDisplayValue('Sunday Trial 2')).toBeVisible();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Delete opens the real delete-trial dialog naming that trial, without deleting', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Saturday Trial 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Trial' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Delete the trial Saturday Trial 1?',
    });
    expect(
      await within(dialog).findByText('This also removes its 6 classes and 12 entries.')
    ).toBeVisible();
    expect(deleteMocks.remove).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opening the menu does not navigate, and the row still opens the trial', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Saturday Trial 1' }));
    await screen.findByRole('menuitem', { name: 'Edit Trial' });
    expect(mockNavigate).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await user.click(screen.getByText('Saturday Trial 1'));
    expect(mockNavigate).toHaveBeenCalledWith('/shows/s1/trials/t1');
  });
});

// Codex P2: the trial dialogs mount per selection WITH the trial, so the first Edit initializes
// the Scheduling tab's calendar from the saved date instead of showing "Pick a date".
describe('TrialsTab Edit trial initializes from the selected trial', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockCanManage = true;
    mockScopeStatus = 'resolved';
    mockViewMode = 'cards';
    seedStore();
  });

  async function openScheduling(user: ReturnType<typeof renderTab>['user'], trialLabel: string) {
    await user.click(screen.getByRole('button', { name: `Trial actions for ${trialLabel}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));
    const panel = await screen.findByRole('dialog');
    await user.click(within(panel).getByRole('tab', { name: /scheduling/i }));
    return panel;
  }

  it("shows the saved date on the first open, and the next trial's date on the next open", async () => {
    const { user } = renderTab();

    const first = await openScheduling(user, 'Saturday Trial 1');
    expect(within(first).queryByText('Pick a date')).not.toBeInTheDocument();
    expect(within(first).getByText(/May 9(th)?, 2026/)).toBeVisible();

    await user.click(within(first).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const second = await openScheduling(user, 'Sunday Trial 2');
    expect(within(second).queryByText('Pick a date')).not.toBeInTheDocument();
    expect(within(second).getByText(/May 10(th)?, 2026/)).toBeVisible();
  });
});

describe('TrialsTab trial delete', () => {
  beforeEach(() => {
    toastError.mockClear();
    deleteMocks.preview.mockReset().mockResolvedValue(NOTHING_BLOCKS);
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge
      .mockReset()
      .mockImplementation(async (_kind: string, target: { id: string }) => {
        useTrialStore.setState(state => ({ trials: state.trials.filter(t => t.id !== target.id) }));
      });
    mockCanManage = true;
    mockScopeStatus = 'resolved';
    mockViewMode = 'cards';
    seedStore();
  });

  it('asks through the shared dialog, deletes, purges and closes with no error', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Saturday Trial 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Trial' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete the trial Saturday Trial 1?',
    });
    const confirm = within(dialog).getByRole('button', { name: 'Delete trial' });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(
      within(dialog).getByText('This also removes its 6 classes and 12 entries.')
    ).toBeVisible();
    await user.click(confirm);

    await waitFor(() =>
      expect(deleteMocks.remove).toHaveBeenCalledWith('trial', 't1', { override: false })
    );
    expect(deleteMocks.purge).toHaveBeenCalledWith('trial', expect.objectContaining({ id: 't1' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useTrialStore.getState().trials.map(t => t.id)).not.toContain('t1');
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('TrialsTab trial save and delete failures', () => {
  beforeEach(() => {
    toastError.mockClear();
    mockCanManage = true;
    mockScopeStatus = 'resolved';
    mockViewMode = 'cards';
    seedStore();
  });

  Element.prototype.scrollIntoView = vi.fn();

  async function editName(user: ReturnType<typeof renderTab>['user']) {
    await user.click(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));
    const panel = await screen.findByRole('dialog');
    const name = within(panel).getByDisplayValue('Sunday Trial 2');
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.click(within(panel).getByRole('button', { name: /save changes/i }));
    return panel;
  }

  it('a failed save keeps the panel open with the edits and shows the error', async () => {
    const updateTrial = vi.fn().mockRejectedValue(new Error('Trial with id t2 not found'));
    useTrialStore.setState({ updateTrial });
    const { user } = renderTab();

    await editName(user);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(updateTrial).toHaveBeenCalledWith('t2', expect.anything(), expect.anything());
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByDisplayValue('Renamed')).toBeVisible();
  });

  it('a successful save closes the panel', async () => {
    const updateTrial = vi.fn().mockResolvedValue(null);
    useTrialStore.setState({ updateTrial });
    const { user } = renderTab();

    await editName(user);

    await waitFor(() => expect(updateTrial).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a refused delete keeps the dialog open and says why in plain language', async () => {
    deleteMocks.preview.mockReset().mockResolvedValue(NOTHING_BLOCKS);
    deleteMocks.remove
      .mockReset()
      .mockRejectedValue({ code: '42501', message: 'Permission denied' });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Saturday Trial 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Trial' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete trial' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "You don't have permission to delete this trial."
    );
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});

describe('TrialsTab trial delete in flight', () => {
  beforeEach(() => {
    toastError.mockClear();
    deleteMocks.preview.mockReset().mockResolvedValue(NOTHING_BLOCKS);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);
    mockCanManage = true;
    mockScopeStatus = 'resolved';
    mockViewMode = 'cards';
    seedStore();
  });

  async function startDelete(user: ReturnType<typeof renderTab>['user']) {
    await user.click(screen.getByRole('button', { name: 'Trial actions for Saturday Trial 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Trial' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete trial' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    return dialog;
  }

  it('cannot be dismissed while pending, and closes only when the delete completes', async () => {
    let finishDelete: () => void = () => undefined;
    deleteMocks.remove.mockReset().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishDelete = resolve;
        })
    );
    const { user } = renderTab();

    const dialog = await startDelete(user);

    // Pending: Keep it is disabled, the action says Deleting, and Escape does not dismiss.
    expect(await within(dialog).findByRole('button', { name: /Deleting/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeVisible();
    // Other rows stay locked, so no other trial's action can start underneath it.
    expect(screen.getByLabelText('Trial actions for Sunday Trial 2')).toBeDisabled();

    finishDelete();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastError).not.toHaveBeenCalled();
  });

  it('after a failure the dialog can be dismissed again', async () => {
    deleteMocks.remove.mockReset().mockRejectedValue(new Error('nope'));
    const { user } = renderTab();

    const dialog = await startDelete(user);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We couldn't delete this trial. Please try again."
    );

    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

// Codex round 5: with a cold trial store (rows fed by the server read) the actions hydrate the
// store first, and an unresolvable trial errors instead of opening a dialog that silently no-ops.
describe('TrialsTab row actions with a cold trial store', () => {
  beforeEach(() => {
    toastError.mockClear();
    replicatedTrialsSync.mockReset().mockResolvedValue(undefined);
    mockCanManage = true;
    mockScopeStatus = 'resolved';
    mockViewMode = 'cards';
    useTrialStore.setState({ trials: [] });
  });

  it("syncs the show's trials into the replica, reloads the store, then opens Edit", async () => {
    const loadTrials = vi.fn(async () => {
      useTrialStore.setState({ trials: trials.map(syncable) });
    });
    useTrialStore.setState({ loadTrials });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));

    const panel = await screen.findByRole('dialog');
    expect(replicatedTrialsSync).toHaveBeenCalledWith('s1', expect.anything());
    expect(loadTrials).toHaveBeenCalledTimes(1);
    expect(within(panel).getByDisplayValue('Sunday Trial 2')).toBeVisible();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a failed sync (offline) shows the error and opens nothing', async () => {
    replicatedTrialsSync.mockRejectedValue(new Error('offline'));
    useTrialStore.setState({ loadTrials: vi.fn(async () => undefined) });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't load this trial/i))
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('with the trial already in the store nothing is synced', async () => {
    seedStore();
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(replicatedTrialsSync).not.toHaveBeenCalled();
  });

  it('locks every other row menu while one trial resolves', async () => {
    let finishLoad: () => void = () => undefined;
    useTrialStore.setState({
      loadTrials: () =>
        new Promise<void>(resolve => {
          finishLoad = () => {
            useTrialStore.setState({ trials: trials.map(syncable) });
            resolve();
          };
        }),
    });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));

    expect(screen.getByLabelText('Trial actions for Saturday Trial 1')).toBeDisabled();
    expect(screen.getByLabelText('Opening trial Sunday Trial 2')).toBeDisabled();

    finishLoad();
    expect(await screen.findByRole('dialog')).toBeVisible();
  });

  it('shows an error and opens nothing when the trial cannot be resolved', async () => {
    useTrialStore.setState({ loadTrials: vi.fn(async () => undefined) });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Trial' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't load this trial/i))
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('store read failures', () => {
    const throwingTrials = {
      find: () => {
        throw new Error('store read failed');
      },
      some: () => {
        throw new Error('store read failed');
      },
    } as never;

    const openEdit = async (user: ReturnType<typeof renderTab>['user']) => {
      await user.click(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));
    };
    const expectErrorUnlocked = async () => {
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't load this trial/i))
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByLabelText('Trial actions for Sunday Trial 2')).toBeEnabled()
      );
      expect(screen.getByLabelText('Trial actions for Saturday Trial 1')).toBeEnabled();
    };

    it('the first read throwing shows the error, no dialog, menu unlocked', async () => {
      useTrialStore.setState({ trials: throwingTrials, loadTrials: vi.fn(async () => undefined) });
      const { user } = renderTab();
      await openEdit(user);
      await expectErrorUnlocked();
    });

    it('the second read throwing shows the error, no dialog, menu unlocked', async () => {
      useTrialStore.setState({
        trials: [],
        loadTrials: vi.fn(async () => {
          useTrialStore.setState({ trials: throwingTrials });
        }),
      });
      const { user } = renderTab();
      await openEdit(user);
      await expectErrorUnlocked();
    });
  });
});

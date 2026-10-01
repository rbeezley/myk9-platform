import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';

// MYK9-900 (Codex P2): after an offline reload the React Query class list is empty/paused, but
// Setup still shows the class from the replicated trialStore. Edit and Delete must resolve it
// from there, and an offline delete must say it needs a connection rather than fail silently.

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn(), warning: vi.fn() } }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true }),
}));
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => ['cards', vi.fn(), true],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));

let mockConnectionHint: string | undefined;
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => mockConnectionHint }));

const updateClass = vi.hoisted(() => vi.fn());
// Cold, offline query cache: the list is empty.
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [], updateClass }),
}));

// The shared delete dialog's server and device halves (features/delete).
const deleteMocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
}));
const replicatedSync = vi.hoisted(() => vi.fn());
// Scripted replica read failures (IndexedDB init/read errors): consumed one per getClassById call.
const readScript = vi.hoisted(() => ({ calls: [] as Array<'throw' | 'pass'> }));
// The Setup editor reads the class from the authenticated REPLICA in raw DB form (status
// 'in_progress'), so these tests serve the replica from whatever the test put in trialStore.
vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedClassesTable: {
      ...actual.replicatedClassesTable,
      sync: replicatedSync,
      getClassById: async (id: string) => {
        if (readScript.calls.shift() === 'throw') throw new Error('IndexedDB read failed');
        // Imported lazily: trialStore itself imports this (mocked) module.
        const { useTrialStore: store } = await import('@/store/trialStore');
        for (const [trialId, classes] of Object.entries(store.getState().trialClasses)) {
          const cls = classes.find(c => c.id === id);
          if (cls) {
            return {
              id: cls.id,
              trialId,
              name: `${cls.level} ${cls.element}`,
              element: cls.element,
              level: cls.level,
              section: cls.section,
              classStatus: 'in_progress',
              judgeId: cls.judgeId,
              judgeName: cls.judgeName,
              startTime: cls.startTime,
            };
          }
        }
        return null;
      },
    },
    replicatedTrialsTable: {
      ...actual.replicatedTrialsTable,
      getTrialById: async () => ({
        id: 't1',
        name: 'Saturday Trial',
        date: '2026-05-09',
        trialNumber: '1',
        status: 'upcoming',
      }),
    },
  };
});
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));

const replicatedClass: SyncableTrialClass = {
  _version: 1,
  _lastModified: new Date('2026-05-01T00:00:00Z'),
  _lastModifiedBy: 'user-1',
  _syncStatus: 'synced',
  id: 'c1',
  element: 'Containers',
  level: 'Novice',
  section: 'A',
  judgeId: 'j1',
  judgeName: 'Test Judge',
  startTime: '2026-05-09T09:00:00',
  status: 'Upcoming',
  entries: 3,
};

const secondClass: SyncableTrialClass = {
  ...replicatedClass,
  id: 'c2',
  element: 'Interior',
  level: 'Advanced',
  section: 'B',
};

const rows: ClassInfo[] = [
  {
    id: 'c1',
    name: 'Novice Containers',
    element: 'Containers',
    level: 'Novice',
    section: 'A',
    judgeName: 'Test Judge',
    trialId: 't1',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 3,
    userHasEntry: false,
  },
  {
    id: 'c2',
    name: 'Advanced Interior',
    element: 'Interior',
    level: 'Advanced',
    section: 'B',
    judgeName: 'Test Judge',
    trialId: 't1',
    time: '10:30 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 1,
    userHasEntry: false,
  },
];

const renderTab = () => render(<ClassesTab classes={rows} showId="s1" userHasEntries={false} />);

describe('ClassesTab row actions with a cold, offline class query', () => {
  beforeEach(() => {
    toastError.mockClear();
    replicatedSync.mockReset().mockResolvedValue(undefined);
    readScript.calls = [];
    useTrialStore.setState({ loadTrialClasses: async () => undefined });
    deleteMocks.preview.mockReset().mockResolvedValue({
      trials: 0,
      classes: 0,
      entries: 3,
      shows: 0,
      dogs: 0,
      paid: 0,
      scored: 0,
      blocking: 0,
    });
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);
    vi.restoreAllMocks();
    updateClass.mockReset();
    mockConnectionHint = undefined;
    useTrialStore.setState({ trialClasses: { t1: [replicatedClass] } });
  });

  it('Edit opens the panel populated from the replicated class', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));

    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByDisplayValue('Containers')).toBeVisible();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('the editor gets the mapped class shape: raw in_progress shows as In Progress', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));

    const panel = await screen.findByRole('dialog');
    // The replica holds 'in_progress'; the status select must show the title-case label.
    expect(within(panel).getByText('In Progress')).toBeVisible();
    expect(within(panel).getByDisplayValue('Containers')).toBeVisible();
  });

  const openDelete = async (user: ReturnType<typeof renderTab>['user']) => {
    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));
    return screen.findByRole('dialog');
  };

  it('Delete opens the shared dialog naming the replicated class', async () => {
    const { user } = renderTab();

    const dialog = await openDelete(user);
    expect(dialog).toHaveAccessibleName(/^Delete the class .*Containers/);
    expect(within(dialog).getByText('Novice Containers · Saturday Trial')).toBeVisible();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('offline: Delete stays off and the dialog says it needs a connection', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { user } = renderTab();

    const dialog = await openDelete(user);

    expect(within(dialog).getByText(/^You're offline\. Deleting needs a connection/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Delete class' })).toBeDisabled();
    expect(deleteMocks.remove).not.toHaveBeenCalled();
  });

  it('a failed delete keeps the dialog open with a plain-language error', async () => {
    deleteMocks.remove.mockRejectedValue(new Error('Server said no'));
    const { user } = renderTab();

    const dialog = await openDelete(user);
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We couldn't delete this class. Please try again."
    );
    expect(dialog).not.toHaveTextContent('Server said no');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('a successful delete closes the dialog with no "couldn\'t load" error, though the class leaves the store', async () => {
    // The purge removes the class from the replicated store before the confirm finishes.
    deleteMocks.purge.mockImplementation(async () => {
      useTrialStore.setState({ trialClasses: {} });
    });
    const { user } = renderTab();

    const dialog = await openDelete(user);
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(deleteMocks.remove).toHaveBeenCalledWith('class', 'c1', { override: false })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a class that cannot be hydrated shows an error and opens nothing', async () => {
    useTrialStore.setState({ trialClasses: {} });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't load this class/i))
    );
    expect(replicatedSync).toHaveBeenCalledWith('t1', expect.anything());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a failing hydration is also an error, not a silent no-op', async () => {
    useTrialStore.setState({ trialClasses: {} });
    replicatedSync.mockRejectedValue(new Error('network'));
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cold store: hydrates that trial from the replica, then opens the editor', async () => {
    useTrialStore.setState({ trialClasses: {} });
    let finishSync: () => void = () => undefined;
    replicatedSync.mockReturnValue(
      new Promise<void>(resolve => {
        finishSync = resolve;
      })
    );
    useTrialStore.setState({
      loadTrialClasses: async () => {
        useTrialStore.setState({ trialClasses: { t1: [replicatedClass] } });
      },
    });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));

    // While hydrating: the trigger is disabled and says so; nothing mounted, nothing errored.
    expect(await screen.findByLabelText('Opening class Containers Novice A')).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    finishSync();
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(replicatedSync).toHaveBeenCalledWith('t1', expect.anything());
    expect(toastError).not.toHaveBeenCalled();
  });

  it('with the class in the replicated store nothing is hydrated', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(replicatedSync).not.toHaveBeenCalled();
  });

  it('locks every row menu while one class resolves, and only the latest request opens', async () => {
    useTrialStore.setState({ trialClasses: {} });
    const finishers: Array<() => void> = [];
    replicatedSync.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishers.push(resolve);
        })
    );
    useTrialStore.setState({
      loadTrialClasses: async () => {
        useTrialStore.setState({ trialClasses: { t1: [replicatedClass, secondClass] } });
      },
    });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));

    // The OTHER row's menu is locked while the first resolves.
    expect(screen.getByLabelText('Class actions for Interior Advanced B')).toBeDisabled();
    expect(screen.getByLabelText('Opening class Containers Novice A')).toBeDisabled();

    finishers[0]?.();
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(replicatedSync).toHaveBeenCalledTimes(1);
  });

  describe('replica read failures', () => {
    const openEdit = async (user: ReturnType<typeof renderTab>['user']) => {
      await user.click(
        screen.getByRole('button', { name: 'Class actions for Containers Novice A' })
      );
      await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));
    };
    const expectErrorUnlocked = async () => {
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't load this class/i))
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // Not stuck: the menu is usable again and carries its normal label.
      await waitFor(() =>
        expect(screen.getByLabelText('Class actions for Containers Novice A')).toBeEnabled()
      );
      expect(screen.getByLabelText('Class actions for Interior Advanced B')).toBeEnabled();
    };

    it('the first read throwing (and the retry too) shows the error, no dialog, menu unlocked', async () => {
      readScript.calls = ['throw', 'throw'];
      const { user } = renderTab();
      await openEdit(user);
      await expectErrorUnlocked();
    });

    it('the second read throwing shows the error, no dialog, menu unlocked', async () => {
      useTrialStore.setState({ trialClasses: {} });
      readScript.calls = ['pass', 'throw'];
      const { user } = renderTab();
      await openEdit(user);
      await expectErrorUnlocked();
    });
  });
});

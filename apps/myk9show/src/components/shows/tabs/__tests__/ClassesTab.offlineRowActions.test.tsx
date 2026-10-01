import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';

// MYK9-900 (Codex P2): after an offline reload the React Query class list is empty/paused, but
// Setup still shows the class from the replicated trialStore. Edit and Delete must resolve it
// from there, and offline writes must say "needs a connection" rather than fail silently.

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

const deleteClass = vi.hoisted(() => vi.fn());
const updateClass = vi.hoisted(() => vi.fn());
// Cold, offline query cache: the list is empty.
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [], updateClass, deleteClass }),
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
    deleteClass.mockReset();
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

  it('Delete opens the dialog naming the replicated class', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Containers Novice A/)).toBeVisible();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('confirming Delete while offline keeps the dialog open and says it needs a connection', async () => {
    mockConnectionHint = 'Needs a connection';
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/needs a connection/i);
    expect(deleteClass).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeVisible();
  });

  it('a failed delete keeps the dialog open with an error', async () => {
    deleteClass.mockRejectedValue(new Error('Server said no'));
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server said no');
    expect(screen.getByRole('alertdialog')).toBeVisible();
  });

  it('a successful delete closes the dialog with no "couldn\'t load" error, though the class leaves the store', async () => {
    // A real delete removes the class from the replicated store before the confirm finishes.
    deleteClass.mockImplementation(async () => {
      useTrialStore.setState({ trialClasses: {} });
    });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' })
    );

    expect(deleteClass).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
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
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
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

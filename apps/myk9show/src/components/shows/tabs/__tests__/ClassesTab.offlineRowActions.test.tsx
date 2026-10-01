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
vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedClassesTable: { ...actual.replicatedClassesTable, sync: replicatedSync },
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

  it('cold store: hydrates that trial from the replica, then opens the dialog with the real judge', async () => {
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
    const panel = await screen.findByRole('dialog');
    // The real assigned judge is what the editor shows, not an unassigned class.
    expect(within(panel).getByText(/Test Judge/)).toBeVisible();
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
});

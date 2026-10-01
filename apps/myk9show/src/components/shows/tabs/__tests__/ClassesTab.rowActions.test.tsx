import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrialStore } from '@/store/trialStore';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-900: Setup → Classes rows get Edit / Delete that open the SAME ClassEditPanel Class Details
// uses, and the one shared delete dialog. Managers only; the row still opens detail.

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// The global permission is NOT club-scoped, so it is held constantly here; only the show-scoped
// answer varies.
let mockCanManage = true;
let mockScopeStatus: 'resolved' | 'resolving' | 'unavailable' = 'resolved';
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: (p: string) => p === 'show:manage' }),
}));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
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
    true,
  ],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
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
vi.mock('@/features/delete/deletePurge', () => ({ purgeDeletedLocally: deleteMocks.purge }));
const NOTHING_BLOCKS = {
  trials: 0,
  classes: 0,
  entries: 4,
  shows: 0,
  dogs: 0,
  paid: 0,
  scored: 0,
  blocking: 0,
};

const updateClass = vi.hoisted(() => vi.fn());
const storeClasses = vi.hoisted(() => [
  {
    id: 'c1',
    trialId: 't1',
    trial: 'Saturday Trial',
    element: 'Containers',
    level: 'Novice',
    section: 'A',
    status: 'Scheduled',
    judge: 'Test Judge',
    judgeId: 'j1',
  },
  {
    id: 'c2',
    trialId: 't1',
    trial: 'Saturday Trial',
    element: 'Interior',
    level: 'Advanced',
    section: 'B',
    status: 'Scheduled',
    judge: 'Test Judge',
    judgeId: 'j1',
  },
]);
const replicatedSync = vi.hoisted(() => vi.fn());
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
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: storeClasses, updateClass }),
}));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));

const classes: ClassInfo[] = [
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
    entryCount: 28,
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
    entryCount: 12,
    userHasEntry: false,
  },
];

const renderTab = () => render(<ClassesTab classes={classes} showId="s1" userHasEntries={false} />);

describe.each(['cards', 'table'])('ClassesTab row actions (%s view)', view => {
  beforeEach(() => {
    // The tab resolves a row's class from the authenticated replicated store.
    // A confirmed delete reloads the store from the replica; keep that reload inert so it cannot
    // land after the next test's seed.
    useTrialStore.setState({
      trialClasses: { t1: storeClasses as never },
      loadTrialClasses: async () => undefined,
    });
    mockNavigate.mockClear();
    deleteMocks.preview.mockReset().mockResolvedValue(NOTHING_BLOCKS);
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);
    mockCanManage = true;
    mockScopeStatus = 'resolved';
    mockViewMode = view;
  });

  it('shows a row menu for every class to a manager', () => {
    renderTab();
    expect(
      screen.getByRole('button', { name: 'Class actions for Containers Novice A' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Class actions for Interior Advanced B' })
    ).toBeVisible();
  });

  it('shows Add Classes only when the viewer manages THIS show, whatever the global permission', () => {
    const first = renderTab();
    expect(screen.getByRole('button', { name: 'Add Classes' })).toBeVisible();
    first.unmount();

    mockCanManage = false;
    renderTab();
    expect(screen.queryByRole('button', { name: 'Add Classes' })).not.toBeInTheDocument();
  });

  it('shows no menu while the show scope is still resolving or unavailable', () => {
    mockScopeStatus = 'resolving';
    const first = renderTab();
    expect(screen.queryByRole('button', { name: /^Class actions for/ })).not.toBeInTheDocument();
    first.unmount();
    mockScopeStatus = 'unavailable';
    renderTab();
    expect(screen.queryByRole('button', { name: /^Class actions for/ })).not.toBeInTheDocument();
  });

  it('shows no menu when the viewer holds the global permission but does not manage THIS show', () => {
    mockCanManage = false;
    renderTab();
    expect(screen.queryByRole('button', { name: /^Class actions for/ })).not.toBeInTheDocument();
  });

  it('Edit opens the real class edit panel for that class', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Interior Advanced B' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));

    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByDisplayValue('Interior')).toBeVisible();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Delete opens the shared dialog and deletes that class only on confirm', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));

    const dialog = await screen.findByRole('dialog', { name: /^Delete the class .*Containers/ });
    expect(within(dialog).getByText('Novice Containers · Saturday Trial')).toBeVisible();
    expect(deleteMocks.remove).not.toHaveBeenCalled();

    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(deleteMocks.remove).toHaveBeenCalledWith('class', 'c1', { override: false })
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opening the menu does not navigate, and the row still opens the class', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await screen.findByRole('menuitem', { name: 'Edit Class' });
    expect(mockNavigate).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await user.click(screen.getByText('Containers'));
    expect(mockNavigate).toHaveBeenCalledWith('/shows/s1/trials/t1/classes/c1');
  });
});

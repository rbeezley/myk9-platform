import { render, screen, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-900: Setup → Classes rows get Edit / Delete that open the SAME ClassEditPanel and
// DeleteClassDialog Class Details uses. Managers only; the row still opens detail.

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

const deleteClass = vi.hoisted(() => vi.fn());
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
// The tab resolves a row's class itself (replicated store, else this by-id read) before any
// dialog mounts; the cold replica here means the by-id read answers.
vi.mock('@/services/database/classes', () => ({
  getPublicClassById: async (id: string) => storeClasses.find(c => c.id === id) ?? null,
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: storeClasses, updateClass, deleteClass }),
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
    mockNavigate.mockClear();
    deleteClass.mockReset();
    deleteClass.mockResolvedValue(undefined);
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

  it('Delete opens the real Delete Class dialog and deletes that class only on confirm', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete Class')).toBeVisible();
    expect(within(dialog).getByText(/Containers Novice A/)).toBeVisible();
    expect(deleteClass).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteClass).toHaveBeenCalledWith('c1');
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

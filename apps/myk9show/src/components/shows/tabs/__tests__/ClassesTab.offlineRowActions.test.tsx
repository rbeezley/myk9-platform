import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';
import { useTrialStore } from '@/store/trialStore';
import type { TrialClass } from '@/components/trials/types/trial.types';

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
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));

const replicatedClass: TrialClass = {
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
];

const renderTab = () => render(<ClassesTab classes={rows} showId="s1" userHasEntries={false} />);

describe('ClassesTab row actions with a cold, offline class query', () => {
  beforeEach(() => {
    toastError.mockClear();
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

  it('a successful delete closes the dialog', async () => {
    deleteClass.mockResolvedValue(undefined);
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete Class' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' })
    );

    expect(deleteClass).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('a class that cannot be resolved anywhere shows an error instead of doing nothing', async () => {
    useTrialStore.setState({ trialClasses: {} });
    const { user } = renderTab();

    await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Class' }));

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn't load this class/i));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

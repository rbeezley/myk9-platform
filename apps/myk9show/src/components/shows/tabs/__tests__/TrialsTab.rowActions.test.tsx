import { render, screen, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialsTab } from '../TrialsTab';
import type { Trial } from '@/components/trials/types/trial.types';

// MYK9-900: Setup → Trials rows get Edit / Delete that open the SAME TrialEditPanel and
// delete dialog the trial's own page uses. Managers only; the row still opens detail.

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockCanManage = true;
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: (p: string) => mockCanManage && p === 'show:manage' }),
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

const renderTab = () => render(<TrialsTab trials={trials} showId="s1" trialStats={stats} />);

describe.each(['cards', 'table'])('TrialsTab row actions (%s view)', view => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockCanManage = true;
    mockViewMode = view;
  });

  it('shows a row menu for every trial to a manager', () => {
    renderTab();
    expect(
      screen.getByRole('button', { name: 'Trial actions for Saturday Trial 1' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trial actions for Sunday Trial 2' })).toBeVisible();
  });

  it('shows no menu to an exhibitor or the public', () => {
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

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Are you sure you want to delete/)).toBeVisible();
    expect(within(dialog).getByText('Saturday Trial 1')).toBeVisible();
    expect(within(dialog).getByText(/all of its classes and entries/)).toBeVisible();
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

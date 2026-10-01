import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { TrialsTab } from '../TrialsTab';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrial } from '@/store/trial-store-types';

// MYK9-900: a completion callback from an EARLIER trial action must not clear a newer
// selection (and with it the user's edits).

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true }),
}));
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => ['cards', vi.fn()],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));

type Props = {
  currentTrial: { id: string; name: string };
  onActionFinished?: () => void;
  onTrialDeleted?: () => void;
};
const captured: Props[] = [];
vi.mock('@/components/trials/TrialDetail/TrialManagementDialogs', () => ({
  TrialManagementDialogs: (props: Props) => {
    captured.push(props);
    return <div data-testid="dialogs">{props.currentTrial.name}</div>;
  },
}));

const trial = (id: string, name: string): SyncableTrial =>
  ({
    id,
    showId: 's1',
    showName: 'Show',
    trialDate: '2026-05-09',
    trialNumber: id,
    status: 'Upcoming',
    name,
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'u',
    _syncStatus: 'synced',
  }) as SyncableTrial;

const trials = [trial('t1', 'Trial One'), trial('t2', 'Trial Two')];
const stats = {
  t1: { classCount: 1, entryCount: 0, completedClasses: 0 },
  t2: { classCount: 1, entryCount: 0, completedClasses: 0 },
};

describe('TrialsTab stale completion', () => {
  beforeEach(() => {
    captured.length = 0;
    useTrialStore.setState({ trials });
  });

  it('a late completion from an earlier action leaves the newer action mounted', async () => {
    const { user } = render(<TrialsTab trials={trials} showId="s1" trialStats={stats} />);

    // Action 1 on Trial One, then it finishes normally.
    await user.click(screen.getByRole('button', { name: 'Trial actions for Trial One' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));
    expect(await screen.findByTestId('dialogs')).toHaveTextContent('Trial One');
    const first = captured[captured.length - 1];
    act(() => first?.onActionFinished?.());
    expect(screen.queryByTestId('dialogs')).not.toBeInTheDocument();

    // Action 2 on Trial Two is now the active one.
    await user.click(screen.getByRole('button', { name: 'Trial actions for Trial Two' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Trial' }));
    expect(await screen.findByTestId('dialogs')).toHaveTextContent('Trial Two');

    // The earlier action's completion arrives late: it must be ignored.
    act(() => {
      first?.onActionFinished?.();
      first?.onTrialDeleted?.();
    });
    expect(screen.getByTestId('dialogs')).toHaveTextContent('Trial Two');
  });
});

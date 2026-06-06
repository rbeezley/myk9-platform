import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import { ResultEntryNavigation, type EntryWithResult } from './ResultEntryNavigation';

const { updateReplicatedCheckInStatusMock } = vi.hoisted(() => ({
  updateReplicatedCheckInStatusMock: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => true,
  }),
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: (...args: unknown[]) =>
    updateReplicatedCheckInStatusMock(...args),
}));

vi.mock('@/components/common/CheckInManagementOverlay', () => ({
  CheckInManagementOverlay: ({
    open,
    onUpdateStatus,
  }: {
    open: boolean;
    onUpdateStatus: (entryId: string, status: 'checked-in') => Promise<void>;
  }) =>
    open ? (
      <button type="button" onClick={() => void onUpdateStatus('entry-1', 'checked-in')}>
        Mock mark checked in
      </button>
    ) : null,
}));

vi.mock('@/components/common/CheckInStatusDialog', () => ({
  CheckInStatusDialog: () => null,
}));

const entries: EntryWithResult[] = [
  {
    id: 'entry-1',
    navigationStatus: 'pending',
    displayInfo: {
      armband: '101',
      dogName: 'Riley',
      handlerName: 'Sam Handler',
      breed: 'Mixed',
      className: 'Novice',
      jumpHeight: '',
    },
  } as EntryWithResult,
];

describe('ResultEntryNavigation check-in updates', () => {
  beforeEach(() => {
    updateReplicatedCheckInStatusMock.mockReset();
    updateReplicatedCheckInStatusMock.mockResolvedValue('mutation-1');
  });

  it('writes check-in status through the replicated check-in helper', async () => {
    const { user } = render(
      <ResultEntryNavigation
        entries={entries}
        classInfo={{
          element: 'Scent Work',
          level: 'Novice',
          judge: 'Judge One',
          totalEntries: 1,
        }}
        onSelectEntry={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Manage Check-In' }));
    await user.click(screen.getByRole('button', { name: 'Mock mark checked in' }));

    expect(updateReplicatedCheckInStatusMock).toHaveBeenCalledWith('entry-1', 'checked-in');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import type { CheckInStatus } from '@myk9/core';
import type { EntryWithResult } from './ResultEntryNavigation';
import { ResultEntryNavigation } from './ResultEntryNavigation';

const updateReplicatedCheckInStatus = vi.fn<
  (entryId: string, status: CheckInStatus) => Promise<string | null>
>(() => Promise.resolve('mutation-1'));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => true,
  }),
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: (entryId: string, status: CheckInStatus) =>
    updateReplicatedCheckInStatus(entryId, status),
}));

vi.mock('@/components/common/CheckInStatusDialog', () => ({
  CheckInStatusDialog: () => null,
}));

vi.mock('@/components/common/CheckInManagementOverlay', () => ({
  CheckInManagementOverlay: ({
    open,
    onUpdateStatus,
  }: {
    open: boolean;
    onUpdateStatus: (entryId: string, status: CheckInStatus) => Promise<void>;
  }) =>
    open ? (
      <button type="button" onClick={() => onUpdateStatus('entry-1', 'checked-in')}>
        Mock Check In
      </button>
    ) : null,
}));

function makeEntry(): EntryWithResult {
  return {
    id: 'entry-1',
    navigationStatus: 'pending',
    checkInStatus: 'no-status',
    displayInfo: {
      armband: '101',
      dogName: 'Fido',
      handlerName: 'Jane Handler',
      breed: 'Beagle',
    },
  } as EntryWithResult;
}

describe('ResultEntryNavigation', () => {
  beforeEach(() => {
    updateReplicatedCheckInStatus.mockClear();
  });

  it('updates check-in status through the replicated check-in writer', async () => {
    const { user } = render(
      <ResultEntryNavigation
        entries={[makeEntry()]}
        classInfo={{
          element: 'Interior',
          level: 'Novice',
          judge: 'Judge A',
          totalEntries: 1,
        }}
        onSelectEntry={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /manage check-in/i }));
    await user.click(screen.getByRole('button', { name: /mock check in/i }));

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
  });
});

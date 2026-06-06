import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
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
      <button type="button" onClick={() => onUpdateStatus('entry-1', 'at-gate')}>
        Send to gate
      </button>
    ) : null,
}));

function makeEntry(): EntryWithResult {
  return {
    id: 'entry-1',
    dogId: 'dog-1',
    classId: 'class-1',
    showId: 'show-1',
    status: 'checked-in',
    registrationData: {
      submittedAt: new Date('2026-05-18T12:00:00.000Z'),
      handler: 'Jane Handler',
      handlerId: 'handler-1',
      entryFee: 35,
      paymentStatus: 'paid',
    },
    statusHistory: [],
    classConfig: {
      element: 'Container',
      level: 'Novice',
      timeLimit: 120000,
      warningsEnabled: true,
    },
    displayInfo: {
      armband: '101',
      dogName: 'Piper',
      dogBreed: 'Beagle',
      handlerName: 'Jane Handler',
      dogId: 'dog-1',
      handlerId: 'handler-1',
    },
    navigationStatus: 'pending',
    checkInStatus: 'checked-in',
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
          element: 'Container',
          level: 'Novice',
          judge: 'Judge One',
          totalEntries: 1,
        }}
        onSelectEntry={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /manage check-in/i }));
    await user.click(screen.getByRole('button', { name: /send to gate/i }));

    expect(updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'at-gate');
  });
});

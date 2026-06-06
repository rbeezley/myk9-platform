import { describe, expect, it, vi } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import { ResultEntryNavigation, type EntryWithResult } from './ResultEntryNavigation';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import type { CheckInStatus } from '@myk9/core';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => true,
  }),
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/common/CheckInManagementOverlay', () => ({
  CheckInManagementOverlay: ({
    open,
    entries,
    onUpdateStatus,
  }: {
    open: boolean;
    entries: Array<{ id: string }>;
    onUpdateStatus: (entryId: string, status: CheckInStatus) => Promise<void>;
  }) =>
    open ? (
      <button type="button" onClick={() => onUpdateStatus(entries[0].id, 'at-gate')}>
        Send to gate
      </button>
    ) : null,
}));

const entry = {
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

describe('ResultEntryNavigation', () => {
  it('updates check-in status through the replicated show-day helper', async () => {
    const { user } = render(
      <ResultEntryNavigation
        entries={[entry]}
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

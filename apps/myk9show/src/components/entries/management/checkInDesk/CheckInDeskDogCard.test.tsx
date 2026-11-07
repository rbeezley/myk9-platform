import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@myk9/core';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { CheckInDesk } from './CheckInDesk';

const h = vi.hoisted(() => ({ updateReplicatedCheckInStatus: vi.fn() }));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: h.updateReplicatedCheckInStatus,
}));

vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => ({
    readPending: false,
    readFailed: false,
    retry: vi.fn(),
    trials: [
      {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Trial 1',
        trialNumber: '1',
        trialDate: '2026-07-08',
        timezone: 'America/New_York',
      },
    ],
    trialClasses: {
      'trial-1': [
        { id: 'class-1', element: 'Container', level: 'Novice', section: 'A', startTime: '09:00' },
      ],
    },
  }),
}));

const NOW = new Date('2026-07-08T16:00:00.000Z');

function poppy(checkInStatus: CheckInStatus): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '114',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Poppy',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    handlerId: 'person-1',
    ownerId: 'person-1',
    classes: [
      {
        id: 'entry-1',
        classId: 'class-1',
        name: 'Container Novice A',
        number: '1',
        fee: 25,
        status: 'entered',
        checkInStatus,
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: NOW,
    lastUpdated: NOW,
    armbandNumber: '114',
  };
}

const props = { showId: 'show-1', loading: false, unknown: false, onRetry: vi.fn() };

describe('CheckInDeskDogCard (MYK9-1736 review)', () => {
  beforeEach(() => {
    h.updateReplicatedCheckInStatus.mockReset();
    h.updateReplicatedCheckInStatus.mockResolvedValue(null);
  });

  it('closes the picker, writing nothing, when ringside takes the class while it is open', async () => {
    const { user, rerender } = render(
      <CheckInDesk {...props} currentDate={NOW} entries={[poppy('checked-in')]} />
    );
    await user.click(screen.getByRole('button', { name: /^Change status for Poppy/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    rerender(<CheckInDesk {...props} currentDate={NOW} entries={[poppy('in-ring')]} />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('article', { name: 'Poppy' })).toHaveTextContent('In Ring');
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('shows a failed change on the dog’s own card', async () => {
    h.updateReplicatedCheckInStatus.mockRejectedValue(new Error('offline'));
    const { user } = render(
      <CheckInDesk {...props} currentDate={NOW} entries={[poppy('no-status')]} />
    );
    await user.click(screen.getByRole('button', { name: /^Change status for Poppy/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /Conflict/ })
    );

    const card = screen.getByRole('article', { name: 'Poppy' });
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      "Couldn't update Poppy, Container Novice A. Try again."
    );
  });
});

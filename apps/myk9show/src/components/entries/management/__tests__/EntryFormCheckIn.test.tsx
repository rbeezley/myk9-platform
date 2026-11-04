import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { getStatusDescriptor } from '@/components/status';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';
import { EntryFocusedRegistration } from '../EntryFocusedRegistration';

const h = vi.hoisted(() => ({
  updateReplicatedCheckInStatus: vi.fn(),
  schedule: { readPending: false, readFailed: false, retry: vi.fn() },
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: h.updateReplicatedCheckInStatus,
}));

vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => ({
    ...h.schedule,
    trials: [
      {
        id: 'trial-1',
        showId: 'show-1',
        showName: 'Spring Specialty',
        name: 'Trial 1',
        trialNumber: '1',
        trialDate: '2026-07-08',
        timezone: 'America/New_York',
        status: 'scheduled',
      },
    ],
    trialClasses: {
      'trial-1': [
        { id: 'class-1', element: 'Container', level: 'Novice', section: 'A', startTime: '09:00' },
        { id: 'class-2', element: 'Interior', level: 'Novice', section: 'A', startTime: '10:30' },
        { id: 'class-3', element: 'Exterior', level: 'Novice', section: 'A', startTime: '11:30' },
      ],
    },
  }),
}));

const SHOW_DAY = new Date('2026-07-08T16:00:00.000Z');
const NOT_SHOW_DAY = new Date('2026-07-07T16:00:00.000Z');

function entry(
  id: string,
  dogName: string,
  classId: string,
  overrides: Partial<EntryManagementEntry> = {}
): EntryManagementEntry {
  return {
    id,
    registrationId: 'registration-1',
    entryNumber: id,
    armbandNumber: `20${id.slice(-1)}`,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName,
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    classes: [
      {
        id: `class-entry-${id}`,
        classId,
        name: 'Class',
        number: id,
        fee: 25,
        status: 'entered',
        checkInStatus: 'no-status',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-07-01T13:42:00Z'),
    lastUpdated: new Date('2026-07-01T13:42:00Z'),
    confirmationNumber: 'MYK9-1001',
    ...overrides,
  };
}

function renderForm(entries: EntryManagementEntry[]) {
  const registration = groupEntriesByShowRegistration(entries)[0]!;
  return render(
    <EntryFocusedRegistration
      registration={registration}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      onBulkStatusChange={vi.fn()}
      paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-07-08' }}
      showCheckInStatus={false}
    />
  );
}

const twoEntries = () => [
  entry('entry-1', 'Poppy', 'class-1'),
  entry('entry-2', 'Bean', 'class-2'),
];

describe('check-in on the entry form (MYK9-1691)', () => {
  beforeEach(() => {
    h.updateReplicatedCheckInStatus.mockReset().mockResolvedValue(undefined);
    h.schedule.readFailed = false;
    h.schedule.retry.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SHOW_DAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "N runs to check in" on a show day and checks all of them in', async () => {
    const { user } = renderForm(twoEntries());
    const checklist = screen.getByRole('region', { name: 'To finish this form' });
    expect(within(checklist).getByText('2 runs to check in')).toBeInTheDocument();

    await user.click(within(checklist).getByRole('button', { name: 'Check in all' }));

    await waitFor(() => expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(2));
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-2', 'checked-in');
    // The count drops with the check-in and each row now reads checked in.
    await waitFor(() => expect(screen.queryByText(/to check in$/)).not.toBeInTheDocument());
    expect(screen.getAllByText(getStatusDescriptor('entry', 'checked-in').label)).toHaveLength(2);
  });

  it('checks in one entry from its row menu and leaves the other for the checklist', async () => {
    const { user } = renderForm(twoEntries());

    await user.click(screen.getByRole('button', { name: 'Actions for Poppy' }));
    await user.click(await screen.findByRole('menuitem', { name: /Check in/ }));

    await waitFor(() => expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(1));
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(await screen.findByText('1 run to check in')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions for Poppy' }));
    expect(screen.queryByRole('menuitem', { name: /Check in/ })).not.toBeInTheDocument();
  });

  it('leaves out entries the Check-in desk would not check in', () => {
    renderForm([
      entry('entry-1', 'Poppy', 'class-1'),
      entry('entry-2', 'Bean', 'class-2', { entryStatus: EntryStatus.PENDING }),
      entry('entry-3', 'Maple', 'class-3', {
        classes: [
          {
            id: 'class-entry-entry-3',
            classId: 'class-3',
            name: 'Class',
            number: '3',
            fee: 25,
            status: 'entered',
            checkInStatus: 'checked-in',
          },
        ],
      }),
    ]);
    const checklist = screen.getByRole('region', { name: 'To finish this form' });
    expect(within(checklist).getByText('1 run to check in')).toBeInTheDocument();
    expect(within(checklist).getByText('Poppy')).toBeInTheDocument();
  });

  it('offers no check-in when it is not a show day', async () => {
    vi.setSystemTime(NOT_SHOW_DAY);
    const { user } = renderForm(twoEntries());
    expect(screen.queryByText(/to check in/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check in all' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions for Poppy' }));
    await screen.findByRole('menuitem', { name: /Edit entry|Remove entry/ });
    expect(screen.queryByRole('menuitem', { name: /Check in/ })).not.toBeInTheDocument();
  });

  it('leaves out runs already at the gate, called to the gate or in the ring', () => {
    const underway = (
      id: string,
      dog: string,
      classId: string,
      status: 'at-gate' | 'come-to-gate' | 'in-ring'
    ) =>
      entry(id, dog, classId, {
        classes: [
          {
            id: `class-entry-${id}`,
            classId,
            name: 'Class',
            number: id,
            fee: 25,
            status: 'entered',
            checkInStatus: status,
          },
        ],
      });
    renderForm([
      entry('entry-1', 'Poppy', 'class-1'),
      underway('entry-2', 'Bean', 'class-2', 'at-gate'),
      underway('entry-3', 'Maple', 'class-3', 'in-ring'),
      underway('entry-4', 'Fern', 'class-1', 'come-to-gate'),
    ]);
    const checklist = screen.getByRole('region', { name: 'To finish this form' });
    expect(within(checklist).getByText('1 run to check in')).toBeInTheDocument();
  });

  it('says so, with a retry, when the schedule cannot be read, never "All set"', async () => {
    h.schedule.readFailed = true;
    const { user } = renderForm(twoEntries());
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the show schedule");
    expect(screen.queryByText('All set.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.schedule.retry).toHaveBeenCalledTimes(1);
  });
});

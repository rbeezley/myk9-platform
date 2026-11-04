import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { CheckInDesk } from './CheckInDesk';
import { buildCheckInDeskClasses } from './checkInDeskModel';
import type { Trial } from '@/components/trials/types/trial.types';

const h = vi.hoisted(() => ({
  schedule: { readPending: false, readFailed: false, retry: vi.fn() },
  updateReplicatedCheckInStatus: vi.fn(),
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
      ],
    },
  }),
}));

const NOW = new Date('2026-07-08T16:00:00.000Z');

function entry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
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
    handlerAuthUserId: 'auth-1',
    ownerId: 'person-1',
    ownerAuthUserId: 'auth-1',
    classes: [
      {
        id: 'entry-1',
        classId: 'class-1',
        name: 'Container Novice A',
        number: '1',
        fee: 25,
        status: 'entered',
        checkInStatus: 'no-status',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-07-08T09:00:00.000Z'),
    lastUpdated: new Date('2026-07-08T09:00:00.000Z'),
    armbandNumber: '114',
    ...overrides,
  };
}

function bea(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  const base = entry();
  return entry({
    id: 'entry-2',
    dogId: 'dog-2',
    dogName: 'Biscuit',
    ownerName: 'Bea Handler',
    handlerName: 'Bea Handler',
    handlerId: 'person-2',
    handlerAuthUserId: 'auth-2',
    ownerId: 'person-2',
    ownerAuthUserId: 'auth-2',
    armbandNumber: '208',
    entryNumber: '208',
    classes: [
      {
        ...base.classes[0]!,
        id: 'entry-2',
        classId: 'class-2',
        name: 'Interior Novice A',
        checkInStatus: 'checked-in',
      },
    ],
    ...overrides,
  });
}

function Probe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderDesk(entries: EntryManagementEntry[], route = '/shows/show-1/entries') {
  return render(
    <>
      <CheckInDesk
        showId="show-1"
        entries={entries}
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        currentDate={NOW}
      />
      <Probe />
    </>,
    { initialRoute: route }
  );
}

describe('CheckInDesk', () => {
  beforeEach(() => {
    h.schedule.readFailed = false;
    h.schedule.readPending = false;
    h.schedule.retry.mockReset();
    h.updateReplicatedCheckInStatus.mockReset();
    h.updateReplicatedCheckInStatus.mockResolvedValue(null);
  });

  it('lists everyone with armband, trial, time and check-in state per entry', () => {
    renderDesk([entry(), bea()]);

    const alice = screen.getByRole('region', { name: 'Alice Martin' });
    expect(alice).toHaveTextContent('114');
    expect(alice).toHaveTextContent('Poppy');
    expect(alice).toHaveTextContent('Trial 1');
    expect(alice).toHaveTextContent('9:00');
    expect(alice).toHaveTextContent('Not checked in');
    const beaRow = screen.getByRole('region', { name: 'Bea Handler' });
    expect(beaRow).toHaveTextContent('208');
    expect(beaRow).toHaveTextContent('Checked-in');
  });

  it('puts focus in the search box on open', () => {
    renderDesk([entry()]);
    expect(screen.getByPlaceholderText('Search name, dog, armband')).toHaveFocus();
  });

  it('searches by name, dog and armband', async () => {
    const { user } = renderDesk([entry(), bea()]);
    const box = screen.getByPlaceholderText('Search name, dog, armband');

    await user.type(box, 'biscuit');
    expect(screen.queryByRole('region', { name: 'Alice Martin' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bea Handler' })).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, '114');
    expect(screen.getByRole('region', { name: 'Alice Martin' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bea Handler' })).not.toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'martin');
    expect(screen.getByRole('region', { name: 'Alice Martin' })).toBeInTheDocument();
  });

  it('checks in one entry through the replicated path', async () => {
    const { user } = renderDesk([entry()]);

    await user.click(screen.getByRole('button', { name: 'Check in Poppy, Container Novice A' }));

    await waitFor(() =>
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in')
    );
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Check in Poppy/ })).not.toBeInTheDocument()
    );
  });

  it('checks in all eligible entries for one person and skips the ineligible', async () => {
    const second = entry({
      id: 'entry-3',
      dogId: 'dog-3',
      dogName: 'Pip',
      armbandNumber: '116',
      classes: [{ ...entry().classes[0]!, id: 'entry-3', classId: 'class-2' }],
    });
    const waitlisted = entry({
      id: 'entry-4',
      dogId: 'dog-4',
      dogName: 'Wren',
      armbandNumber: '117',
      entryStatus: EntryStatus.WAITLIST,
      classes: [{ ...entry().classes[0]!, id: 'entry-4', classId: 'class-2' }],
    });
    const { user } = renderDesk([entry(), second, waitlisted]);

    await user.click(screen.getByRole('button', { name: 'Check in all eligible' }));

    await waitFor(() => expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(2));
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-3', 'checked-in');
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalledWith('entry-4', 'checked-in');
  });

  it('reports a failed check-in instead of marking the entry done', async () => {
    h.updateReplicatedCheckInStatus.mockRejectedValue(new Error('boom'));
    const { user } = renderDesk([entry()]);

    await user.click(screen.getByRole('button', { name: 'Check in Poppy, Container Novice A' }));

    expect(await screen.findByText("Couldn't check in Alice Martin. Try again.")).toBeVisible();
    expect(screen.getByRole('button', { name: /^Check in Poppy/ })).toBeEnabled();
  });

  it('opens on the not-checked-in filter from the URL and writes it back', async () => {
    const { user } = renderDesk([entry(), bea()], '/shows/show-1/entries?checkin=pending');

    expect(screen.getByRole('region', { name: 'Alice Martin' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bea Handler' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show all/i }));
    expect(screen.getByRole('region', { name: 'Bea Handler' })).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).not.toContain('checkin');
  });

  it('offers a schedule retry instead of treating an unread schedule as settled', async () => {
    h.schedule.readFailed = true;
    const { user } = renderDesk([entry()]);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.schedule.retry).toHaveBeenCalledTimes(1);
  });

  it('lets refreshed data win over the local check-in once the entry is pulled', async () => {
    const { user, rerender } = renderDesk([entry()]);
    await user.click(screen.getByRole('button', { name: 'Check in Poppy, Container Novice A' }));
    await waitFor(() => expect(h.updateReplicatedCheckInStatus).toHaveBeenCalled());
    const pulled = entry({ classes: [{ ...entry().classes[0]!, checkInStatus: 'pulled' }] });
    rerender(
      <CheckInDesk
        showId="show-1"
        entries={[pulled]}
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        currentDate={NOW}
      />
    );
    expect(screen.getByRole('region', { name: 'Alice Martin' })).toHaveTextContent('Not active');
  });

  it('re-reads the entries after a check-in and drops its local flip once the read lands', async () => {
    let finishRefresh: () => void = () => {};
    const onRefreshEntries = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishRefresh = resolve;
        })
    );
    const props = {
      showId: 'show-1',
      loading: false,
      unknown: false,
      onRetry: vi.fn(),
      onRefreshEntries,
      currentDate: NOW,
    };
    const { user, rerender } = render(<CheckInDesk {...props} entries={[entry()]} />);
    await user.click(screen.getByRole('button', { name: 'Check in Poppy, Container Novice A' }));

    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalledTimes(1));
    // Optimistic flip holds while the read is in flight.
    expect(screen.getByRole('region', { name: 'Alice Martin' })).toHaveTextContent('Checked-in');

    // A later ringside status in the shared entries is never masked by the flip, even before the
    // read promise settles.
    const inRing = entry({ classes: [{ ...entry().classes[0]!, checkInStatus: 'in-ring' }] });
    rerender(<CheckInDesk {...props} entries={[inRing]} />);
    expect(screen.getByRole('region', { name: 'Alice Martin' })).not.toHaveTextContent(
      'Checked-in'
    );
    const pulled = entry({ classes: [{ ...entry().classes[0]!, checkInStatus: 'pulled' }] });
    rerender(<CheckInDesk {...props} entries={[pulled]} />);
    expect(screen.getByRole('region', { name: 'Alice Martin' })).toHaveTextContent('Not active');

    // Once the read lands the flip is gone and the shared entries speak alone.
    finishRefresh();
    rerender(<CheckInDesk {...props} entries={[entry()]} />);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Alice Martin' })).toHaveTextContent(
        'Not checked in'
      )
    );
  });
});

describe('buildCheckInDeskClasses', () => {
  it('carries a stored class name into the roster projection', () => {
    const trial: Trial = {
      id: 'trial-1',
      showId: 'show-1',
      showName: 'Spring Specialty',
      name: 'Trial 1',
      trialNumber: '1',
      trialDate: '2026-07-08',
      timezone: 'America/New_York',
      status: 'Scheduled',
    };
    const classes = buildCheckInDeskClasses([trial], {
      'trial-1': [
        {
          id: 'class-1',
          name: 'Container Novice A Stake',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          startTime: '09:00',
        },
      ],
    });
    expect(classes[0]?.name).toBe('Container Novice A Stake');
  });
});

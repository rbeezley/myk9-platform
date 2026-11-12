import { screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@myk9/core';
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

/** Poppy's second class today, on its own entry row (one row per class). */
function poppyInterior(): EntryManagementEntry {
  return entry({
    id: 'entry-3',
    classes: [
      {
        ...entry().classes[0]!,
        id: 'entry-3',
        classId: 'class-2',
        name: 'Interior Novice A',
      },
    ],
  });
}

function Probe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

/**
 * A page standing in for the replica: the entries it hands the desk are the initial ones with
 * every stored check-in write applied, picked up when the desk asks for a re-read.
 */
function StoredEntriesDesk({ initial }: { initial: EntryManagementEntry[] }) {
  const read = () =>
    initial.map(entry => {
      const written = h.updateReplicatedCheckInStatus.mock.calls
        .filter(([entryId]) => entryId === entry.id)
        .map(([, status]) => status as CheckInStatus);
      const latest = written[written.length - 1];
      return latest
        ? { ...entry, classes: entry.classes.map(cls => ({ ...cls, checkInStatus: latest })) }
        : entry;
    });
  const [entries, setEntries] = useState(initial);
  return (
    <CheckInDesk
      showId="show-1"
      entries={entries}
      loading={false}
      unknown={false}
      onRetry={vi.fn()}
      onRefreshEntries={() => setEntries(read())}
      currentDate={NOW}
    />
  );
}

function renderDesk(entries: EntryManagementEntry[], route = '/shows/show-1/entries') {
  return render(
    <>
      <StoredEntriesDesk initial={entries} />
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

  it('checks a dog in with one tap through the replicated path', async () => {
    const { user } = renderDesk([entry()]);

    await user.click(screen.getByRole('button', { name: 'Check in Poppy' }));

    await waitFor(() =>
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in')
    );
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Check in Poppy' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('article', { name: 'Poppy' })).toHaveTextContent('Checked in');
  });

  it('checks a dog in to every class waiting today with one tap, on one card', async () => {
    const { user } = renderDesk([entry(), poppyInterior()]);

    expect(screen.getAllByRole('article', { name: 'Poppy' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Check in Poppy' }));

    await waitFor(() => expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(2));
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-3', 'checked-in');
  });

  it('offers Check in all only when two or more of the person’s dogs are waiting', () => {
    renderDesk([entry(), poppyInterior()]);
    expect(screen.queryByRole('button', { name: /Check in all/ })).not.toBeInTheDocument();
  });

  it('marks one class Conflict from its status, and one tap then skips that class', async () => {
    const { user } = renderDesk([entry(), poppyInterior()]);

    await user.click(
      screen.getByRole('button', {
        name: 'Change status for Poppy, Interior Novice A: Not checked in',
      })
    );
    const dialog = await screen.findByRole('dialog');
    // Every staff check-in status (MYK9-1749); In Ring and Completed stay with the judge.
    const choices = within(dialog)
      .getAllByRole('button')
      .map(button => button.textContent ?? '');
    for (const label of [
      'Not checked in',
      'Checked-in',
      'Conflict',
      'Pulled',
      'At Gate',
      'Come to Gate',
    ]) {
      expect(choices.some(text => text.startsWith(label))).toBe(true);
    }
    expect(dialog).not.toHaveTextContent(/In Ring|Completed/);
    await user.click(within(dialog).getByRole('button', { name: /Conflict/ }));

    await waitFor(() =>
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-3', 'conflict')
    );
    expect(
      await screen.findByRole('button', {
        name: 'Change status for Poppy, Interior Novice A: Conflict',
      })
    ).toBeInTheDocument();

    h.updateReplicatedCheckInStatus.mockClear();
    await user.click(screen.getByRole('button', { name: 'Check in Poppy' }));
    await waitFor(() => expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(1));
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
  });

  it('undoes a check-in on one class back to Not checked in', async () => {
    const checkedIn = entry({ classes: [{ ...entry().classes[0]!, checkInStatus: 'checked-in' }] });
    const { user } = renderDesk([checkedIn]);

    await user.click(
      screen.getByRole('button', {
        name: 'Change status for Poppy, Container Novice A: Checked-in',
      })
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Not checked in/ }));

    await waitFor(() =>
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'no-status')
    );
    expect(await screen.findByRole('button', { name: 'Check in Poppy' })).toBeEnabled();
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

    await user.click(screen.getByRole('button', { name: 'Check in all 2 dogs' }));

    await waitFor(() => expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(2));
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-3', 'checked-in');
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalledWith('entry-4', 'checked-in');
  });

  it('reports a failed check-in instead of marking the entry done', async () => {
    h.updateReplicatedCheckInStatus.mockRejectedValue(new Error('boom'));
    const { user } = renderDesk([entry()]);

    await user.click(screen.getByRole('button', { name: 'Check in Poppy' }));

    expect(await screen.findByText("Couldn't check in Poppy. Try again.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check in Poppy' })).toBeEnabled();
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
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.schedule.retry).toHaveBeenCalledTimes(1);
  });

  it('lets refreshed data win over the local check-in once the entry is pulled', async () => {
    const { user, rerender } = renderDesk([entry()]);
    await user.click(screen.getByRole('button', { name: 'Check in Poppy' }));
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
    expect(screen.getByRole('region', { name: 'Alice Martin' })).toHaveTextContent(
      'Flagged pulled'
    );
  });

  it('frees the dog as soon as the write is stored, even when the entries re-read never settles (MYK9-1812)', async () => {
    const onRefreshEntries = vi.fn(() => new Promise<void>(() => {}));
    const { user } = render(
      <CheckInDesk
        showId="show-1"
        entries={[entry()]}
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        onRefreshEntries={onRefreshEntries}
        currentDate={NOW}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Check in Poppy' }));

    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalledTimes(1));
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    // The write is stored, so the control is usable again while the read is still pending.
    expect(await screen.findByRole('button', { name: 'Check in Poppy' })).toBeEnabled();
  });

  it('shows the shared entries alone: an older read-back never hides a newer status', async () => {
    let finishFirst: () => void = () => {};
    const onRefreshEntries = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishFirst = resolve;
          })
      )
      .mockResolvedValue(undefined);
    const props = {
      showId: 'show-1',
      loading: false,
      unknown: false,
      onRetry: vi.fn(),
      onRefreshEntries,
      currentDate: NOW,
    };
    const withStatus = (checkInStatus: 'no-status' | 'checked-in' | 'conflict') =>
      entry({ classes: [{ ...entry().classes[0]!, checkInStatus }] });
    const region = () => screen.getByRole('region', { name: 'Alice Martin' });
    const { user, rerender } = render(
      <CheckInDesk {...props} entries={[withStatus('no-status')]} />
    );

    // First write: the re-read is still pending.
    await user.click(screen.getByRole('button', { name: 'Check in Poppy' }));
    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalledTimes(1));
    // The older read-back (nothing stored yet) is shown for what it is, with no local flip over it.
    rerender(<CheckInDesk {...props} entries={[withStatus('no-status')]} />);
    expect(region()).toHaveTextContent('Not checked in');

    // The newer status arrives while the first re-read is still unsettled; it is shown, and the
    // first re-read settling afterwards changes nothing.
    rerender(<CheckInDesk {...props} entries={[withStatus('conflict')]} />);
    finishFirst();
    expect(region()).toHaveTextContent('Conflict');
    expect(region()).not.toHaveTextContent(/Checked-in|Not checked in/);
  });
});

describe('CheckInDesk — runs already underway (MYK9-1690)', () => {
  const props = {
    showId: 'show-1',
    loading: false,
    unknown: false,
    onRetry: vi.fn(),
    currentDate: NOW,
  };
  const at = (id: string, classId: string, checkInStatus: 'no-status' | 'at-gate' | 'in-ring') =>
    entry({
      id,
      classes: [{ ...entry().classes[0]!, id, classId, checkInStatus }],
    });

  beforeEach(() => {
    // The schedule mock is shared module state; a prior test (shuffled order) may leave it failed.
    h.schedule.readFailed = false;
    h.schedule.readPending = false;
    h.schedule.retry.mockReset();
    h.updateReplicatedCheckInStatus.mockReset();
    h.updateReplicatedCheckInStatus.mockResolvedValue(null);
  });

  it.each([
    ['at-gate', 'At Gate', true],
    ['in-ring', 'In Ring', false],
  ] as const)(
    'shows a %s run as %s with no Check in button (changeable: %s)',
    (status, label, changeable) => {
      render(<CheckInDesk {...props} entries={[at('entry-1', 'class-1', status)]} />);
      const region = screen.getByRole('region', { name: 'Alice Martin' });
      expect(region).toHaveTextContent(label);
      expect(region).not.toHaveTextContent('Not checked in');
      expect(screen.queryByRole('button', { name: /^Check in Poppy/ })).not.toBeInTheDocument();
      // Staff may move a dog at the gate (MYK9-1749); a run in the ring is the judge's.
      expect(screen.queryAllByRole('button', { name: /^Change status/ })).toHaveLength(
        changeable ? 1 : 0
      );
    }
  );

  it('leaves an underway run out of the one-tap check-in', async () => {
    const { user } = render(
      <CheckInDesk
        {...props}
        entries={[at('entry-1', 'class-1', 'at-gate'), at('entry-3', 'class-2', 'no-status')]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Check in Poppy' }));

    await waitFor(() => expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(1));
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-3', 'checked-in');
    expect(screen.getByRole('region', { name: 'Alice Martin' })).toHaveTextContent('At Gate');
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

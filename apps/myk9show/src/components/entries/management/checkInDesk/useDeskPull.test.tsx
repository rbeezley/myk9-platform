import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { CheckInDesk } from './CheckInDesk';

const h = vi.hoisted(() => ({
  updateReplicatedCheckInStatus: vi.fn(),
  scratchShowMapEntry: vi.fn(),
  undoShowMapScratch: vi.fn(),
  showUndoToast: vi.fn(),
  changeSecretaryEntryStatus: vi.fn(),
}));

vi.mock('@/services/database/entries/lifecycle', () => ({
  changeSecretaryEntryStatus: h.changeSecretaryEntryStatus,
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: h.updateReplicatedCheckInStatus,
}));
vi.mock('@/features/show-map/showMapActionMutations', () => ({
  scratchShowMapEntry: h.scratchShowMapEntry,
  undoShowMapScratch: h.undoShowMapScratch,
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: h.showUndoToast }));
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

const poppy: EntryManagementEntry = {
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
      checkInStatus: 'checked-in',
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

async function choosePulled(user: ReturnType<typeof render>['user']) {
  await user.click(screen.getByRole('button', { name: /^Change status for Poppy/ }));
  const picker = await screen.findByRole('dialog');
  await user.click(within(picker).getByRole('button', { name: /^Pulled/ }));
}

describe('Pulled on the Check-in desk is the real Pull (MYK9-1749)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.scratchShowMapEntry.mockResolvedValue({
      entryId: 'entry-1',
      previousEntryStatus: 'accepted',
    });
    h.undoShowMapScratch.mockResolvedValue(undefined);
  });

  it('asks first, then pulls through the shared Pull and offers Undo', async () => {
    const onRefreshEntries = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <CheckInDesk
        showId="show-1"
        entries={[poppy]}
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        onRefreshEntries={onRefreshEntries}
        currentDate={NOW}
      />
    );
    await choosePulled(user);

    const confirm = await screen.findByRole('dialog', { name: 'Pull Poppy?' });
    expect(confirm).toHaveTextContent('Refunds are not automatic');
    // Nothing is written until the secretary confirms; the check-in path is never used for it.
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(h.scratchShowMapEntry).toHaveBeenCalledWith(
        'entry-1',
        undefined,
        'Pulled at the check-in desk'
      )
    );
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
    await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(1));
    expect(onRefreshEntries).toHaveBeenCalled();

    h.showUndoToast.mock.calls[0]![0].onUndo();
    await waitFor(() =>
      expect(h.undoShowMapScratch).toHaveBeenCalledWith({
        entryId: 'entry-1',
        previousEntryStatus: 'accepted',
      })
    );
  });

  it('writes nothing when the secretary cancels', async () => {
    const { user } = render(
      <CheckInDesk
        showId="show-1"
        entries={[poppy]}
        loading={false}
        unknown={false}
        onRetry={vi.fn()}
        currentDate={NOW}
      />
    );
    await choosePulled(user);
    const confirm = await screen.findByRole('dialog', { name: 'Pull Poppy?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Pull Poppy?' })).not.toBeInTheDocument()
    );
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('closes, writing nothing, when ringside takes the dog while the Pull is being confirmed', async () => {
    const props = {
      showId: 'show-1',
      loading: false,
      unknown: false,
      onRetry: vi.fn(),
      currentDate: NOW,
    };
    const { user, rerender } = render(<CheckInDesk {...props} entries={[poppy]} />);
    await choosePulled(user);
    expect(await screen.findByRole('dialog', { name: 'Pull Poppy?' })).toBeInTheDocument();

    const inRing: EntryManagementEntry = {
      ...poppy,
      classes: [{ ...poppy.classes[0]!, checkInStatus: 'in-ring' }],
    };
    rerender(<CheckInDesk {...props} entries={[inRing]} />);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Pull Poppy?' })).not.toBeInTheDocument()
    );
    // Put back: the confirmation does not reopen on its own.
    rerender(<CheckInDesk {...props} entries={[poppy]} />);
    expect(screen.queryByRole('dialog', { name: 'Pull Poppy?' })).not.toBeInTheDocument();
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
  });
});

describe('Putting a pulled class back from the desk (MYK9-1749)', () => {
  const pulledPoppy: EntryManagementEntry = {
    ...poppy,
    entryStatus: EntryStatus.SCRATCHED,
    classes: [{ ...poppy.classes[0]!, status: 'scratched', checkInStatus: 'pulled' }],
  };
  const props = { showId: 'show-1', loading: false, unknown: false, onRetry: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    h.changeSecretaryEntryStatus.mockResolvedValue({});
  });

  it('asks first, then puts the entry back with Entries’ own Accept', async () => {
    const { user } = render(<CheckInDesk {...props} currentDate={NOW} entries={[pulledPoppy]} />);
    await user.click(screen.getByRole('button', { name: /^Change status for Poppy/ }));

    const confirm = await screen.findByRole('alertdialog', { name: 'Put Poppy back?' });
    expect(h.changeSecretaryEntryStatus).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Put back' }));

    await waitFor(() => expect(h.changeSecretaryEntryStatus).toHaveBeenCalledTimes(1));
    expect(h.changeSecretaryEntryStatus.mock.calls[0]![0]).toMatchObject({
      entry: { id: 'entry-1' },
      newStatus: EntryStatus.ACCEPTED,
    });
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('offers no way back once a refund is decided', () => {
    render(
      <CheckInDesk
        {...props}
        currentDate={NOW}
        entries={[{ ...pulledPoppy, refundDecision: 'denied' }]}
      />
    );
    expect(screen.getByRole('article', { name: 'Poppy' })).toHaveTextContent(
      'Pulled · refund decided'
    );
    expect(screen.queryByRole('button', { name: /^Change status/ })).not.toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@myk9/core';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { CheckInDesk } from './CheckInDesk';

const h = vi.hoisted(() => ({
  updateReplicatedCheckInStatus: vi.fn(),
  scratchShowMapEntry: vi.fn(),
  undoShowMapScratch: vi.fn(),
  showUndoToast: vi.fn(),
  getFlaggedPullSources: vi.fn(),
  clearFlaggedPull: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));
vi.mock('@/services/database/entries/flaggedPull', () => ({
  getFlaggedPullSources: h.getFlaggedPullSources,
  clearFlaggedPull: h.clearFlaggedPull,
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

function poppy(
  checkInStatus: CheckInStatus,
  overrides: Partial<EntryManagementEntry> = {}
): EntryManagementEntry {
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
    ...overrides,
  };
}

const props = {
  showId: 'show-1',
  loading: false,
  unknown: false,
  onRetry: vi.fn(),
  currentDate: NOW,
};

describe('a flagged pull on the Check-in desk (MYK9-1753)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getFlaggedPullSources.mockResolvedValue(new Map([['entry-1', 'exhibitor']]));
    h.clearFlaggedPull.mockResolvedValue('checked-in');
    h.scratchShowMapEntry.mockResolvedValue({
      entryId: 'entry-1',
      previousEntryStatus: 'accepted',
    });
  });

  it.each([
    ['exhibitor', 'The exhibitor flagged this pull.'],
    ['staff', 'Ringside staff flagged this pull.'],
  ] as const)('says who flagged it (%s)', async (source, text) => {
    h.getFlaggedPullSources.mockResolvedValue(new Map([['entry-1', source]]));
    render(<CheckInDesk {...props} entries={[poppy('pulled')]} />);

    const card = screen.getByRole('article', { name: 'Poppy' });
    expect(await within(card).findByText(new RegExp(text.replace('.', '\\.')))).toBeVisible();
    expect(h.getFlaggedPullSources).toHaveBeenCalledWith('show-1');
  });

  it('still offers Confirm Pull and Clear when who flagged it is unknown (offline)', async () => {
    h.getFlaggedPullSources.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<CheckInDesk {...props} entries={[poppy('pulled')]} />);

    const card = screen.getByRole('article', { name: 'Poppy' });
    expect(within(card).getByText(/Flagged as pulled\./)).toBeVisible();
    expect(within(card).getByRole('button', { name: /^Clear the pull flag/ })).toBeEnabled();
    expect(within(card).getByRole('button', { name: /^Confirm the pull/ })).toBeEnabled();
  });

  it('Clear asks the database to restore the check-in, then re-reads and says what it is now', async () => {
    const onRefreshEntries = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <CheckInDesk {...props} entries={[poppy('pulled')]} onRefreshEntries={onRefreshEntries} />
    );
    await user.click(
      screen.getByRole('button', { name: 'Clear the pull flag for Poppy, Container Novice A' })
    );

    await waitFor(() => expect(h.clearFlaggedPull).toHaveBeenCalledWith('entry-1'));
    await waitFor(() =>
      expect(h.toastSuccess).toHaveBeenCalledWith('Poppy, Container Novice A: Checked-in')
    );
    expect(onRefreshEntries).toHaveBeenCalled();
    // Clear never writes a check-in itself: only the database knows what the flag overwrote.
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
  });

  it('shows a failed Clear as an error', async () => {
    h.clearFlaggedPull.mockRejectedValue(new Error('Entry is no longer flagged pulled'));
    const { user } = render(<CheckInDesk {...props} entries={[poppy('pulled')]} />);
    await user.click(screen.getByRole('button', { name: /^Clear the pull flag/ }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(1));
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('Confirm Pull is the desk Pull: it asks first, then pulls through the shared write', async () => {
    const { user } = render(<CheckInDesk {...props} entries={[poppy('pulled')]} />);
    await user.click(
      screen.getByRole('button', { name: 'Confirm the pull for Poppy, Container Novice A' })
    );

    const confirm = await screen.findByRole('dialog', { name: 'Pull Poppy?' });
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Pull' }));
    await waitFor(() =>
      expect(h.scratchShowMapEntry).toHaveBeenCalledWith(
        'entry-1',
        undefined,
        'Pulled at the check-in desk'
      )
    );
    expect(h.clearFlaggedPull).not.toHaveBeenCalled();
  });

  it('shows neither for a class that is not flagged, nor for a real Pull', () => {
    const realPull = poppy('pulled', { entryStatus: EntryStatus.SCRATCHED });
    realPull.classes[0]!.status = 'scratched';
    render(
      <>
        <CheckInDesk {...props} entries={[poppy('checked-in')]} />
        <CheckInDesk {...props} entries={[realPull]} />
      </>
    );

    expect(screen.queryByRole('button', { name: /^Clear the pull flag/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirm the pull/ })).not.toBeInTheDocument();
    expect(h.getFlaggedPullSources).not.toHaveBeenCalled();
  });
});

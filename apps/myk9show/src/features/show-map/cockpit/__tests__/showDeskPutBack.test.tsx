import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PUT_BACK_OFFLINE_REASON,
  PUT_BACK_SCORED_REASON,
  PUT_BACK_SETTLED_REASON,
} from '@/components/entries/management/checkInDesk/deskStatus';
import { render } from '@/test/utils/testUtils';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { ClassEntriesTable } from '../FocusedClassEntries';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import { queueFor } from './queueFixture';

const h = vi.hoisted(() => ({
  online: true,
  getEntryStatusHistory: vi.fn(),
  changeSecretaryEntryStatus: vi.fn(),
}));

vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => h.online,
}));
vi.mock('@/services/database/entries/statusHistory', () => ({
  getEntryStatusHistory: h.getEntryStatusHistory,
}));
vi.mock('@/services/database/entries/lifecycle', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/entries/lifecycle')>()),
  changeSecretaryEntryStatus: h.changeSecretaryEntryStatus,
}));

const row: SecretaryCockpitClassEntry = {
  nodeId: 'entry:e-1',
  queue: queueFor('entry:e-1', '101', 'pulled'),
  entryId: 'e-1',
  armband: '101',
  dogName: 'Moss',
  checkIn: { value: 'pulled', label: 'Pulled', kind: 'muted' },
  checkInValue: 'pulled',
  deskEditable: false,
  lockedReason: null,
  state: 'pulled',
  counted: false,
  notCheckedIn: false,
  place: null,
  result: null,
};

/** A real Pull, pulled well before the trial day: the entry has no trial date at all. */
function pulledEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  const now = new Date('2026-10-20T16:00:00.000Z');
  return {
    id: 'e-1',
    registrationId: 'reg-1',
    entryNumber: '101',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Moss',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    classes: [
      {
        id: 'e-1',
        classId: 'class-1',
        name: 'Container Novice A',
        number: '1',
        fee: 25,
        status: 'scratched',
        checkInStatus: 'pulled',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.SCRATCHED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: now,
    lastUpdated: now,
    armbandNumber: '101',
    ...overrides,
  };
}

function renderTable(source: EntryManagementEntry) {
  return render(
    <ClassEntriesTable
      entries={[row]}
      className="Container Novice A"
      canChangeCheckIn
      putBackEntries={new Map([[source.id, source]])}
    />
  );
}

describe('Show Desk puts a pulled dog back from the class table (MYK9-2038)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.online = true;
    h.getEntryStatusHistory.mockResolvedValue([
      { previousStatus: 'confirmed', newStatus: 'scratched' },
    ]);
    h.changeSecretaryEntryStatus.mockResolvedValue({});
  });

  it('offers Put back on a Pull made weeks before the show and writes through the desk path', async () => {
    const source = pulledEntry();
    const { user } = renderTable(source);
    await user.click(screen.getByRole('button', { name: 'Put Moss back in this class' }));
    await user.click(await screen.findByRole('button', { name: 'Put back' }));
    await waitFor(() =>
      expect(h.changeSecretaryEntryStatus).toHaveBeenCalledWith(
        expect.objectContaining({ entry: source, newStatus: EntryStatus.ACCEPTED })
      )
    );
    expect(h.getEntryStatusHistory).toHaveBeenCalledWith('e-1');
  });

  it.each([
    ['a refund was decided', pulledEntry({ refundDecision: 'denied' }), PUT_BACK_SETTLED_REASON],
    ['a refund was issued', pulledEntry({ refundAmount: 25 }), PUT_BACK_SETTLED_REASON],
    ['the dog has a score', pulledEntry({ isScored: true }), PUT_BACK_SCORED_REASON],
  ])('offers no Put back when %s, and says why', (_, source, reason) => {
    renderTable(source);
    expect(screen.queryByRole('button', { name: /Put Moss back/ })).toBeNull();
    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it('disables Put back offline and says it needs a connection', () => {
    h.online = false;
    renderTable(pulledEntry());
    expect(screen.getByRole('button', { name: 'Put Moss back in this class' })).toBeDisabled();
    expect(screen.getByText(PUT_BACK_OFFLINE_REASON)).toBeInTheDocument();
  });

  it('offers nothing for a row with no stored entry', () => {
    render(<ClassEntriesTable entries={[row]} className="Container Novice A" canChangeCheckIn />);
    expect(screen.queryByRole('button', { name: /Put Moss back/ })).toBeNull();
  });
});

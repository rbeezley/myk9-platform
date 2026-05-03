import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MyEntryCard } from '@/pages/MyEntriesPage/modules/MyEntryCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));

vi.mock('@/components/entries/EntryStatusStepper', () => ({
  EntryStatusStepper: () => null,
}));

const baseEntry: MyEntry = {
  id: 'entry-1',
  registrationId: 'reg-1',
  showId: 'show-1',
  showName: 'Spring Agility Trial',
  showDate: new Date('2026-07-15'),
  location: { venue: 'Test Venue', city: 'Portland', state: 'OR' },
  dogName: 'Koda',
  dogId: 'dog-1',
  classes: [{ id: 'cls-1', name: 'Novice A', number: '101', fee: 25, status: 'entered' }],
  totalFee: 25,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  confirmationNumber: 'ABC123',
  submittedAt: new Date('2026-06-01'),
  lastUpdated: new Date('2026-06-02'),
};

const noop = vi.fn();

describe('MyEntryCard — entry close date label', () => {
  it('renders "Closes" label with the entry close date when entryCloseDate is set', () => {
    const closeDate = new Date('2026-06-30');
    render(
      <MyEntryCard
        entry={{ ...baseEntry, entryCloseDate: closeDate }}
        onCheckInClick={noop}
        onEditClick={noop}
        onReceiptClick={noop}
      />
    );

    expect(screen.getByText('Closes')).toBeInTheDocument();
    expect(screen.getByText(closeDate.toLocaleDateString())).toBeInTheDocument();
  });

  it('does not render the close date row when entryCloseDate is absent', () => {
    render(
      <MyEntryCard
        entry={{ ...baseEntry, entryCloseDate: undefined }}
        onCheckInClick={noop}
        onEditClick={noop}
        onReceiptClick={noop}
      />
    );

    expect(screen.queryByText('Closes')).not.toBeInTheDocument();
  });
});

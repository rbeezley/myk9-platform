import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { MyEntryCard } from '@/pages/MyEntriesPage/modules/MyEntryCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { formatShortDate } from '@/lib/format/dates';
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
  dogs: [
    {
      id: 'entry-1',
      dogId: 'dog-1',
      dogName: 'Koda',
      classes: [{ id: 'cls-1', name: 'Novice A', number: '101', fee: 25, status: 'entered' }],
      entryStatus: EntryStatus.ACCEPTED,
    },
  ],
  totalFee: 25,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  confirmationNumber: 'ABC123',
  submittedAt: new Date('2026-06-01'),
  lastUpdated: new Date('2026-06-02'),
};

const noop = vi.fn();

describe('MyEntryCard — entry close date label', () => {
  it('renders "Entries close" in the summary while the close date is still in the future', () => {
    // Editing is still possible, so the deadline is summary-band information.
    const closeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    render(
      <MyEntryCard
        entry={{ ...baseEntry, entryCloseDate: closeDate }}
        onCheckInClick={noop}
        onEditClick={noop}
        onReceiptClick={noop}
      />
    );

    expect(screen.getByText('Entries close')).toBeInTheDocument();
    expect(screen.getByText('Entries close').parentElement).toHaveTextContent(
      formatShortDate(closeDate)
    );
  });

  it('moves a past "Entries close" date into the collapsed details panel', async () => {
    const user = userEvent.setup();
    const closeDate = new Date('2026-06-30');
    render(
      <MyEntryCard
        entry={{ ...baseEntry, entryCloseDate: closeDate }}
        onCheckInClick={noop}
        onEditClick={noop}
        onReceiptClick={noop}
      />
    );

    expect(screen.queryByText('Entries close')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /entered classes/i }));
    expect(screen.getByText('Entries close')).toBeInTheDocument();
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

    expect(screen.queryByText('Entries close')).not.toBeInTheDocument();
  });
});

describe('MyEntryCard — venue directions link', () => {
  it('renders the location as a Google Maps directions link built from venue, city, and state', () => {
    render(
      <MyEntryCard
        entry={baseEntry}
        onCheckInClick={noop}
        onEditClick={noop}
        onReceiptClick={noop}
      />
    );

    const link = screen.getByRole('link', { name: 'Get directions to Test Venue, Portland, OR' });
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=Test%20Venue%2C%20Portland%2C%20OR'
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The visible label stays the short "city, state" form.
    expect(link).toHaveTextContent('Portland, OR');
  });

  it('falls back to a non-interactive row when no address parts are available', () => {
    render(
      <MyEntryCard
        entry={{ ...baseEntry, location: { venue: '', city: '', state: '' } }}
        onCheckInClick={noop}
        onEditClick={noop}
        onReceiptClick={noop}
      />
    );

    expect(screen.queryByRole('link', { name: /Get directions/i })).not.toBeInTheDocument();
  });
});

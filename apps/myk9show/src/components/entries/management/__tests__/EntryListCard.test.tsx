import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryListCard } from '../EntryListCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: ({ status }: { status: string }) => (
    <span data-testid="checkin-status">{status}</span>
  ),
}));

vi.mock('@/components/entries/EmailStatusIcon', () => ({
  EmailStatusIcon: () => null,
}));

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'cls-1',
    name: 'Novice A',
    number: '101',
    fee: 25,
    status: 'entered',
    checkInStatus: 'no-status' as EntryClass['checkInStatus'],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogName: 'Fido',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@test.com',
    handlerName: 'Jane Smith',
    classes: [makeClass()],
    totalFee: 50,
    paidAmount: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

const defaultProps = {
  entries: [makeEntry()],
  onStatusChange: vi.fn(),
  onCheckInStatusChange: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  onRemoveEntry: vi.fn(),
};

describe('EntryListCard - check-in button affordance', () => {
  it('renders check-in status button with cursor-pointer class', () => {
    render(<EntryListCard {...defaultProps} />);

    const statusIndicator = screen.getByTestId('checkin-status');
    const button = statusIndicator.closest('button');
    expect(button).toHaveClass('cursor-pointer');
  });

  it('renders check-in status button with border for visual affordance', () => {
    render(<EntryListCard {...defaultProps} />);

    const statusIndicator = screen.getByTestId('checkin-status');
    const button = statusIndicator.closest('button');
    expect(button).toHaveClass('border');
  });

  it('renders check-in buttons for all classes in an entry', () => {
    const entry = makeEntry({
      classes: [
        makeClass({ id: 'cls-1', name: 'Novice A' }),
        makeClass({ id: 'cls-2', name: 'Open B' }),
      ],
    });
    render(<EntryListCard {...defaultProps} entries={[entry]} />);

    const indicators = screen.getAllByTestId('checkin-status');
    expect(indicators).toHaveLength(2);
    indicators.forEach(indicator => {
      const button = indicator.closest('button');
      expect(button).toHaveClass('cursor-pointer');
    });
  });

  it('omits "Waitlisted" from the per-entry status menu', () => {
    // The inline status write maps WAITLIST → 'submitted', so it never creates
    // `waitlist_entries` membership and leaves the entry Pending. Real
    // waitlisting is the dedicated per-class workflow (WaitlistManagementPage).
    render(<EntryListCard {...defaultProps} />);

    // The status dropdown trigger shows the entry's current status badge.
    fireEvent.click(screen.getByText('Accepted'));

    // Valid status transitions remain reachable…
    expect(screen.getByText('Not Accepted')).toBeTruthy();
    // …but the broken no-op "Waitlisted" option is gone.
    expect(screen.queryByText('Waitlisted')).toBeNull();
  });

  it('renders the enrollment payment status when it differs from entry payment status', () => {
    render(
      <EntryListCard
        {...defaultProps}
        entries={[
          makeEntry({
            paymentStatus: PaymentStatus.PENDING,
            enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
          }),
        ]}
      />
    );

    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByText('Payment Due')).not.toBeInTheDocument();
  });

  it('confirms before removing an entry from a class', async () => {
    const user = userEvent.setup();
    const onRemoveEntry = vi.fn();
    render(<EntryListCard {...defaultProps} onRemoveEntry={onRemoveEntry} />);

    await user.click(screen.getByRole('button', { name: /remove entry for fido/i }));

    expect(screen.getByRole('alertdialog', { name: /remove entry/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^remove entry$/i }));

    expect(onRemoveEntry).toHaveBeenCalledWith('entry-1');
  });
});

/**
 * MYK9-1930: a day-of desk entry gets its entry form from the server when it syncs.
 *
 * Until then (saved on this device only) its card says the payment can be recorded once the
 * device is back online and offers nothing that records money. Once synced, the entry carries
 * its form id and groups under that form, so the form's own Cash / Check controls are there:
 * no second way to record a payment.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCard } from '../EnrollmentCard';
import { SAVED_ON_DEVICE_PAYMENT_NOTE } from '../enrollmentPayment';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock('@/components/entries/EmailStatusIcon', () => ({
  EmailStatusIcon: () => null,
}));

/** A "Cash (pay at show)" late entry as the Entries page maps it. */
function lateEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'late-1',
    registrationId: '',
    entryNumber: '120',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Pepper',
    ownerName: 'Dana Reyes',
    ownerEmail: 'dana@example.test',
    handlerName: 'Dana Reyes',
    classes: [{ id: 'late-1', name: 'Interior Novice A', number: '1', fee: 35, status: 'entered' }],
    totalFee: 35,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    rawPaymentStatus: 'pending',
    paymentMethod: 'cash',
    submittedAt: new Date('2026-11-18T15:00:00Z'),
    lastUpdated: new Date('2026-11-18T15:00:00Z'),
    ...overrides,
  };
}

const ledger = {
  record: vi.fn().mockResolvedValue('saved'),
  markPaidOnline: vi.fn().mockResolvedValue(true),
  todayInShowZone: '2026-11-18',
};

function renderGroupOf(entry: EntryManagementEntry) {
  const groups = groupEntriesByEnrollment([entry]);
  expect(groups).toHaveLength(1);
  render(
    <EnrollmentCard
      group={groups[0]!}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      paymentLedger={ledger}
    />
  );
  return groups[0]!;
}

describe('EnrollmentCard: a late entry and its entry form (MYK9-1930)', () => {
  it('says the payment can be recorded once back online while the entry is saved on this device only', () => {
    const group = renderGroupOf(lateEntry({ savedOnDeviceOnly: true }));

    expect(group.enrollmentId).toBeNull();
    expect(screen.getByText(SAVED_ON_DEVICE_PAYMENT_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change payment' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Paid in Full/)).not.toBeInTheDocument();
    // It never reads as paid.
    expect(screen.queryByText(/^Paid/)).not.toBeInTheDocument();
  });

  it('says nothing about the device for a formless entry that is already on the server', () => {
    renderGroupOf(lateEntry());

    expect(screen.queryByText(SAVED_ON_DEVICE_PAYMENT_NOTE)).not.toBeInTheDocument();
  });

  it('once synced, groups under its entry form with the form’s Record Payment control', () => {
    const group = renderGroupOf(
      lateEntry({
        registrationId: 'form-1',
        confirmationNumber: 'MK9-001930',
        enrollmentPaymentStatus: PaymentStatus.PENDING,
        enrollmentTotalAmount: 3500,
        enrollmentPaidAmount: 0,
        enrollmentCardCoveredCents: 0,
      })
    );

    expect(group.enrollmentId).toBe('form-1');
    expect(screen.queryByText(SAVED_ON_DEVICE_PAYMENT_NOTE)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change payment' }));
    // MYK9-2479: cash and check, full or part, go through Record Payment.
    expect(screen.getByText('Record Payment…')).toBeInTheDocument();
  });
});

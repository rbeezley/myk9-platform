import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCard } from '../EnrollmentCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { EnrollmentLedgerRecordImpl } from '@/hooks/useEnrollmentLedgerActions';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));

vi.mock('@/components/entries/EmailStatusIcon', () => ({
  EmailStatusIcon: () => null,
}));

/**
 * MYK9-2152: the refund dialog's pre-fill is the form's desk money. When the enrollment row has
 * not loaded (`totalAmountUnit: 'dollars'` with an enrollment id), that figure is summed from
 * entry fees and is not the form's money, so the dialog pre-fills nothing and waits.
 */
function makeEntry(): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'enroll-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Bravo',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@test.com',
    handlerName: 'Jane Smith',
    classes: [{ id: 'cls-1', name: 'Novice A', number: '101', fee: 25, status: 'entered' }],
    totalFee: 50,
    paidAmount: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_BY_CHECK,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
  };
}

/** Loaded: the server's figures. Not loaded: the entry-fee fallback, in dollars. */
function makeGroup(loaded: boolean): EnrollmentGroup {
  return {
    groupKey: 'enroll-1',
    enrollmentId: 'enroll-1',
    confirmationNumber: 'MK9-000123',
    handlerName: 'Jane Smith',
    paymentStatus: PaymentStatus.PAID_BY_CHECK,
    totalAmount: loaded ? 5000 : 50,
    totalAmountUnit: loaded ? 'cents' : 'dollars',
    paidAmount: loaded ? 40 : 50,
    cardCoveredAmount: 0,
    paymentReference: null,
    paymentMethod: null,
    rawPaymentStatus: null,
    refundAmount: null,
    refundNotes: null,
    refundedAt: null,
    entries: [makeEntry()],
  };
}

function cardFor(loaded: boolean, record: EnrollmentLedgerRecordImpl) {
  return (
    <EnrollmentCard
      group={makeGroup(loaded)}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      paymentLedger={{
        record,
        markPaidOnline: vi.fn().mockResolvedValue(true),
        todayInShowZone: '2026-09-17',
      }}
    />
  );
}

function openRefund(menuItem: 'Refunded…' | 'Partial Refund…') {
  fireEvent.click(screen.getByRole('button', { name: 'Change payment' }));
  fireEvent.click(screen.getByText(menuItem));
}

describe('desk refund when the payment record has not loaded (MYK9-2152)', () => {
  it('pre-fills nothing, quotes no figure, and records nothing', () => {
    const record = vi.fn<EnrollmentLedgerRecordImpl>();
    render(cardFor(false, record));
    openRefund('Refunded…');

    const dialog = screen.getByRole('dialog');
    expect(screen.getByLabelText(/Refund Amount/i)).toHaveValue(null);
    expect(dialog).not.toHaveTextContent('$50.00');
    expect(dialog).toHaveTextContent('Amount not available');
    fireEvent.click(screen.getByRole('button', { name: 'Record Refund' }));
    expect(screen.getByRole('button', { name: 'Record Refund' })).toBeDisabled();
    expect(record).not.toHaveBeenCalled();
  });

  it('a partial refund waits for the record too', () => {
    const record = vi.fn<EnrollmentLedgerRecordImpl>();
    render(cardFor(false, record));
    openRefund('Partial Refund…');

    expect(screen.getByLabelText(/Refund Amount/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record Refund' })).toBeDisabled();
  });

  it('pre-fills the real desk money once the record loads, and records it', () => {
    const record = vi.fn<EnrollmentLedgerRecordImpl>().mockResolvedValue('saved');
    const { rerender } = render(cardFor(false, record));
    openRefund('Refunded…');
    expect(screen.getByLabelText(/Refund Amount/i)).toHaveValue(null);

    rerender(cardFor(true, record));

    expect(screen.getByLabelText(/Refund Amount/i)).toHaveValue(40);
    expect(screen.getByRole('dialog')).toHaveTextContent('Paid at the desk: $40.00');
    expect(screen.queryByText('Amount not available')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record Refund' }));
    expect(record).toHaveBeenCalledWith(
      'enroll-1',
      expect.objectContaining({ kind: 'refund', amount: 40, method: 'check' })
    );
  });

  it('pre-fills the desk money when the record is loaded (unchanged)', () => {
    const record = vi.fn<EnrollmentLedgerRecordImpl>();
    render(cardFor(true, record));
    openRefund('Refunded…');

    expect(screen.getByLabelText(/Refund Amount/i)).toHaveValue(40);
    expect(screen.getByText('(pre-filled from paid)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record Refund' })).toBeEnabled();
  });
});

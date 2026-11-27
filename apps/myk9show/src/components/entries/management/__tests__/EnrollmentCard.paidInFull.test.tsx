/**
 * MYK9-2479 (owner's Option A after Codex round 3 on #4461): "Paid in Full" by cash or
 * check opens the Partial Payment dialog with the server's balance due filled in, in whole
 * cents. She confirms it or edits it, and the amount in the box is the amount sent: there
 * is no second payment path whose figure could be out of date. Online is unchanged.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCard } from '../EnrollmentCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EnrollmentLedgerRecordImpl } from '@/hooks/useEnrollmentLedgerActions';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));
vi.mock('@/components/entries/EmailStatusIcon', () => ({ EmailStatusIcon: () => null }));

const FORM = { showId: 'show-1', exhibitorName: 'Jane Smith' };

/** $50.00 owed, `paid` received. Not loaded: the entry-fee fallback, so the due is unknown. */
function makeGroup({ paid = 0, loaded = true } = {}): EnrollmentGroup {
  return {
    groupKey: 'enroll-1',
    enrollmentId: 'enroll-1',
    confirmationNumber: 'MK9-000123',
    handlerName: 'Jane Smith',
    paymentStatus: PaymentStatus.PENDING,
    totalAmount: loaded ? 5000 : 50,
    totalAmountUnit: loaded ? 'cents' : 'dollars',
    paidAmount: paid,
    cardCoveredAmount: 0,
    paymentReference: null,
    paymentMethod: null,
    rawPaymentStatus: null,
    refundAmount: null,
    refundNotes: null,
    refundedAt: null,
    entries: [
      {
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
        paidAmount: paid,
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PENDING,
        submittedAt: new Date('2026-01-01'),
        lastUpdated: new Date('2026-01-01'),
      },
    ],
  };
}

function renderCard(group: EnrollmentGroup) {
  const record = vi.fn<EnrollmentLedgerRecordImpl>().mockResolvedValue('saved');
  const markPaidOnline = vi.fn().mockResolvedValue(true);
  render(
    <EnrollmentCard
      group={group}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      paymentLedger={{ record, markPaidOnline, todayInShowZone: '2026-11-27' }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Change payment' }));
  return { record, markPaidOnline };
}

const amountBox = () => screen.getByPlaceholderText('Amount of this payment ($)');

describe('Paid in Full fills in Partial Payment (MYK9-2479)', () => {
  it('cash opens Partial Payment with the balance due, and recording it sends that amount', () => {
    const { record } = renderCard(makeGroup({ paid: 12.5 }));

    fireEvent.click(screen.getByText('Paid in Full: Cash…'));

    expect(screen.getByRole('dialog', { name: 'Record Partial Payment' })).toBeInTheDocument();
    expect(amountBox()).toHaveValue(37.5);
    expect(screen.queryByPlaceholderText('Check number (optional)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      'enroll-1',
      expect.objectContaining({ kind: 'payment', method: 'cash', amount: 37.5 }),
      FORM
    );
  });

  it('check opens it as a check, and an edited amount is the amount sent', () => {
    const { record } = renderCard(makeGroup());

    fireEvent.click(screen.getByText('Paid in Full: Check…'));
    expect(amountBox()).toHaveValue(50);
    expect(screen.getByPlaceholderText('Check number (optional)')).toBeInTheDocument();
    fireEvent.change(amountBox(), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    expect(record).toHaveBeenCalledWith(
      'enroll-1',
      expect.objectContaining({ kind: 'payment', method: 'check', amount: 30 }),
      FORM
    );
  });

  it('leaves the amount empty when the balance due is not known', () => {
    const { record } = renderCard(makeGroup({ loaded: false }));

    fireEvent.click(screen.getByText('Paid in Full: Cash…'));

    expect(amountBox()).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeDisabled();
    expect(record).not.toHaveBeenCalled();
  });

  it('Paid in Full: Online still asks the server, never as a desk payment', () => {
    const { record, markPaidOnline } = renderCard(makeGroup());

    fireEvent.click(screen.getByText('Paid in Full: Online…'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid Online' }));

    expect(markPaidOnline).toHaveBeenCalledWith('enroll-1');
    expect(record).not.toHaveBeenCalled();
  });
});

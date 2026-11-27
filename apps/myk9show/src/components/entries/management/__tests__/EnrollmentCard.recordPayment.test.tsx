/**
 * MYK9-2479 (owner, 2026-11-27, after Codex round 4 on #4461): "Paid in Full" is online
 * only. Cash and check, full or part, go through the one Record Payment dialog, where she
 * types the amount she received; nothing is filled in for her, and the amount she typed is
 * the amount sent. "Paid in Full: Online" is unchanged.
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

/** $50.00 owed, `paid` received. */
function makeGroup({ paid = 0 } = {}): EnrollmentGroup {
  return {
    groupKey: 'enroll-1',
    enrollmentId: 'enroll-1',
    confirmationNumber: 'MK9-000123',
    handlerName: 'Jane Smith',
    paymentStatus: PaymentStatus.PENDING,
    totalAmount: 5000,
    totalAmountUnit: 'cents',
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

describe('Record Payment is the one cash and check dialog (MYK9-2479)', () => {
  it('the payment menu offers Record Payment and Paid in Full: Online, never Paid in Full by cash or check', () => {
    renderCard(makeGroup());

    const items = screen.getAllByRole('menuitem').map(item => item.textContent);
    expect(items).toEqual(expect.arrayContaining(['Record Payment…', 'Paid in Full: Online…']));
    expect(items).not.toContain('Paid in Full: Cash…');
    expect(items).not.toContain('Paid in Full: Check…');
    expect(items).not.toContain('Partial Payment…');
  });

  it('opens empty, and a full payment in cash sends the amount she typed', () => {
    const { record } = renderCard(makeGroup({ paid: 12.5 }));

    fireEvent.click(screen.getByText('Record Payment…'));

    expect(screen.getByRole('dialog', { name: 'Record Payment' })).toBeInTheDocument();
    expect(amountBox()).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeDisabled();
    fireEvent.change(amountBox(), { target: { value: '37.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      'enroll-1',
      expect.objectContaining({ kind: 'payment', method: 'cash', amount: 37.5 }),
      FORM
    );
  });

  it('a check is recorded as a check, for the amount she typed', () => {
    const { record } = renderCard(makeGroup());

    fireEvent.click(screen.getByText('Record Payment…'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.change(amountBox(), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    expect(record).toHaveBeenCalledWith(
      'enroll-1',
      expect.objectContaining({ kind: 'payment', method: 'check', amount: 50 }),
      FORM
    );
  });

  // Codex round 5 on #4461: a fraction of a cent is a typo, never rounded into a payment.
  it('a fraction of a cent records nothing and says to enter dollars and cents', () => {
    const { record } = renderCard(makeGroup());

    fireEvent.click(screen.getByText('Record Payment…'));
    fireEvent.change(amountBox(), { target: { value: '12.345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    expect(record).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeDisabled();
    expect(screen.getByText('Enter dollars and cents, like 12.35.')).toBeInTheDocument();
  });

  it('Paid in Full: Online still asks the server, never as a desk payment', () => {
    const { record, markPaidOnline } = renderCard(makeGroup());

    fireEvent.click(screen.getByText('Paid in Full: Online…'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid Online' }));

    expect(markPaidOnline).toHaveBeenCalledWith('enroll-1');
    expect(record).not.toHaveBeenCalled();
  });
});

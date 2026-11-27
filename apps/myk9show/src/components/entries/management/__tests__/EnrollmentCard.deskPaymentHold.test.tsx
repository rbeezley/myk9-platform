/**
 * MYK9-2479, Codex round 2 on #4461: Paid in Full records the due the form shows. While a
 * payment for the form is still on this device, the device cannot read its payments, or
 * the form's money is being reloaded after one went, that due may already be paid, so
 * Paid in Full cannot be confirmed and the dialog points at Partial Payment instead.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCard } from '../EnrollmentCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { DeskPaymentLinesState } from '@/features/payments/deskPayments/useDeskPaymentLines';
import type { DeskPaymentLine } from '@/features/payments/deskPayments/deskPaymentTypes';
import type { EnrollmentLedgerRecordImpl } from '@/hooks/useEnrollmentLedgerActions';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));
vi.mock('@/components/entries/EmailStatusIcon', () => ({ EmailStatusIcon: () => null }));

const IDLE: DeskPaymentLinesState = {
  lines: [],
  busyId: null,
  unreadable: false,
  balanceRefreshing: false,
  tryAgain: () => undefined,
  remove: () => undefined,
};
const hook = vi.hoisted(() => ({ state: null as unknown as DeskPaymentLinesState }));
vi.mock('@/features/payments/deskPayments/useDeskPaymentLines', () => ({
  useDeskPaymentLines: () => hook.state,
}));

const LINE: DeskPaymentLine = {
  payment: {
    id: 'pay-1',
    showId: 'show-1',
    enrollmentId: 'enroll-1',
    exhibitorName: 'Jane Smith',
    amount: 25,
    method: 'cash',
    receivedOn: '2026-11-27',
    reference: null,
    receivedAt: '2026-11-27T15:14:00.000Z',
    sendBegun: false,
  },
  owner: 'secretary-a',
  state: 'waiting',
};

const GROUP: EnrollmentGroup = {
  groupKey: 'enroll-1',
  enrollmentId: 'enroll-1',
  confirmationNumber: 'MK9-000123',
  handlerName: 'Jane Smith',
  paymentStatus: PaymentStatus.PENDING,
  totalAmount: 5000,
  totalAmountUnit: 'cents',
  paidAmount: 0,
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
      paidAmount: 0,
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PENDING,
      submittedAt: new Date('2026-01-01'),
      lastUpdated: new Date('2026-01-01'),
    },
  ],
};

function openPaidInFull(state: DeskPaymentLinesState) {
  hook.state = state;
  const record = vi.fn<EnrollmentLedgerRecordImpl>().mockResolvedValue('saved');
  const card = () => (
    <EnrollmentCard
      group={GROUP}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      paymentLedger={{
        record,
        markPaidOnline: vi.fn().mockResolvedValue(true),
        todayInShowZone: '2026-11-27',
      }}
    />
  );
  const view = render(card());
  fireEvent.click(screen.getByRole('button', { name: 'Change payment' }));
  fireEvent.click(screen.getByText('Paid in Full: Cash…'));
  return {
    record,
    rerenderWith: (next: DeskPaymentLinesState) => {
      hook.state = next;
      view.rerender(card());
    },
  };
}

describe('Paid in Full while the balance may be out of date (MYK9-2479)', () => {
  it('a payment still on this device holds Paid in Full and names Partial Payment', () => {
    const { record } = openPaidInFull({ ...IDLE, lines: [LINE] });

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByTestId('full-payment-held-note')).toHaveTextContent(
      'A payment for this form is still on this device, so the balance may change. Use Partial Payment to record another amount.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(record).not.toHaveBeenCalled();
  });

  it('a device that cannot read its saved payments holds Paid in Full', () => {
    openPaidInFull({ ...IDLE, unreadable: true });

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByTestId('full-payment-held-note')).toHaveTextContent(
      'This device could not read its saved payments, so the balance may be out of date. Use Partial Payment to record the amount you received.'
    );
  });

  it('holds Paid in Full while the balance reloads, and confirms it once that is done', () => {
    const { record, rerenderWith } = openPaidInFull({ ...IDLE, balanceRefreshing: true });

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByTestId('full-payment-held-note')).toHaveTextContent(
      'The balance is being updated. Use Partial Payment to record the amount you received, or wait a moment.'
    );

    rerenderWith(IDLE);

    expect(screen.queryByTestId('full-payment-held-note')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(record).toHaveBeenCalledWith(
      'enroll-1',
      expect.objectContaining({ kind: 'payment', amount: 50 }),
      { showId: 'show-1', exhibitorName: 'Jane Smith' }
    );
  });
});

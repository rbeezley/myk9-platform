import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCard } from '../EnrollmentCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type {
  EnrollmentLedgerRecordImpl,
  LedgerWriteOutcome,
} from '@/hooks/useEnrollmentLedgerActions';

type LedgerRecord = EnrollmentLedgerRecordImpl;

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));

vi.mock('@/components/entries/EmailStatusIcon', () => ({
  EmailStatusIcon: () => null,
}));

/**
 * MYK9-2156: a payment or refund dialog closes only once its ledger write
 * succeeds. A failed write keeps the dialog open with what the secretary typed
 * and says it was not saved; confirm is disabled while the write is pending.
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
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
  };
}

function makeGroup(paidAmount: number): EnrollmentGroup {
  return {
    groupKey: 'enroll-1',
    enrollmentId: 'enroll-1',
    confirmationNumber: 'MK9-000123',
    handlerName: 'Jane Smith',
    paymentStatus: paidAmount > 0 ? PaymentStatus.PAID_BY_CHECK : PaymentStatus.PENDING,
    totalAmount: 5000,
    totalAmountUnit: 'cents',
    paidAmount,
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

/** A ledger write the test settles by hand, so the pending state can be observed. */
function deferredRecord() {
  let settle: (outcome: LedgerWriteOutcome) => void = () => undefined;
  const record = vi.fn<LedgerRecord>(
    () =>
      new Promise<LedgerWriteOutcome>(resolve => {
        settle = resolve;
      })
  );
  return { record, settle: (outcome: LedgerWriteOutcome) => settle(outcome) };
}

function renderCard(record: LedgerRecord, paidAmount = 0) {
  render(
    <EnrollmentCard
      group={makeGroup(paidAmount)}
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
  fireEvent.click(screen.getByRole('button', { name: 'Change payment' }));
}

/** A check for the whole $50 due, through Record Payment (MYK9-2479: Paid in Full is online only). */
function openCheckPayment(record: LedgerRecord) {
  renderCard(record);
  fireEvent.click(screen.getByText('Record Payment…'));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.change(screen.getByPlaceholderText('Amount of this payment ($)'), {
    target: { value: '50' },
  });
  fireEvent.change(screen.getByPlaceholderText('Check number (optional)'), {
    target: { value: '1042' },
  });
  fireEvent.change(screen.getByLabelText('Received on'), { target: { value: '2026-08-27' } });
}

function openPartialPayment(record: LedgerRecord) {
  renderCard(record);
  fireEvent.click(screen.getByText('Record Payment…'));
  fireEvent.change(screen.getByPlaceholderText('Amount of this payment ($)'), {
    target: { value: '35' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.change(screen.getByPlaceholderText('Check number (optional)'), {
    target: { value: '2001' },
  });
}

function openPartialRefund(record: LedgerRecord) {
  renderCard(record, 50);
  fireEvent.click(screen.getByText('Partial Refund…'));
  fireEvent.change(screen.getByLabelText(/Refund Amount/i), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: 'handed back at desk' } });
}

describe('payment and refund dialogs keep what was typed when the save fails (MYK9-2156)', () => {
  describe('Record Payment: a check for the full amount', () => {
    it('stays open with the check number and date, and says it was not saved', async () => {
      const { record, settle } = deferredRecord();
      openCheckPayment(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

      expect(screen.getByRole('button', { name: 'Record Payment' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
      expect(record).toHaveBeenCalledTimes(1);

      settle('failed');
      expect(await screen.findByText(/^Not saved\./)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Check number (optional)')).toHaveValue('1042');
      expect(screen.getByLabelText('Received on')).toHaveValue('2026-08-27');
      expect(screen.getByRole('button', { name: 'Record Payment' })).toBeEnabled();
    });

    it('closes once the write succeeds', async () => {
      const { record, settle } = deferredRecord();
      openCheckPayment(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      settle('saved');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.queryByText(/^Not saved\./)).not.toBeInTheDocument();
    });
  });

  describe('Record Payment: part of the amount', () => {
    it('stays open with the amount, method and check number, and says it was not saved', async () => {
      const { record, settle } = deferredRecord();
      openPartialPayment(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

      expect(screen.getByRole('button', { name: 'Record Payment' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
      expect(record).toHaveBeenCalledTimes(1);

      settle('failed');
      expect(await screen.findByText(/^Not saved\./)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Amount of this payment ($)')).toHaveValue(35);
      expect(screen.getByPlaceholderText('Check number (optional)')).toHaveValue('2001');
      expect(screen.getByRole('button', { name: 'Record Payment' })).toBeEnabled();
    });

    it('closes once the write succeeds', async () => {
      const { record, settle } = deferredRecord();
      openPartialPayment(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

      settle('saved');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('Partial Refund', () => {
    it('stays open with the amount and notes, and says it was not saved', async () => {
      const { record, settle } = deferredRecord();
      openPartialRefund(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Refund' }));

      expect(screen.getByRole('button', { name: 'Record Refund' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Record Refund' }));
      expect(record).toHaveBeenCalledTimes(1);

      settle('failed');
      expect(await screen.findByText(/^Not saved\./)).toBeInTheDocument();
      expect(screen.getByLabelText(/Refund Amount/i)).toHaveValue(20);
      expect(screen.getByLabelText(/Notes/i)).toHaveValue('handed back at desk');
      expect(screen.getByRole('button', { name: 'Record Refund' })).toBeEnabled();
    });

    it('closes once the write succeeds', async () => {
      const { record, settle } = deferredRecord();
      openPartialRefund(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Refund' }));

      settle('saved');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  // A lost answer may still have been saved: the dialog keeps the values but
  // never says "Not saved", because a blind retry could record it twice.
  describe('when the save cannot be confirmed', () => {
    const UNCONFIRMED =
      'We could not confirm this was saved. Check the payments on this form before you try again.';

    it('a full check payment keeps the check number and date and asks to check first', async () => {
      const { record, settle } = deferredRecord();
      openCheckPayment(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

      settle('unconfirmed');
      expect(await screen.findByText(UNCONFIRMED)).toBeInTheDocument();
      expect(screen.queryByText(/^Not saved\./)).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Check number (optional)')).toHaveValue('1042');
      expect(screen.getByLabelText('Received on')).toHaveValue('2026-08-27');
    });

    it('a part payment keeps the amount and check number and asks to check first', async () => {
      const { record, settle } = deferredRecord();
      openPartialPayment(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

      settle('unconfirmed');
      expect(await screen.findByText(UNCONFIRMED)).toBeInTheDocument();
      expect(screen.queryByText(/^Not saved\./)).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Amount of this payment ($)')).toHaveValue(35);
      expect(screen.getByPlaceholderText('Check number (optional)')).toHaveValue('2001');
    });

    it('Partial Refund keeps the amount and notes and asks to check first', async () => {
      const { record, settle } = deferredRecord();
      openPartialRefund(record);
      fireEvent.click(screen.getByRole('button', { name: 'Record Refund' }));

      settle('unconfirmed');
      expect(await screen.findByText(UNCONFIRMED)).toBeInTheDocument();
      expect(screen.queryByText(/^Not saved\./)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Refund Amount/i)).toHaveValue(20);
      expect(screen.getByLabelText(/Notes/i)).toHaveValue('handed back at desk');
    });
  });

  it('a retry after a failure that succeeds closes the dialog and records the same payment', async () => {
    const record = vi
      .fn<LedgerRecord>()
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('saved');
    openCheckPayment(record);
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    expect(await screen.findByText(/^Not saved\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenLastCalledWith(
      'enroll-1',
      {
        kind: 'payment',
        method: 'check',
        // MYK9-2479: the amount she typed, never NULL.
        amount: 50,
        receivedOn: '2026-08-27',
        reference: '1042',
        clientPaymentId: expect.any(String),
      },
      { showId: 'show-1', exhibitorName: 'Jane Smith' }
    );
  });
});

// MYK9-2479: saved on this device and left to the queue, the payment is not lost to the
// dialog: it closes, and the payment's line beside the balance says where it stands.
it('a payment saved on this device and queued closes its dialog', async () => {
  const record = vi.fn<LedgerRecord>().mockResolvedValue('queued');
  openPartialPayment(record);
  fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(record).toHaveBeenCalledTimes(1);
});

/** The payment id the `call`th ledger write carried (MYK9-1936). */
function sentPaymentId(record: ReturnType<typeof vi.fn<LedgerRecord>>, call: number) {
  const action = record.mock.calls[call]?.[1];
  return action?.kind === 'payment' ? action.clientPaymentId : undefined;
}

describe('every payment carries its own id, kept for a retry (MYK9-1936)', () => {
  it('a retry of the same unconfirmed full check payment sends the same id', async () => {
    const record = vi
      .fn<LedgerRecord>()
      .mockResolvedValueOnce('unconfirmed')
      .mockResolvedValueOnce('saved');
    openCheckPayment(record);
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Record Payment' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));

    const first = sentPaymentId(record, 0);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(sentPaymentId(record, 1)).toBe(first);
  });

  it('a retry of the same unconfirmed partial payment sends the same id', async () => {
    const record = vi
      .fn<LedgerRecord>()
      .mockResolvedValueOnce('unconfirmed')
      .mockResolvedValueOnce('saved');
    openPartialPayment(record);
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Record Payment' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));

    expect(sentPaymentId(record, 0)).toBeDefined();
    expect(sentPaymentId(record, 1)).toBe(sentPaymentId(record, 0));
  });

  it('a changed amount after an unconfirmed save is a new payment with a new id', async () => {
    const record = vi
      .fn<LedgerRecord>()
      .mockResolvedValueOnce('unconfirmed')
      .mockResolvedValueOnce('saved');
    openPartialPayment(record);
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Record Payment' })).toBeEnabled()
    );
    fireEvent.change(screen.getByPlaceholderText('Amount of this payment ($)'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));

    expect(sentPaymentId(record, 0)).toBeDefined();
    expect(sentPaymentId(record, 1)).toBeDefined();
    expect(sentPaymentId(record, 1)).not.toBe(sentPaymentId(record, 0));
  });

  it('the next payment after a confirmed save gets a new id', async () => {
    const record = vi.fn<LedgerRecord>().mockResolvedValue('saved');
    openPartialPayment(record);
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The same amount and method again is a second payment, not a retry.
    fireEvent.click(screen.getByRole('button', { name: 'Change payment' }));
    fireEvent.click(screen.getByText('Record Payment…'));
    fireEvent.change(screen.getByPlaceholderText('Amount of this payment ($)'), {
      target: { value: '35' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));

    expect(sentPaymentId(record, 0)).toBeDefined();
    expect(sentPaymentId(record, 1)).toBeDefined();
    expect(sentPaymentId(record, 1)).not.toBe(sentPaymentId(record, 0));
  });
});

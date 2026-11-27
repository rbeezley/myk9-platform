import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { logger } from '@/services/LoggingService';
import {
  applyRecordedEnrollmentPayment,
  useEnrollmentLedgerActions,
} from '../useEnrollmentLedgerActions';

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  markOnline: vi.fn(),
  save: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@/services/database/show-payments', () => ({
  recordEnrollmentPayment: mocks.record,
  markEnrollmentPaidOnline: mocks.markOnline,
}));
vi.mock('@/features/payments/deskPayments/saveDeskPayment', () => ({
  saveDeskPayment: mocks.save,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, warning: mocks.toastWarning } }));

function entry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'enr-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Bravo',
    ownerName: 'Jane',
    ownerEmail: 'jane@test.com',
    handlerName: 'Jane',
    classes: [],
    totalFee: 50,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    enrollmentPaymentStatus: PaymentStatus.PENDING,
    enrollmentPaidAmount: 35,
    submittedAt: new Date('2026-08-27'),
    lastUpdated: new Date('2026-08-27'),
    ...overrides,
  };
}

const PAID_IN_FULL = {
  id: 'enr-1',
  payment_status: 'paid_by_cash',
  paid_amount: '50.00',
  payment_reference: null,
  refund_amount: null,
  refund_notes: null,
  refunded_at: null,
};

/** An RPC validation refusal as show-payments throws it: the message plus code 22023. */
function refusal(message: string) {
  return Object.assign(new Error(message), { code: '22023' });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('applyRecordedEnrollmentPayment', () => {
  it("takes the server's status and running paid total", () => {
    const next = applyRecordedEnrollmentPayment(entry(), PAID_IN_FULL);

    expect(next.enrollmentPaymentStatus).toBe(PaymentStatus.PAID_BY_CASH);
    expect(next.enrollmentPaidAmount).toBe(50);
    expect(next.paidAmount).toBe(50);
  });

  // MYK9-773: after an enrollment refund, a later Paid in Full brings back the
  // entries the ENROLLMENT refunded, and only those. Which ones is the server's
  // call (it records each refund's origin); the client applies its answer.
  it("applies each entry's status from the server's answer, not a local rule", () => {
    const answer = {
      ...PAID_IN_FULL,
      entries: [
        { id: 'inherited', payment_status: 'paid' },
        { id: 'own-refund', payment_status: 'refunded' },
        { id: 'waived', payment_status: 'waived' },
      ],
    };
    const refunded = { paymentStatus: PaymentStatus.REFUNDED };

    const inherited = applyRecordedEnrollmentPayment(
      entry({ id: 'inherited', ...refunded }),
      answer
    );
    const ownRefund = applyRecordedEnrollmentPayment(
      entry({ id: 'own-refund', ...refunded, refundAmount: 50 }),
      answer
    );
    const waived = applyRecordedEnrollmentPayment(
      entry({ id: 'waived', paymentStatus: PaymentStatus.WAIVED, totalFee: 0 }),
      answer
    );

    expect(inherited.paymentStatus).toBe(PaymentStatus.PAID_ONLINE);
    expect(inherited.paidAmount).toBe(50);
    expect(ownRefund.paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(waived.paymentStatus).toBe(PaymentStatus.WAIVED);
  });
});

describe('useEnrollmentLedgerActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults received dates to today on the show calendar', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 04:30 UTC on the 18th is still the 17th in Chicago.
    vi.setSystemTime(new Date('2026-09-18T04:30:00Z'));
    try {
      const { result } = renderHook(
        () => useEnrollmentLedgerActions({ setEntries: vi.fn(), showTimeZone: 'America/Chicago' }),
        { wrapper }
      );
      expect(result.current.todayInShowZone).toBe('2026-09-17');
    } finally {
      vi.useRealTimers();
    }
  });

  // MYK9-2479 (Option A): the queue keeps no RPC answer. A payment is saved on this device,
  // sent by the queue, and the form's figures come back from the server's reload, never a
  // local figure.
  it('records a payment through the device save once, and patches no figure itself', async () => {
    mocks.save.mockResolvedValue({ kind: 'saved' });
    const setEntries = vi.fn();
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );
    const action = {
      kind: 'payment' as const,
      method: 'cash' as const,
      amount: 15,
      receivedOn: '2026-09-17',
      clientPaymentId: '9a4e2c61-0b7d-4f38-8e15-3d6c2a9f7b40',
    };
    const form = { showId: 'show-1', exhibitorName: 'Jane' };

    let outcome = '';
    await act(async () => {
      outcome = await result.current.record('enr-1', action, form);
    });

    expect(outcome).toBe('saved');
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith('enr-1', action, form);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(setEntries).not.toHaveBeenCalled();
  });

  it('refuses a payment that names no form, and sends nothing', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries: vi.fn(), showTimeZone: 'America/New_York' }),
      { wrapper }
    );
    const record = result.current.record as unknown as (
      enrollmentId: string,
      action: unknown
    ) => Promise<string>;

    let outcome = '';
    await act(async () => {
      outcome = await record('enr-1', {
        kind: 'payment',
        method: 'cash',
        amount: 15,
        receivedOn: '2026-09-17',
        clientPaymentId: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b',
      });
    });

    expect(outcome).toBe('failed');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Payment not recorded. Something went wrong with this request. Restart the app and try again.'
    );
  });

  const PAYMENT = {
    kind: 'payment' as const,
    method: 'cash' as const,
    amount: 25,
    receivedOn: '2026-09-17',
    clientPaymentId: '0c3f9a1e-6b2d-4e8f-a7c5-1d9e4b2f8a63',
  };
  const FORM = { showId: 'show-1', exhibitorName: 'Jane' };

  async function recordPayment(result: { kind: string; [key: string]: unknown }) {
    mocks.save.mockResolvedValue(result);
    const setEntries = vi.fn();
    const hook = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );
    let outcome = '';
    await act(async () => {
      outcome = await hook.result.current.record('enr-1', PAYMENT, FORM);
    });
    return { outcome, setEntries };
  }

  // MYK9-2479: saved on this device and left to the queue: the dialog closes, the form's
  // money is not touched, and the copy promises an automatic send.
  it('a payment offline is queued, says it will be sent on its own, and changes no figure', async () => {
    const { outcome, setEntries } = await recordPayment({ kind: 'queued', sendBegun: false });

    expect(outcome).toBe('queued');
    expect(setEntries).not.toHaveBeenCalled();
    expect(mocks.toastWarning).toHaveBeenCalledWith(
      'Payment saved on this device. It will be sent on its own when the connection returns.'
    );
  });

  it('a payment whose answer was lost is queued again, not confirmed', async () => {
    const { outcome } = await recordPayment({ kind: 'queued', sendBegun: true });

    expect(outcome).toBe('queued');
    expect(mocks.toastWarning).toHaveBeenCalledWith(
      'Payment saved on this device, not confirmed yet. It will be sent again on its own.'
    );
  });

  // Codex round 1 on #4461: a payment this device could not keep is never sent, online or not.
  it('a payment this device could not save sends nothing, even online, and keeps the dialog', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { outcome } = await recordPayment({ kind: 'not-saved', reason: 'not-stored' });

    expect(outcome).toBe('failed');
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'This device could not save the payment, so nothing was sent. Try again, or write it down and record it later.'
    );
  });

  it('an amount that is not money says so, not that the connection is down', async () => {
    const { outcome } = await recordPayment({ kind: 'not-saved', reason: 'invalid-amount' });

    expect(outcome).toBe('failed');
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Payment not saved: enter an amount above $0.00, in dollars and cents.'
    );
  });

  it('a refusal inside the wait stays in the dialog with its reason', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { outcome, setEntries } = await recordPayment({
      kind: 'refused',
      error: refusal('a payment amount must be greater than zero'),
    });

    expect(outcome).toBe('failed');
    expect(setEntries).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Payment not recorded: a payment amount must be greater than zero'
    );
  });

  it('Payment Due after an enrollment refund shows the inherited refund as pending (MYK9-773)', async () => {
    mocks.record.mockResolvedValue({
      ...PAID_IN_FULL,
      payment_status: 'pending',
      paid_amount: '0.00',
      entries: [
        { id: 'entry-1', payment_status: 'pending' },
        { id: 'own-refund', payment_status: 'refunded' },
      ],
    });
    const refunded = {
      paymentStatus: PaymentStatus.REFUNDED,
      enrollmentPaymentStatus: PaymentStatus.REFUNDED,
    };
    let entries = [entry(refunded), entry({ id: 'own-refund', ...refunded, refundAmount: 50 })];
    const setEntries = vi.fn(update => {
      entries = typeof update === 'function' ? update(entries) : update;
    });
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );

    await act(async () => {
      await result.current.record('enr-1', { kind: 'reversal' });
    });

    expect(entries.map(e => [e.id, e.paymentStatus, e.enrollmentPaymentStatus])).toEqual([
      ['entry-1', PaymentStatus.PENDING, PaymentStatus.PENDING],
      ['own-refund', PaymentStatus.REFUNDED, PaymentStatus.PENDING],
    ]);
  });

  // MYK9-773: "Paid in Full: Online" goes through the server too, so an entry
  // the ENROLLMENT refunded follows it to paid and an entry's own refund stays.
  it("Paid in Full: Online asks the server and applies each entry's returned status", async () => {
    mocks.markOnline.mockResolvedValue({
      ...PAID_IN_FULL,
      payment_status: 'paid_online',
      entries: [
        { id: 'entry-1', payment_status: 'paid' },
        { id: 'own-refund', payment_status: 'refunded' },
      ],
    });
    const refunded = {
      paymentStatus: PaymentStatus.REFUNDED,
      enrollmentPaymentStatus: PaymentStatus.REFUNDED,
    };
    let entries = [
      entry(refunded),
      entry({ id: 'own-refund', ...refunded, refundAmount: 50 }),
      entry({ id: 'other', registrationId: 'enr-2' }),
    ];
    const setEntries = vi.fn(update => {
      entries = typeof update === 'function' ? update(entries) : update;
    });
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.markPaidOnline('enr-1');
    });

    expect(ok).toBe(true);
    expect(mocks.markOnline).toHaveBeenCalledTimes(1);
    expect(mocks.markOnline).toHaveBeenCalledWith('enr-1');
    expect(mocks.record).not.toHaveBeenCalled();
    expect(entries.map(e => [e.id, e.paymentStatus, e.enrollmentPaymentStatus])).toEqual([
      ['entry-1', PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_ONLINE],
      ['own-refund', PaymentStatus.REFUNDED, PaymentStatus.PAID_ONLINE],
      ['other', PaymentStatus.PENDING, PaymentStatus.PENDING],
    ]);
  });

  it('leaves the entries alone when the server refuses Paid in Full: Online', async () => {
    mocks.markOnline.mockRejectedValue(refusal('a payment amount must be greater than zero'));
    const setEntries = vi.fn();
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.markPaidOnline('enr-1');
    });

    expect(ok).toBe(false);
    expect(setEntries).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Payment not recorded: a payment amount must be greater than zero'
    );
  });

  it('leaves the entries alone and says why when the server refuses', async () => {
    mocks.record.mockRejectedValue(
      refusal("received date 2026-11-20 is after today (2026-11-13) on the show's calendar")
    );
    const setEntries = vi.fn();
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );

    let outcome = '';
    await act(async () => {
      outcome = await result.current.record('enr-1', { kind: 'reversal' });
    });

    expect(outcome).toBe('failed');
    expect(setEntries).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Payment not recorded: received date 2026-11-20 is after today (2026-11-13) on the show's calendar"
    );
  });

  // MYK9-1824: only the RPCs' own refusals (22023) are shown with their reason.
  // MYK9-2156: a refusal is `failed` (nothing written); anything else is `unconfirmed`.
  async function failRecord(error: unknown, expected: 'failed' | 'unconfirmed') {
    mocks.record.mockRejectedValue(error);
    const setEntries = vi.fn();
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );
    let outcome = '';
    await act(async () => {
      outcome = await result.current.record('enr-1', { kind: 'reversal' });
    });
    expect(outcome).toBe(expected);
    expect(setEntries).not.toHaveBeenCalled();
  }

  const UNCONFIRMED =
    "We could not confirm this was saved. Check the entry's payments: if it is not there, try again.";

  it.each([
    'client_payment_id 0f1e was already used for a different payment',
    'enrollment 9a8b not found',
    'unsupported payment kind: foo',
    'a payment is recorded as cash or check, got card',
    'client_payment_id is only accepted for a payment',
  ])('a technical 22023 (%s) shows a fixed sentence, not its text, and logs it raw', async text => {
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const raw = refusal(text);
    await failRecord(raw, 'failed');

    expect(mocks.toastError).toHaveBeenCalledWith(
      'Payment not recorded. Something went wrong with this request. Restart the app and try again.'
    );
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining(text));
    expect(logSpy).toHaveBeenCalledWith(
      'Error recording enrollment payment:',
      'secretary',
      {},
      raw
    );
  });

  // MYK9-1936: the retry carried the same payment id with a changed date or check number,
  // and the first save had landed. Not "not recorded": the payment is there, as first typed.
  it('a retry whose date or check number changed says the payment may already be saved', async () => {
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const raw = refusal(
      'client_payment_id 0f1e was already saved with a different received date or reference'
    );
    await failRecord(raw, 'unconfirmed');

    expect(mocks.toastError).toHaveBeenCalledWith(
      "This payment may already be saved with the earlier date or check number. Check the entry's payments before saving again."
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Error recording enrollment payment:',
      'secretary',
      {},
      raw
    );
  });

  it.each([
    'a payment amount must be greater than zero',
    'invalid payment amount 12.345',
    'invalid refund amount 0',
    'refund 80 exceeds the 50.00 still held (50.00 paid, 0.00 already refunded)',
  ])('keeps the reason for the desk refusal: %s', async text => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await failRecord(refusal(text), 'failed');
    expect(mocks.toastError).toHaveBeenCalledWith(`Payment not recorded: ${text}`);
  });

  it('an error with no code shows the check-first sentence, not the raw text, and logs it', async () => {
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const raw = new Error('TypeError: Failed to fetch');
    await failRecord(raw, 'unconfirmed');

    expect(mocks.toastError).toHaveBeenCalledWith(UNCONFIRMED);
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('Failed to fetch'));
    expect(logSpy).toHaveBeenCalledWith(
      'Error recording enrollment payment:',
      'secretary',
      {},
      raw
    );
  });

  it('a code other than the RPC refusal shows the check-first sentence, not the raw text', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await failRecord(
      Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
      'unconfirmed'
    );

    expect(mocks.toastError).toHaveBeenCalledWith(UNCONFIRMED);
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('statement timeout'));
  });

  it('the authorization refusal (42501) says so plainly, not the raw text', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await failRecord(
      Object.assign(new Error('not authorized to record payments for enrollment enr-1'), {
        code: '42501',
      }),
      'failed'
    );

    expect(mocks.toastError).toHaveBeenCalledWith(
      'You do not have permission to record payments for this entry.'
    );
  });
});

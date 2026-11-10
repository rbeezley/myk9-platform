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

const mocks = vi.hoisted(() => ({ record: vi.fn(), markOnline: vi.fn(), toastError: vi.fn() }));

vi.mock('@/services/database/show-payments', () => ({
  recordEnrollmentPayment: mocks.record,
  markEnrollmentPaidOnline: mocks.markOnline,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

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

  it("records once and patches only that enrollment's entries from the server's answer", async () => {
    mocks.record.mockResolvedValue(PAID_IN_FULL);
    let entries = [entry(), entry({ id: 'other', registrationId: 'enr-2' })];
    const setEntries = vi.fn(update => {
      entries = typeof update === 'function' ? update(entries) : update;
    });
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );
    const action = {
      kind: 'payment' as const,
      method: 'cash' as const,
      amount: 15,
      receivedOn: '2026-09-17',
    };

    let ok = false;
    await act(async () => {
      ok = await result.current.record('enr-1', action);
    });

    expect(ok).toBe(true);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith('enr-1', action);
    expect(entries[0]!.enrollmentPaymentStatus).toBe(PaymentStatus.PAID_BY_CASH);
    expect(entries[1]!.enrollmentPaymentStatus).toBe(PaymentStatus.PENDING);
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
    mocks.markOnline.mockRejectedValue(refusal('not authorized'));
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
    expect(mocks.toastError).toHaveBeenCalledWith('Payment not recorded: not authorized');
  });

  it('leaves the entries alone and says why when the server refuses', async () => {
    mocks.record.mockRejectedValue(refusal('received date is after today'));
    const setEntries = vi.fn();
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.record('enr-1', { kind: 'reversal' });
    });

    expect(ok).toBe(false);
    expect(setEntries).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Payment not recorded: received date is after today'
    );
  });

  // MYK9-1824: only the RPCs' own refusals (22023) are shown with their reason.
  async function failRecord(error: unknown) {
    mocks.record.mockRejectedValue(error);
    const setEntries = vi.fn();
    const { result } = renderHook(
      () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
      { wrapper }
    );
    let ok = true;
    await act(async () => {
      ok = await result.current.record('enr-1', { kind: 'reversal' });
    });
    expect(ok).toBe(false);
    expect(setEntries).not.toHaveBeenCalled();
  }

  const UNCONFIRMED =
    "We could not confirm this was saved. Check the entry's payments: if it is not there, try again.";

  it('an error with no code shows the check-first sentence, not the raw text, and logs it', async () => {
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const raw = new Error('TypeError: Failed to fetch');
    await failRecord(raw);

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
      Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
    );

    expect(mocks.toastError).toHaveBeenCalledWith(UNCONFIRMED);
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('statement timeout'));
  });

  it('the authorization refusal (42501) says so plainly, not the raw text', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await failRecord(
      Object.assign(new Error('not authorized to record payments for enrollment enr-1'), {
        code: '42501',
      })
    );

    expect(mocks.toastError).toHaveBeenCalledWith(
      'You do not have permission to record payments for this entry.'
    );
  });
});

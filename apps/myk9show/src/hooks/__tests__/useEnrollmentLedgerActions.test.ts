import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  applyRecordedEnrollmentPayment,
  useEnrollmentLedgerActions,
} from '../useEnrollmentLedgerActions';

const mocks = vi.hoisted(() => ({ record: vi.fn(), toastError: vi.fn() }));

vi.mock('@/services/database/show-payments', () => ({
  recordEnrollmentPayment: mocks.record,
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
});

describe('useEnrollmentLedgerActions', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('leaves the entries alone and says why when the server refuses', async () => {
    mocks.record.mockRejectedValue(new Error('received date is after today'));
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
});

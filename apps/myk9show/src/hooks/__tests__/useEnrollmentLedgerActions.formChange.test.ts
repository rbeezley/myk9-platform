/**
 * MYK9-2479 (Codex round 6 on #4461): Payment Due and Paid in Full: Online set what the
 * whole form owes. While this device holds an unsent cash or check payment for the form,
 * neither is sent: the payment would be recorded after it and undo it.
 */
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnrollmentLedgerActions } from '../useEnrollmentLedgerActions';

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  markOnline: vi.fn(),
  blocked: vi.fn(),
  toastError: vi.fn(),
  saveDesk: vi.fn(),
}));

vi.mock('@/features/payments/deskPayments/saveDeskPayment', () => ({
  saveDeskPayment: mocks.saveDesk,
}));

vi.mock('@/services/database/show-payments', () => ({
  recordEnrollmentPayment: mocks.record,
  markEnrollmentPaidOnline: mocks.markOnline,
}));
vi.mock('@/features/payments/deskPayments/formChangeGuard', () => ({
  formChangeBlockedBy: mocks.blocked,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, warning: vi.fn() } }));

const HELD =
  'Not changed: A cash payment of $25.00 for this form is saved on this device, and myK9Show has not confirmed it yet.';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

function renderLedger() {
  const setEntries = vi.fn();
  const { result } = renderHook(
    () => useEnrollmentLedgerActions({ setEntries, showTimeZone: 'America/New_York' }),
    { wrapper }
  );
  return { result, setEntries };
}

describe('a form-wide change waits for the form’s unsent desk payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blocked.mockResolvedValue(null);
  });

  it('Payment Due is not sent while a payment for the form is held, and says why', async () => {
    mocks.blocked.mockResolvedValue(HELD);
    const { result, setEntries } = renderLedger();

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.record('enr-1', { kind: 'reversal' });
    });

    expect(mocks.blocked).toHaveBeenCalledWith('enr-1');
    expect(outcome).toBe('failed');
    expect(mocks.record).not.toHaveBeenCalled();
    expect(setEntries).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(HELD);
  });

  it('Paid in Full: Online is not sent while a payment for the form is held', async () => {
    mocks.blocked.mockResolvedValue(HELD);
    const { result } = renderLedger();

    let ok = true;
    await act(async () => {
      ok = await result.current.markPaidOnline('enr-1');
    });

    expect(ok).toBe(false);
    expect(mocks.markOnline).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(HELD);
  });

  it("another account's payment on this device holds both form-wide changes", async () => {
    const otherAccount =
      'Not changed: this device cannot confirm a payment for this form that was saved under another account. That account needs to sign in on this device and check it.';
    mocks.blocked.mockResolvedValue(otherAccount);
    const { result } = renderLedger();

    await act(async () => {
      await result.current.record('enr-1', { kind: 'reversal' });
      await result.current.markPaidOnline('enr-1');
    });

    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.markOnline).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenNthCalledWith(1, otherAccount);
    expect(mocks.toastError).toHaveBeenNthCalledWith(2, otherAccount);
  });

  it('a received date after today is not saved, and says why', async () => {
    const { result } = renderLedger();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.record(
        'enr-1',
        {
          kind: 'payment',
          method: 'cash',
          amount: 25,
          receivedOn: '2999-01-01',
          reference: null,
          clientPaymentId: '6f1d2c3b-4a59-4e8d-9b7a-0c1e2f3a4b5c',
        },
        { showId: 'show-1', exhibitorName: 'Jane Smith' }
      );
    });

    expect(outcome).toBe('failed');
    expect(mocks.saveDesk).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Payment not saved: the date received is after today. Enter the day the money was handed over.'
    );
  });

  it('with nothing held, Payment Due goes to the server as before', async () => {
    mocks.record.mockResolvedValue({
      id: 'enr-1',
      payment_status: 'pending',
      paid_amount: '0.00',
      payment_reference: null,
      refund_amount: null,
      refund_notes: null,
      refunded_at: null,
    });
    const { result } = renderLedger();

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.record('enr-1', { kind: 'reversal' });
    });

    expect(outcome).toBe('saved');
    expect(mocks.record).toHaveBeenCalledWith('enr-1', { kind: 'reversal' });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('a refund is not held: it takes back money the server already has', async () => {
    mocks.blocked.mockResolvedValue(HELD);
    mocks.record.mockResolvedValue({
      id: 'enr-1',
      payment_status: 'refunded',
      paid_amount: '0.00',
      payment_reference: null,
      refund_amount: '10.00',
      refund_notes: null,
      refunded_at: null,
    });
    const { result } = renderLedger();

    await act(async () => {
      await result.current.record('enr-1', {
        kind: 'refund',
        amount: 10,
        method: 'cash',
        receivedOn: '2026-11-27',
        notes: null,
      });
    });

    expect(mocks.blocked).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });
});

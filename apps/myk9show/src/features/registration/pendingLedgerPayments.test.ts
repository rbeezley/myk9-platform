import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_LEDGER_PAYMENTS_KEY,
  pendingLedgerPayments,
  type PendingLedgerPayment,
} from './pendingLedgerPayments';

const payment = (overrides: Partial<PendingLedgerPayment> = {}): PendingLedgerPayment => ({
  clientPaymentId: 'pay-1',
  showId: 'show-1',
  ownerId: 'owner-1',
  enrollmentId: 'enr-1',
  amount: 30,
  method: 'check',
  receivedOn: '2026-07-07',
  reference: null,
  ...overrides,
});

describe('pendingLedgerPayments (MYK9-677)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps a pending payment in localStorage, scoped to its show and owner', () => {
    pendingLedgerPayments.add(payment());
    pendingLedgerPayments.add(payment({ clientPaymentId: 'pay-2', ownerId: 'owner-2' }));

    expect(JSON.parse(localStorage.getItem(PENDING_LEDGER_PAYMENTS_KEY)!)).toHaveLength(2);
    expect(pendingLedgerPayments.forOwner('show-1', 'owner-1')).toEqual([payment()]);
    expect(pendingLedgerPayments.forOwner('show-2', 'owner-1')).toEqual([]);
  });

  it('removes by key and clears the storage entry when nothing is left', () => {
    pendingLedgerPayments.add(payment());
    pendingLedgerPayments.remove('pay-1');

    expect(localStorage.getItem(PENDING_LEDGER_PAYMENTS_KEY)).toBeNull();
  });

  it('reads a corrupt entry as nothing pending instead of throwing', () => {
    localStorage.setItem(PENDING_LEDGER_PAYMENTS_KEY, '{not json');

    expect(pendingLedgerPayments.forOwner('show-1', 'owner-1')).toEqual([]);
  });

  it('does not throw when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => pendingLedgerPayments.add(payment())).not.toThrow();
  });
});

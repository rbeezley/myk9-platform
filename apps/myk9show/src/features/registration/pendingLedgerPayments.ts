import type { LedgerMethod } from '@/features/payments/showPaymentLedger';

/**
 * MYK9-677: a secretary-received payment the wizard has not yet confirmed in
 * the payments ledger.
 *
 * The wizard creates the entries first and records the money second. If the
 * second step fails (or its answer is lost), a retry of the same submission
 * creates no new entries, so nothing would ever record that money. The intent
 * is therefore saved BEFORE the ledger call, with its own `clientPaymentId`,
 * and every later organizer submit for the same show and owner settles what is
 * still pending. The RPC treats a repeated key as already recorded, so a retry
 * after a lost answer writes nothing twice.
 *
 * Kept in localStorage so a page reload keeps the key; every access is
 * guarded, and a browser that refuses storage still records the payment (it
 * only loses the retry-after-reload safety net).
 */
export interface PendingLedgerPayment {
  clientPaymentId: string;
  showId: string;
  ownerId: string;
  enrollmentId: string;
  amount: number;
  method: LedgerMethod;
  receivedOn: string;
  reference: string | null;
}

export const PENDING_LEDGER_PAYMENTS_KEY = 'myk9.pendingLedgerPayments';

function readAll(): PendingLedgerPayment[] {
  try {
    const raw = localStorage.getItem(PENDING_LEDGER_PAYMENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PendingLedgerPayment[]) : [];
  } catch {
    return [];
  }
}

function writeAll(payments: PendingLedgerPayment[]): void {
  try {
    if (payments.length === 0) localStorage.removeItem(PENDING_LEDGER_PAYMENTS_KEY);
    else localStorage.setItem(PENDING_LEDGER_PAYMENTS_KEY, JSON.stringify(payments));
  } catch {
    // Storage refused: the in-flight call still records the payment.
  }
}

export const pendingLedgerPayments = {
  add(payment: PendingLedgerPayment): void {
    writeAll([...readAll(), payment]);
  },
  forOwner(showId: string, ownerId: string): PendingLedgerPayment[] {
    return readAll().filter(p => p.showId === showId && p.ownerId === ownerId);
  },
  remove(clientPaymentId: string): void {
    writeAll(readAll().filter(p => p.clientPaymentId !== clientPaymentId));
  },
};

export type PendingLedgerPaymentStore = typeof pendingLedgerPayments;

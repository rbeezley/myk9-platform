/**
 * Pure summary math for the exhibitor's own payments header ("how much have I
 * spent at a glance"). Kept separate from the page so the money summation is
 * unit-testable in isolation — mirrors the admin-side pattern in payoutLedger.ts
 * (summarizeLedger).
 *
 * Currencies never get co-mingled: rows are grouped per currency so a USD + CAD
 * mix yields two totals rather than one meaningless sum. The page renders the
 * single-currency case plainly and degrades to per-currency rows otherwise.
 */

/** The minimal MyPayment fields the summary needs (structural subset). */
export interface PaymentSummaryRow {
  amountCents: number;
  currency: string;
  status: string;
}

export interface CurrencyTotal {
  /** Lowercased ISO currency code (e.g. 'usd'). */
  currency: string;
  /** Net spend: paid/succeeded add, refunded subtract (signed-aware). */
  totalPaidCents: number;
  /** How many settled rows (paid + refunded) fed this total. */
  paymentCount: number;
}

// A row counts toward spend only once money has actually moved. Pending/failed/
// cancelled rows are excluded — they aren't spend. Refunds are still "payments"
// for the count (the card was charged), but reduce the total.
const PAID_STATUSES = new Set(['succeeded', 'paid']);
const REFUND_STATUSES = new Set(['refunded']);

/**
 * Group settled payments by currency and total net spend per currency.
 * Returns one bucket per currency, sorted by currency code. Empty input → [].
 */
export function summarizeMyPayments(rows: PaymentSummaryRow[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();

  for (const row of rows) {
    const status = row.status.toLowerCase();
    const isPaid = PAID_STATUSES.has(status);
    const isRefund = REFUND_STATUSES.has(status);
    if (!isPaid && !isRefund) continue;

    const currency = (row.currency || 'usd').toLowerCase();
    const acc = byCurrency.get(currency) ?? { currency, totalPaidCents: 0, paymentCount: 0 };
    acc.totalPaidCents += isRefund ? -row.amountCents : row.amountCents;
    acc.paymentCount += 1;
    byCurrency.set(currency, acc);
  }

  return [...byCurrency.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

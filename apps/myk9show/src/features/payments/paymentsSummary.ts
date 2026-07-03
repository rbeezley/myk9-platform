/**
 * Pure summary math for the exhibitor's own payments header ("how much have I
 * spent at a glance"). Kept separate from the page so the money summation is
 * unit-testable in isolation — mirrors the admin-side pattern in payoutLedger.ts
 * (summarizeLedger).
 *
 * Currencies never get co-mingled: rows are grouped per currency so a USD + CAD
 * mix yields two totals rather than one meaningless sum. The page renders the
 * single-currency case plainly and degrades to per-currency rows otherwise.
 *
 * Refund handling — read carefully. stripe_orders.amount_cents is the gross
 * charge. App-originated entry refunds are recorded on entries.refund_amount and
 * may leave stripe_orders.status as `succeeded`, so useMyPayments supplies
 * netPaidCents for summary math. Legacy/dashboard refunded order rows without a
 * net value are excluded by status.
 */

/** The minimal MyPayment fields the summary needs (structural subset). */
export interface PaymentSummaryRow {
  amountCents: number;
  netPaidCents?: number;
  currency: string;
  status: string;
}

export interface CurrencyTotal {
  /** Lowercased ISO currency code (e.g. 'usd'). */
  currency: string;
  /** Total of paid, non-refunded orders in this currency. */
  totalPaidCents: number;
  /** How many paid, non-refunded orders fed this total. */
  paymentCount: number;
}

export interface PaymentDisplaySummaryRow {
  amountCents: number;
  currency: string;
}

// A row counts toward spend only once money has actually moved and stayed moved.
// Pending/failed/cancelled rows aren't spend; refunded orders are excluded too
// (see the refund note above — the row carries the gross charge, not the refund
// amount, so it can't be netted, and the money came back).
const PAID_STATUSES = new Set(['succeeded', 'paid']);

/**
 * Group paid, non-refunded orders by currency and total spend per currency.
 * Returns one bucket per currency, sorted by currency code. Empty input — or
 * input with no paid net amount (e.g. all refunded) — yields [].
 */
export function summarizeMyPayments(rows: PaymentSummaryRow[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();

  for (const row of rows) {
    if (!PAID_STATUSES.has(row.status.toLowerCase())) continue;

    const netPaidCents = row.netPaidCents ?? row.amountCents;
    if (netPaidCents <= 0) continue;

    const currency = (row.currency || 'usd').toLowerCase();
    const acc = byCurrency.get(currency) ?? { currency, totalPaidCents: 0, paymentCount: 0 };
    acc.totalPaidCents += netPaidCents;
    acc.paymentCount += 1;
    byCurrency.set(currency, acc);
  }

  return [...byCurrency.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

/**
 * Summary for the exhibitor-visible ledger. This intentionally works from
 * display rows, not raw orders, so visible refunds subtract from the header
 * total instead of disappearing from the math.
 */
export function summarizePaymentDisplayRows(rows: PaymentDisplaySummaryRow[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();

  for (const row of rows) {
    const currency = (row.currency || 'usd').toLowerCase();
    const acc = byCurrency.get(currency) ?? { currency, totalPaidCents: 0, paymentCount: 0 };
    acc.totalPaidCents += row.amountCents;
    if (row.amountCents > 0) acc.paymentCount += 1;
    byCurrency.set(currency, acc);
  }

  return [...byCurrency.values()]
    .filter(total => total.totalPaidCents > 0)
    .sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

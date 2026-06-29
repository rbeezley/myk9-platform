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
 * Refund handling — read carefully. useMyPayments reads one stripe_orders row
 * per order whose `status` mutates in place; on refund the row's `amountCents`
 * stays the ORIGINAL charge — there is no separate refund-delta field (unlike
 * the admin entries table's `refund_amount`, which is why payoutLedger can do
 * real net math and we can't). So a refunded order's amount tells us nothing
 * about how much came back. The only honest figure here is money currently paid
 * and NOT refunded: refunded orders are excluded entirely (a fully refunded
 * order = zero net spend, the dominant real case — entry withdrawn → full
 * refund). This understates the rare partial refund, but with no delta column
 * available that's unrecoverable; we do not pretend otherwise by subtracting a
 * full charge that was only partly returned.
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
  /** Total of paid, non-refunded orders in this currency. */
  totalPaidCents: number;
  /** How many paid, non-refunded orders fed this total. */
  paymentCount: number;
}

// A row counts toward spend only once money has actually moved and stayed moved.
// Pending/failed/cancelled rows aren't spend; refunded orders are excluded too
// (see the refund note above — the row carries the gross charge, not the refund
// amount, so it can't be netted, and the money came back).
const PAID_STATUSES = new Set(['succeeded', 'paid']);

/**
 * Group paid, non-refunded orders by currency and total spend per currency.
 * Returns one bucket per currency, sorted by currency code. Empty input — or
 * input with no paid orders (e.g. all refunded) — yields [].
 */
export function summarizeMyPayments(rows: PaymentSummaryRow[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();

  for (const row of rows) {
    if (!PAID_STATUSES.has(row.status.toLowerCase())) continue;

    const currency = (row.currency || 'usd').toLowerCase();
    const acc = byCurrency.get(currency) ?? { currency, totalPaidCents: 0, paymentCount: 0 };
    acc.totalPaidCents += row.amountCents;
    acc.paymentCount += 1;
    byCurrency.set(currency, acc);
  }

  return [...byCurrency.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

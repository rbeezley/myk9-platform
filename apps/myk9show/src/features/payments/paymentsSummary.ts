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
  status: string;
}

export interface PaymentLedgerTotal {
  currency: string;
  grossPaidCents: number;
  refundCents: number;
  netPaidCents: number;
  paymentCount: number;
  refundCount: number;
}

// A row counts toward spend only once money has actually moved and stayed moved.
// Pending/failed/cancelled rows aren't spend; refunded orders are excluded too
// (see the refund note above — the row carries the gross charge, not the refund
// amount, so it can't be netted, and the money came back).
const PAID_STATUSES = new Set(['succeeded', 'paid']);

export function summarizePaymentLedgerTotals(
  rows: PaymentDisplaySummaryRow[]
): PaymentLedgerTotal[] {
  const byCurrency = new Map<string, PaymentLedgerTotal>();

  for (const row of rows) {
    const currency = (row.currency || 'usd').toLowerCase();
    const acc = byCurrency.get(currency) ?? {
      currency,
      grossPaidCents: 0,
      refundCents: 0,
      netPaidCents: 0,
      paymentCount: 0,
      refundCount: 0,
    };

    if (row.amountCents < 0) {
      acc.refundCents += Math.abs(row.amountCents);
      acc.refundCount += 1;
    } else if (PAID_STATUSES.has(row.status.toLowerCase())) {
      acc.grossPaidCents += row.amountCents;
      acc.paymentCount += 1;
    }

    // Deliberately NOT clamped at zero. Over the whole ledger every refund row
    // sits beside the charge it reverses, so gross >= refunds and the clamp was
    // a no-op. Once the ledger can be scoped to one calendar year that
    // invariant breaks: a year holding only a refund for a prior year's charge
    // has gross 0 and refunds 3000, and clamping reported "Net paid $0.00" for
    // $30 that demonstrably came back. A signed total is the arithmetically
    // honest answer, and the negative is exactly what a cash-basis year wants.
    acc.netPaidCents = acc.grossPaidCents - acc.refundCents;
    byCurrency.set(currency, acc);
  }

  return [...byCurrency.values()]
    .filter(total => total.grossPaidCents > 0 || total.refundCents > 0)
    .sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

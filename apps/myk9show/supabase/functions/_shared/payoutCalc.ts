// Pure payout math shared by cron-process-payouts (Deno) and vitest.
// Keep this module free of Deno/npm imports so the colocated test runs under Node.

export interface PayoutEntry {
  /** entries.entry_fee — DECIMAL dollars (there is no cents column). */
  entry_fee: number | null;
  payment_method: string | null;
  payment_status: string | null;
  /** entries.refund_amount — DECIMAL dollars, service-role-only (write guard). */
  refund_amount: number | null;
}

// The club's share of a show: every entry paid ONLINE, minus whatever was
// refunded per entry. The deduction keys on refund_amount — NOT on
// payment_status — for two reasons (PR #625 reviews):
// 1. Partial refunds flip payment_status to 'refunded' but the club is still
//    owed the unrefunded remainder.
// 2. refund_amount is service-role-only (trigger-guarded); payment_status is
//    writable by show managers, so a forged status flip must not be able to
//    shrink a payout without a real Stripe refund behind it.
// Desk payments (cash/check/waived/secretary_paid) never ran through Stripe,
// so they never enter a transfer. Rounding happens per entry — DECIMAL(10,2)
// dollars convert exactly; summing floats first would not.
export function calculateShowPayoutCents(entries: PayoutEntry[]): number {
  return entries
    .filter(
      e =>
        e.payment_method === 'online' &&
        (e.payment_status === 'paid' || e.payment_status === 'refunded')
    )
    .reduce((sum, e) => {
      const feeCents = Math.round((e.entry_fee ?? 0) * 100);
      const refundCents = Math.round((e.refund_amount ?? 0) * 100);
      return sum + Math.max(0, feeCents - refundCents);
    }, 0);
}

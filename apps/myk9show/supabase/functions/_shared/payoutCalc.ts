// Pure payout math shared by cron-process-payouts (Deno) and vitest.
// Keep this module free of Deno/npm imports so the colocated test runs under Node.

export interface PayoutEntry {
  /** entries.entry_fee — DECIMAL dollars (there is no cents column). */
  entry_fee: number | null;
  payment_method: string | null;
  payment_status: string | null;
}

// The club's share of a show: every entry paid ONLINE and still 'paid'
// (refunds flip payment_status to 'refunded' and drop out automatically).
// Desk payments (cash/check/waived/secretary_paid) never ran through Stripe,
// so they never enter a transfer. Rounding happens per entry — DECIMAL(10,2)
// dollars convert exactly; summing floats first would not.
export function calculateShowPayoutCents(entries: PayoutEntry[]): number {
  return entries
    .filter(e => e.payment_method === 'online' && e.payment_status === 'paid')
    .reduce((sum, e) => sum + Math.round((e.entry_fee ?? 0) * 100), 0);
}

// Pure reuse decision for stripe-refund-show (Deno-free; colocated vitest).
//
// The bulk make-whole refund issues ONE refund per PaymentIntent, tagged
// metadata.show_refund = showId. Before creating one it lists the intent's
// refunds and reuses an existing live show-refund for THIS show, so a re-run of
// a partially-completed bulk refund never double-refunds an intent. Mirrors
// refundReuse.ts (the per-entry version), keyed on show instead of entry.
//
// Dead refunds (failed/canceled) are ignored — honoring one would stamp entries
// refunded and shrink the club payout while the customer was never paid.

export interface PriorShowRefund {
  id: string;
  status: string | null;
  metadata?: { show_refund?: string } | null;
}

const DEAD_STATUSES = new Set(['failed', 'canceled']);

export function findReusableShowRefund<T extends PriorShowRefund>(
  refunds: T[],
  showId: string
): T | undefined {
  return refunds.find(
    r => r.metadata?.show_refund === showId && !DEAD_STATUSES.has(r.status ?? '')
  );
}

/** Idempotency-key attempt counter — counts only THIS show's prior refunds on
 * the intent, so a retry after a genuine failure gets a fresh key instead of
 * replaying the cached failure (same lesson as refundAttemptCount). */
export function showRefundAttemptCount(refunds: PriorShowRefund[], showId: string): number {
  return refunds.filter(r => r.metadata?.show_refund === showId).length;
}

// Pure reuse decision for stripe-refund-entry (Deno-free; colocated vitest).
//
// One refund per entry: before creating a refund, the function lists the
// payment intent's refunds and reuses the one stamped with this entry_id.
// Round-9 review: a refund can END UP failed or canceled (Stripe statuses:
// pending | requires_action | succeeded | failed | canceled) — reusing a dead
// one would stamp the entry refunded, shrink the club's payout, and leave the
// customer unpaid. Only in-flight or settled refunds are honored; a dead one
// is ignored so a fresh refund is created.

export interface PriorRefund {
  id: string;
  status: string | null;
  metadata?: { entry_id?: string } | null;
}

const DEAD_STATUSES = new Set(['failed', 'canceled']);

export function findReusableRefund<T extends PriorRefund>(
  refunds: T[],
  entryId: string
): T | undefined {
  return refunds.find(
    r => r.metadata?.entry_id === entryId && !DEAD_STATUSES.has(r.status ?? '')
  );
}

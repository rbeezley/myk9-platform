// Replaying the refund a recorded order still owes (Codex rounds 10-12 on
// #2689). Deno-free; stripe-webhook's replay-first entry (paidSessionEntry.ts)
// calls replayOwedRefund for a session that already has a stripe_orders row.
//
// TWO INDEPENDENT GUARDS, because a replay queues a refund that an admin can
// then approve:
//   1. OPT-IN MARKER. Only an order written by the queue path carries
//      `refund_queue: 1` (REFUND_QUEUE_MARKER), in the same insert as its
//      overflow_refund / invalid_entry_refund. Orders written by the old
//      auto-refund code also carry overflow_refund, but their refund was
//      ALREADY ISSUED; without the marker nothing is replayed. Such an order
//      falls back to the operator alerts it already raised.
//   2. LEGACY REFUND CHECK (defence in depth). Before queueing, the payment
//      intent's refunds are listed at Stripe; a refund the old code issued for
//      this session (metadata.type entry_cart_overflow_auto_refund /
//      entry_payment_request_auto_refund) means it was already refunded, and
//      nothing is queued. The old code recorded nothing about the refund on
//      the order row, so Stripe is the only place to look.

import {
  queueRefundForApproval,
  type QueueDeps,
  type QueueRefundInput,
  type QueueRefundOutcome,
} from './refundRequests.ts';

/** The opt-in marker the queue path writes on every order it records. */
export const REFUND_QUEUE_MARKER = { refund_queue: 1 } as const;

/** Refund types the pre-#2689 webhook issued by itself, without approval. */
export const LEGACY_AUTO_REFUND_TYPES: ReadonlySet<string> = new Set([
  'entry_cart_overflow_auto_refund',
  'entry_payment_request_auto_refund',
]);

export interface RecordedOrderRow {
  sessionId: string;
  paymentIntentId: string | null;
  showId: string | null;
  metadata: unknown;
}

/**
 * The refund a recorded order still owes, rebuilt from its metadata, or null:
 * when the order is not marked as written by the queue path (guard 1), or
 * owes no queued refund.
 */
export function queuedRefundFromOrder(order: RecordedOrderRow): QueueRefundInput | null {
  const meta = (
    order.metadata && typeof order.metadata === 'object' ? order.metadata : {}
  ) as Record<string, unknown>;
  if (meta.refund_queue !== REFUND_QUEUE_MARKER.refund_queue) return null;

  const decision = (key: string) => {
    const value = meta[key] as
      { action?: unknown; amount_cents?: unknown; reason?: unknown } | null | undefined;
    return value &&
      value.action === 'refund' &&
      typeof value.amount_cents === 'number' &&
      typeof value.reason === 'string'
      ? { amountCents: value.amount_cents, reason: value.reason }
      : null;
  };
  const ids = (key: string) =>
    Array.isArray(meta[key]) ? (meta[key] as unknown[]).filter(v => typeof v === 'string') : [];

  const overflow = decision('overflow_refund');
  if (overflow) {
    return {
      kind: 'cart_overflow',
      sessionId: order.sessionId,
      paymentIntentId: order.paymentIntentId,
      amountCents: overflow.amountCents,
      reason: overflow.reason,
      summaryHtml:
        'Paid cart lines could not be served (queued again from the recorded order after a redelivery).',
      detail: {
        waitlisted_cart_item_ids: ids('waitlisted_cart_item_ids'),
        denied_cart_item_ids: ids('denied_cart_item_ids'),
        failed_cart_item_ids: ids('failed_cart_item_ids'),
      },
      cartId: typeof meta.cart_id === 'string' ? meta.cart_id : null,
      showId: order.showId,
    };
  }
  const invalid = decision('invalid_entry_refund');
  if (invalid) {
    return {
      kind: 'entry_payment_link',
      sessionId: order.sessionId,
      paymentIntentId: order.paymentIntentId,
      amountCents: invalid.amountCents,
      reason: invalid.reason,
      summaryHtml:
        'A payment-link charge could not be honored in full (queued again from the recorded order after a redelivery).',
      detail: { invalid_entry_ids: ids('invalid_entry_ids') },
      entryPaymentLinkId:
        typeof meta.entry_payment_link_id === 'string' ? meta.entry_payment_link_id : null,
      showId: order.showId,
    };
  }
  return null;
}

export interface ReplayDeps extends QueueDeps {
  /** Every refund on a payment intent (all pages). Throws when Stripe is unreachable. */
  listIntentRefunds: (
    paymentIntentId: string
  ) => Promise<Array<{ id: string; metadata?: Record<string, string> | null }>>;
}

export type ReplayOutcome = 'nothing_owed' | 'legacy_refunded' | QueueRefundOutcome;

/**
 * Replay the order's owed refund through the queue, behind both guards.
 * Throws (5xx, Stripe redelivers) when Stripe cannot be read or the queue
 * write cannot be confirmed.
 */
export async function replayOwedRefund(
  deps: ReplayDeps,
  order: RecordedOrderRow
): Promise<ReplayOutcome> {
  const owed = queuedRefundFromOrder(order);
  if (!owed) return 'nothing_owed';

  if (owed.paymentIntentId) {
    const refunds = await deps.listIntentRefunds(owed.paymentIntentId);
    const legacy = refunds.find(
      r =>
        LEGACY_AUTO_REFUND_TYPES.has(r.metadata?.type ?? '') &&
        r.metadata?.checkout_session_id === order.sessionId
    );
    if (legacy) {
      console.log(
        `Session ${order.sessionId}: already refunded under the legacy auto-refund path (${legacy.id}) — not queued`
      );
      return 'legacy_refunded';
    }
  }
  return queueRefundForApproval(deps, owed);
}

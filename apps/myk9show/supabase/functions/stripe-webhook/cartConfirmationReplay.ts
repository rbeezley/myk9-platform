// MYK9-964: a paid cart's receipt (the confirmation email) is sent exactly
// once per checkout session. Deno-free; index.ts injects the reads, the
// sender and the marker write.
//
// THE GATE IS PER SESSION: cart_fulfillments.receipt_sent_at. The sender
// below runs on every path where the session's order is known to exist (the
// first delivery after its latch call, however that call went, and both
// replay-first branches of a redelivery). It sends only while the marker is
// NULL, and sets the marker after a successful send.
//
// It never gates on entries.confirmation_email_sent_at: the scheduled
// send-confirmation-email sender stamps entries whatever their payment status,
// so a Finish Payment entry can carry that stamp from before its checkout, and
// gating on it suppressed the receipt for newly bought entries too (Codex
// round 2 on #2744). sendEntryConfirmationEmail still writes those entry
// stamps for the scheduled sender's sake; that is a separate concern.
//
// Concurrency: two deliveries can both read a NULL marker and both send.
// Resend's idempotency key, one per session (stripe-entry-confirmation-<id>),
// makes the second send the same message; the marker is set once.

import type { RefundQueueDeps } from '../_shared/refundRequests.ts';
import { closeCartFulfillment, type CloseCartInput } from './cartFulfillment.ts';

export interface ReplayedCartOrder {
  entryIds: string[];
  showId: string;
  /** Who paid: the person the receipt goes to, or null when unresolvable. */
  exhibitorPersonId: string | null;
  subtotalCents: number;
  totalCents: number;
}

/** The session's run, as the receipt gate reads it. */
export interface CartReceiptState {
  latched: boolean;
  receiptSentAt: string | null;
}

export interface CartReceiptDeps {
  /** The session's fulfillment run, or null (an order from before MYK9-964). Throws when unreadable. */
  readReceiptState: (sessionId: string) => Promise<CartReceiptState | null>;
  /** The session's cart order, or null when it has none. Throws when unreadable. */
  readOrder: (sessionId: string) => Promise<ReplayedCartOrder | null>;
  /** Send the receipt. True only when the provider accepted it. */
  send: (order: ReplayedCartOrder) => Promise<boolean>;
  /** Set receipt_sent_at where it is still NULL. Throws when unconfirmed. */
  markReceiptSent: (sessionId: string) => Promise<void>;
}

export type CartReceiptOutcome =
  | 'sent'
  | 'already_sent'
  | 'send_failed'
  | 'no_run'
  | 'not_latched'
  | 'no_order'
  | 'no_entries'
  | 'no_recipient';

/** THE paid-cart receipt sender: at most one receipt per checkout session. */
export async function sendCartReceiptOnce(
  deps: CartReceiptDeps,
  sessionId: string
): Promise<CartReceiptOutcome> {
  const state = await deps.readReceiptState(sessionId);
  // No run: an order written before MYK9-964, whose webhook sent its receipt.
  if (!state) return 'no_run';
  if (!state.latched) return 'not_latched';
  if (state.receiptSentAt) return 'already_sent';
  const order = await deps.readOrder(sessionId);
  if (!order) return 'no_order';
  if (order.entryIds.length === 0) return 'no_entries';
  if (!order.exhibitorPersonId) return 'no_recipient';
  // A failed send leaves the marker NULL: the next delivery tries again.
  if (!(await deps.send(order))) return 'send_failed';
  await deps.markReceiptSent(sessionId);
  return 'sent';
}

/**
 * The first-time path's end: close the latch, then the receipt, through the
 * SAME sender as the replay-first branches. Never gated on which call closed
 * the latch: a lost first response followed by a successful retry reports
 * latch_closed false, yet nobody has sent the receipt (Codex P2 on #2744).
 */
export async function closeCartThenSendReceipt(
  queue: RefundQueueDeps,
  input: CloseCartInput,
  receipt: CartReceiptDeps
): Promise<CartReceiptOutcome> {
  await closeCartFulfillment(queue, input);
  return sendCartReceiptOnce(receipt, input.sessionId);
}

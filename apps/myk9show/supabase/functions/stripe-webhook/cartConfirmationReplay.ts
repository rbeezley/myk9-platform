// MYK9-964: the paid-cart confirmation email survives a lost latch response.
// Deno-free; index.ts injects the reads and the sender.
//
// complete_cart_fulfillment commits the order, and the delivery that closed
// the latch sends the confirmation. If that delivery dies after the commit
// (its response lost), the redelivery takes the replay-first branch
// (paidSessionEntry.ts) and never reaches fulfillCartRun again. So the
// replay-first branch calls this: when the session's order has entries and
// NONE of them is stamped confirmed (entries.confirmation_email_sent_at, the
// MP-13 stamp sendEntryConfirmationEmail writes after a successful send), the
// confirmation is sent now. The stamp is what stops a second send; Resend's
// idempotency key (stripe-entry-confirmation-<session>) backs it up.

export interface ReplayedCartOrder {
  entryIds: string[];
  showId: string;
  /** Who paid: the person the confirmation goes to, or null when unresolvable. */
  exhibitorPersonId: string | null;
  subtotalCents: number;
  totalCents: number;
}

export interface CartConfirmationReplayDeps {
  /** The session's cart order, or null when it has none. Throws when unreadable. */
  readOrder: (sessionId: string) => Promise<ReplayedCartOrder | null>;
  /** How many of these entries are stamped confirmed. Throws when unreadable. */
  countConfirmed: (entryIds: string[]) => Promise<number>;
  /** Send the confirmation; it stamps the entries itself on success. */
  send: (order: ReplayedCartOrder) => Promise<void>;
}

export type CartConfirmationReplay =
  'sent' | 'already_confirmed' | 'no_entries' | 'no_order' | 'no_recipient';

export async function replayCartConfirmation(
  deps: CartConfirmationReplayDeps,
  sessionId: string
): Promise<CartConfirmationReplay> {
  const order = await deps.readOrder(sessionId);
  if (!order) return 'no_order';
  if (order.entryIds.length === 0) return 'no_entries';
  if ((await deps.countConfirmed(order.entryIds)) > 0) return 'already_confirmed';
  if (!order.exhibitorPersonId) return 'no_recipient';
  console.log(`Session ${sessionId}: confirmation never stamped — sending it on the replay`);
  await deps.send(order);
  return 'sent';
}

// MYK9-964: replayable cart fulfillment, latch LAST. Deno-free; index.ts
// injects the Supabase rpc/reads, the Finish Payment line payer and
// alertAdmin, so the colocated vitest drives every branch.
//
//   begin   begin_cart_fulfillment holds the cart (active -> fulfilling) and
//           snapshots its lines; a redelivery gets 'resumed'.
//   work    each line's outcome is RECORDED, first write wins: a new line
//           through fulfill_cart_line (create_online_paid_entry at most once),
//           a Finish Payment line paid in place, then record_cart_line_outcome.
//           A recorded line is never worked again, so a replay sees the same
//           outcomes whatever class capacity is now.
//   close   complete_cart_fulfillment closes the latch with the order and the
//           cart_overflow refund request in ONE transaction.
//
// Any write this cannot confirm THROWS (5xx): nothing has latched, Stripe
// redelivers, and the redelivery replays the recorded outcomes. A redelivery
// after the latch finds the order and the request first (paidSessionEntry.ts).
// Refunds are never automatic: the request waits for a site admin's approval.

import type { CartOverflowRefundDecision } from '../_shared/cartOverflowRefund.ts';
import {
  cartOverflowCannotRefundAlert,
  overflowNeedsManualAmountAlert,
  queueUnconfirmedAlert,
} from '../_shared/refundAlertCopy.ts';
import { ensureRefundRequestAlert, QUEUE_WRITE_ATTEMPTS } from '../_shared/refundRequests.ts';
import type { RefundQueueDeps } from '../_shared/refundRequests.ts';

const SOURCE = 'stripe-webhook';

/** One snapshotted cart line, as cart_fulfillment_lines stores it. */
export interface CartFulfillmentLine {
  cart_item_id: string;
  line_no: number;
  dog_id: string;
  class_id: string;
  existing_entry_id: string | null;
  line_amount_cents: number;
  outcome: LineOutcome | null;
  entry_id: string | null;
  paid_entry_id: string | null;
  waitlist_entry_id: string | null;
  error_message: string | null;
}

export const CART_FULFILLMENT_LINE_COLUMNS =
  'cart_item_id, line_no, dog_id, class_id, existing_entry_id, line_amount_cents, outcome, entry_id, paid_entry_id, waitlist_entry_id, error_message';

export type LineOutcome = 'created_entry' | 'waitlisted' | 'denied' | 'failed' | 'paid_existing';

/** What paying a Finish Payment line in place came to. Throws on a transient error. */
export type FinishPaymentResult =
  | { outcome: 'paid_existing'; entryId: string; paidEntryId: string }
  | { outcome: 'failed'; errorMessage: string };

export interface CartFulfillmentDeps extends RefundQueueDeps {
  /** The session's snapshotted lines, in line order. Throws when unreadable. */
  readLines: (sessionId: string) => Promise<CartFulfillmentLine[]>;
  /** Pay a Finish Payment line's existing entry in place (or recognize it already paid). */
  payFinishPaymentLine: (line: CartFulfillmentLine) => Promise<FinishPaymentResult>;
}

export type BeginOutcome = 'begun' | 'resumed' | 'completed' | 'not_claimable';

function firstRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? (row as T) : null;
}

async function rpcRow<T>(deps: RefundQueueDeps, fn: string, args: Record<string, unknown>) {
  try {
    const result = await deps.rpc(fn, args);
    if (result.error) return { row: null, error: result.error.message };
    const row = firstRow<T>(result.data);
    return row ? { row, error: null } : { row: null, error: 'no row returned' };
  } catch (err) {
    return { row: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Hold the cart and snapshot its lines (p_line_amounts: cart item id ->
 * verified cents). THROWS when it cannot be confirmed; the cart is then
 * either still active (nothing written) or held, and the redelivery resumes.
 */
export async function beginCartFulfillment(
  deps: RefundQueueDeps,
  input: {
    cartId: string;
    sessionId: string;
    paymentIntentId: string;
    lineAmounts: Record<string, number>;
  }
): Promise<{ outcome: BeginOutcome; cartStatus: string | null }> {
  const { row, error } = await rpcRow<{ outcome: string; cart_status: string | null }>(
    deps,
    'begin_cart_fulfillment',
    {
      p_cart_id: input.cartId,
      p_session_id: input.sessionId,
      p_payment_intent_id: input.paymentIntentId,
      p_line_amounts: input.lineAmounts,
    }
  );
  const outcome = row?.outcome;
  if (
    outcome !== 'begun' &&
    outcome !== 'resumed' &&
    outcome !== 'completed' &&
    outcome !== 'not_claimable'
  ) {
    throw new Error(
      `begin_cart_fulfillment for cart ${input.cartId} unconfirmed: ${error ?? outcome}`
    );
  }
  return { outcome, cartStatus: row?.cart_status ?? null };
}

export interface CartOverflowLine {
  cartItemId: string;
  classId: string;
  dogId: string;
  waitlistEntryId?: string;
  errorMessage?: string;
}

/** The recorded outcomes, shaped for decideCartOverflowRefund and the order. */
export interface CartLineResults {
  /** Entries the exhibitor bought (receipts, order entry_ids). */
  entryIds: string[];
  /** Rows that carry the payment (a moved entry's root). */
  paidLineIds: string[];
  /** Unserved lines, by cart item id. */
  noServiceLineIds: string[];
  /** Verified amount per paid line id and per unserved cart item id. */
  lineAmountsById: Map<string, number>;
  waitlisted: CartOverflowLine[];
  denied: CartOverflowLine[];
  failed: CartOverflowLine[];
}

/** Record (or replay) one line's outcome. Throws when it cannot be confirmed. */
async function recordLine(
  deps: CartFulfillmentDeps,
  sessionId: string,
  line: CartFulfillmentLine
): Promise<CartFulfillmentLine> {
  if (line.outcome) return line;

  if (!line.existing_entry_id) {
    const { row, error } = await rpcRow<{
      outcome: LineOutcome;
      entry_id: string | null;
      waitlist_entry_id: string | null;
      error_message: string | null;
    }>(deps, 'fulfill_cart_line', { p_session_id: sessionId, p_cart_item_id: line.cart_item_id });
    if (!row?.outcome) {
      throw new Error(`fulfill_cart_line ${line.cart_item_id} unconfirmed: ${error}`);
    }
    return {
      ...line,
      outcome: row.outcome,
      entry_id: row.entry_id,
      paid_entry_id: row.entry_id,
      waitlist_entry_id: row.waitlist_entry_id,
      error_message: row.error_message,
    };
  }

  const paid = await deps.payFinishPaymentLine(line);
  const { row, error } = await rpcRow<{
    outcome: LineOutcome;
    entry_id: string | null;
    paid_entry_id: string | null;
    error_message: string | null;
  }>(deps, 'record_cart_line_outcome', {
    p_session_id: sessionId,
    p_cart_item_id: line.cart_item_id,
    p_outcome: paid.outcome,
    p_entry_id: paid.outcome === 'paid_existing' ? paid.entryId : null,
    p_paid_entry_id: paid.outcome === 'paid_existing' ? paid.paidEntryId : null,
    p_error_message: paid.outcome === 'failed' ? paid.errorMessage : null,
  });
  if (!row?.outcome) {
    throw new Error(`record_cart_line_outcome ${line.cart_item_id} unconfirmed: ${error}`);
  }
  // The RECORDED outcome wins, even over what this call just found.
  return {
    ...line,
    outcome: row.outcome,
    entry_id: row.entry_id,
    paid_entry_id: row.paid_entry_id,
    error_message: row.error_message,
  };
}

/** Work every snapshotted line in order and return the recorded outcomes. */
export async function workCartLines(
  deps: CartFulfillmentDeps,
  sessionId: string
): Promise<CartLineResults> {
  const lines = await deps.readLines(sessionId);
  if (lines.length === 0) throw new Error(`Session ${sessionId} has no snapshotted cart lines`);

  const results: CartLineResults = {
    entryIds: [],
    paidLineIds: [],
    noServiceLineIds: [],
    lineAmountsById: new Map(),
    waitlisted: [],
    denied: [],
    failed: [],
  };
  for (const snapshot of [...lines].sort((a, b) => a.line_no - b.line_no)) {
    const line = await recordLine(deps, sessionId, snapshot);
    const amount = line.line_amount_cents;
    const overflow: CartOverflowLine = {
      cartItemId: line.cart_item_id,
      classId: line.class_id,
      dogId: line.dog_id,
    };
    if (
      (line.outcome === 'created_entry' || line.outcome === 'paid_existing') &&
      line.entry_id &&
      line.paid_entry_id
    ) {
      results.entryIds.push(line.entry_id);
      results.paidLineIds.push(line.paid_entry_id);
      results.lineAmountsById.set(line.paid_entry_id, amount);
      continue;
    }
    results.noServiceLineIds.push(line.cart_item_id);
    results.lineAmountsById.set(line.cart_item_id, amount);
    if (line.outcome === 'waitlisted') {
      results.waitlisted.push({
        ...overflow,
        waitlistEntryId: line.waitlist_entry_id ?? undefined,
      });
    } else if (line.outcome === 'denied') {
      results.denied.push(overflow);
    } else {
      results.failed.push({
        ...overflow,
        errorMessage: line.error_message ?? `no usable outcome (${line.outcome})`,
      });
    }
  }
  return results;
}

/** What complete_cart_fulfillment returns. */
interface LatchRow {
  latch_closed: boolean;
  cart_status: string | null;
  order_created: boolean;
  refund_request_id: string | null;
  created: boolean;
  request_status: string | null;
  amount_cents: number | null;
  reason: string | null;
  stripe_payment_intent_id: string | null;
}

export interface CloseCartInput {
  sessionId: string;
  cartId: string;
  paymentIntentId: string | null;
  /** The stripe_orders row (column -> value), inserted with the latch. */
  order: Record<string, unknown>;
  decision: CartOverflowRefundDecision;
  lines: CartLineResults;
}

export interface CloseCartOutcome {
  /** True when THIS call closed the latch (it then sends the confirmation). */
  latchClosed: boolean;
  /** The queued cart_overflow request, if any. */
  refundRequestId: string | null;
}

function overflowSummaryHtml(input: CloseCartInput): string {
  const list = (lines: CartOverflowLine[]) =>
    lines.length ? `<code>${lines.map(l => l.cartItemId).join(', ')}</code>` : 'none';
  return `Cart <code>${input.cartId}</code> was PAID, but the classes could not take some
   lines: waitlisted ${list(input.lines.waitlisted)}, denied ${list(input.lines.denied)},
   failed ${list(input.lines.failed)}. Their entry fees are owed back; the service fee is
   kept (MYK9-966), and the club's payout is unaffected (these lines never became entries).`;
}

/**
 * Close the latch LAST: the cart, the order and (when the unserved lines are
 * owed back) the cart_overflow refund request, in one idempotent call,
 * retried. THROWS (5xx) when it cannot be confirmed; the latch is then still
 * open and the redelivery replays the same outcomes and this same call.
 */
export async function closeCartFulfillment(
  deps: RefundQueueDeps,
  input: CloseCartInput
): Promise<CloseCartOutcome> {
  const { decision } = input;
  const owed = decision.action === 'refund' && input.paymentIntentId ? decision : null;
  const args = {
    p_session_id: input.sessionId,
    p_order: input.order,
    p_amount_cents: owed ? owed.amountCents : null,
    p_reason: owed ? owed.reason : null,
    p_detail: owed
      ? {
          cart_id: input.cartId,
          paid_amount_cents: owed.paidAmountCents,
          waitlisted_cart_item_ids: input.lines.waitlisted.map(l => l.cartItemId),
          denied_cart_item_ids: input.lines.denied.map(l => l.cartItemId),
          failed_cart_item_ids: input.lines.failed.map(l => l.cartItemId),
        }
      : {},
  };

  // Nothing can be queued without a computable amount and an intent. Raised
  // BEFORE the latch: a lost latch response sends the redelivery to the
  // replay-first branch, which never reaches this function again.
  if (decision.action === 'needs_manual_amount') {
    const copy = overflowNeedsManualAmountAlert({
      sessionId: input.sessionId,
      invalidCartItemIds: input.lines.noServiceLineIds,
      missingLineIds: decision.missingLineIds,
    });
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `cart-overflow-refund-manual-amount-${input.sessionId}`,
    });
  } else if (decision.action === 'cannot_refund' || (decision.action === 'refund' && !owed)) {
    const copy = cartOverflowCannotRefundAlert({
      sessionId: input.sessionId,
      invalidCartItemIds: input.lines.noServiceLineIds,
      reason: decision.action === 'cannot_refund' ? decision.reason : 'missing_payment_intent',
    });
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `cart-overflow-refund-cannot-refund-${input.sessionId}`,
    });
  }

  let row: LatchRow | null = null;
  let lastError = 'no row returned';
  for (let attempt = 1; attempt <= QUEUE_WRITE_ATTEMPTS && !row; attempt += 1) {
    const result = await rpcRow<LatchRow>(deps, 'complete_cart_fulfillment', args);
    if (result.row) row = result.row;
    else {
      lastError = result.error ?? 'no row returned';
      console.error(
        `complete_cart_fulfillment ${attempt}/${QUEUE_WRITE_ATTEMPTS} for session ${input.sessionId} unconfirmed:`,
        lastError
      );
    }
  }

  if (!row) {
    if (owed && input.paymentIntentId) {
      const copy = queueUnconfirmedAlert({
        summaryHtml: overflowSummaryHtml(input),
        kind: 'cart_overflow',
        sessionId: input.sessionId,
        paymentIntentId: input.paymentIntentId,
        amountCents: owed.amountCents,
        reason: owed.reason,
        message: lastError,
      });
      await deps.alertAdmin(copy.title, copy.html, {
        source: SOURCE,
        dedupeKey: `refund-queue-unconfirmed-cart_overflow-${input.sessionId}`,
      });
    }
    throw new Error(
      `Cart ${input.cartId}: latch, order and refund could not be confirmed; Stripe will retry`
    );
  }

  if (owed && row.refund_request_id && row.stripe_payment_intent_id && row.amount_cents) {
    await ensureRefundRequestAlert(deps, {
      id: row.refund_request_id,
      status: row.request_status,
      kind: 'cart_overflow',
      sessionId: input.sessionId,
      paymentIntentId: row.stripe_payment_intent_id,
      amountCents: row.amount_cents,
      reason: row.reason,
      summaryHtml: overflowSummaryHtml(input),
    });
  }

  return { latchClosed: row.latch_closed === true, refundRequestId: row.refund_request_id };
}

// MYK9-963: a PAID cart checkout that created NOTHING joins the refund
// approval queue as an 'unfulfilled_charge' request. Deno-free; stripe-webhook
// injects the Supabase rpc and alertAdmin, so the colocated vitest drives
// every branch.
//
// OWNER RULES: refunds are never automatic (this only QUEUES; a site admin
// approves in stripe-approve-refund), and a charge that got the exhibitor
// nothing is refunded in FULL, service fee included (MYK9-997,
// fullChargeRefundCents).
//
// queue_unfulfilled_charge_refund is idempotent on (session, kind), so it is
// retried; a write it cannot confirm THROWS (5xx) and Stripe redelivers. Once
// the request exists, every redelivery stops at the webhook's entry
// (paidSessionEntry.ts) and ensures its alert there.
//
// The request is also the latch: begin_cart_fulfillment refuses a session
// that has one, under the same cart lock the queue takes, and the queue
// inserts nothing for a session whose run began first ('delivered'). So a
// concurrent delivery can never fulfill a queued charge (Codex round 1 on
// #2758).

import type { AlertCopy } from './refundAlertCopy.ts';
import { queueUnconfirmedAlert, unfulfilledChargeMissingInputsAlert } from './refundAlertCopy.ts';
import {
  ensureRefundRequestAlert,
  fullChargeRefundCents,
  QUEUE_WRITE_ATTEMPTS,
} from './refundRequests.ts';
import type { RefundQueueDeps } from './refundRequests.ts';

const SOURCE = 'stripe-webhook';

/** Why the checkout created nothing (refund_requests.reason; the RPC refuses any other). */
export type UnfulfilledChargeReason =
  | 'no_cart'
  | 'cart_classes_not_in_show'
  | 'paid_amount_mismatch'
  | 'cart_not_claimable'
  | 'stale_checkout';

export interface UnfulfilledChargeInput {
  sessionId: string;
  paymentIntentId: string | null;
  /** What Stripe charged for the session (its FRESH amount_total). */
  chargedCents: number | null | undefined;
  reason: UnfulfilledChargeReason;
  cartId: string | null;
  showId: string | null;
  detail: Record<string, unknown>;
  /** The case's alert copy (refundAlertCopy.ts): its title and summary. */
  copy: AlertCopy;
}

/**
 * queued / already_queued: the request exists and its alert was ensured.
 * delivered: the session has an order, a fulfillment run or entries, so it
 * did NOT get nothing; other_request: it already has another request.
 * not_queued: no payment intent or amount; the missing-inputs alert went out.
 */
export type UnfulfilledChargeOutcome =
  'queued' | 'already_queued' | 'delivered' | 'other_request' | 'not_queued';

interface QueueRow {
  outcome: string;
  refund_request_id: string | null;
  request_status: string | null;
  amount_cents: number | null;
  reason: string | null;
  stripe_payment_intent_id: string | null;
}

const OUTCOMES: ReadonlySet<string> = new Set([
  'queued',
  'already_queued',
  'delivered',
  'other_request',
]);

async function callQueue(
  deps: RefundQueueDeps,
  args: Record<string, unknown>
): Promise<{ row: QueueRow | null; error: string }> {
  try {
    const result = await deps.rpc('queue_unfulfilled_charge_refund', args);
    if (result.error) return { row: null, error: result.error.message };
    const data = Array.isArray(result.data) ? result.data[0] : result.data;
    const row = data && typeof data === 'object' ? (data as QueueRow) : null;
    return row && OUTCOMES.has(row.outcome)
      ? { row, error: '' }
      : { row: null, error: `unexpected answer: ${row?.outcome ?? 'no row returned'}` };
  } catch (err) {
    return { row: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function queueUnfulfilledChargeRefund(
  deps: RefundQueueDeps,
  input: UnfulfilledChargeInput
): Promise<UnfulfilledChargeOutcome> {
  const amountCents = fullChargeRefundCents(input.chargedCents);
  console.error(
    `CRITICAL: paid session ${input.sessionId} created nothing (${input.reason}); queueing its full charge`
  );
  if (!input.paymentIntentId || !amountCents) {
    const copy = unfulfilledChargeMissingInputsAlert({
      summaryHtml: input.copy.html,
      sessionId: input.sessionId,
      paymentIntentId: input.paymentIntentId,
      amountCents: amountCents ?? input.chargedCents ?? null,
    });
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `unfulfilled-charge-missing-inputs-${input.sessionId}`,
    });
    return 'not_queued';
  }

  const args = {
    p_session_id: input.sessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_amount_cents: amountCents,
    p_reason: input.reason,
    p_cart_id: input.cartId,
    p_show_id: input.showId,
    p_detail: input.detail,
  };
  let row: QueueRow | null = null;
  let lastError = 'no row returned';
  for (let attempt = 1; attempt <= QUEUE_WRITE_ATTEMPTS && !row; attempt += 1) {
    const result = await callQueue(deps, args);
    if (result.row) row = result.row;
    else {
      lastError = result.error;
      console.error(
        `queue_unfulfilled_charge_refund ${attempt}/${QUEUE_WRITE_ATTEMPTS} for session ${input.sessionId} unconfirmed:`,
        lastError
      );
    }
  }

  if (!row) {
    const copy = queueUnconfirmedAlert({
      summaryHtml: input.copy.html,
      kind: 'unfulfilled_charge',
      sessionId: input.sessionId,
      paymentIntentId: input.paymentIntentId,
      amountCents,
      reason: input.reason,
      message: lastError,
    });
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `refund-queue-unconfirmed-unfulfilled_charge-${input.sessionId}`,
    });
    throw new Error(
      `Unfulfilled charge ${input.sessionId}: refund request could not be confirmed; Stripe will retry`
    );
  }

  const outcome = row.outcome as UnfulfilledChargeOutcome;
  if (outcome === 'delivered' || outcome === 'other_request') {
    console.log(`Session ${input.sessionId}: not queued as unfulfilled (${outcome})`);
    return outcome;
  }
  if (row.refund_request_id) {
    await ensureRefundRequestAlert(deps, {
      id: row.refund_request_id,
      status: row.request_status,
      kind: 'unfulfilled_charge',
      sessionId: input.sessionId,
      paymentIntentId: row.stripe_payment_intent_id ?? input.paymentIntentId,
      amountCents: row.amount_cents ?? amountCents,
      reason: row.reason ?? input.reason,
      summaryHtml: input.copy.html,
      title: input.copy.title,
    });
  }
  return outcome;
}

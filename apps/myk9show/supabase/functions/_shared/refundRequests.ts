// The pending-refund queue (MYK9-876 / MYK9-874). Deno-free; the Deno glue
// (stripe-webhook, stripe-approve-refund) injects the Supabase rpc and
// alertAdmin, so the colocated vitest drives every branch.
//
// OWNER RULE (2026-09-29): refunds are never automatic. A webhook that finds a
// charge it cannot honor QUEUES a refund_requests row and raises the CRITICAL
// operator alert; it never calls stripe.refunds.create. Only
// stripe-approve-refund issues the refund, after a site admin approves it.
//
// Every queued request is written in the SAME transaction as its fulfillment
// latch (Codex round 13 on #2689): claim_abandoned_cart_refund (cart ->
// refund_pending) and queue_payment_link_refund (link -> paid). A redelivery
// finds the latch closed and the request beside it.

import {
  abandonedCartMissingInputsAlert,
  queueMissingInputsAlert,
  queueUnconfirmedAlert,
} from './refundAlertCopy.ts';

export const APPROVED_REFUND_METADATA_TYPE = 'approved_refund_request';
export const REFUND_REQUEST_METADATA_KEY = 'refund_request_id';
export const REFUND_ATTEMPT_METADATA_KEY = 'refund_attempt_no';

// Cart overflow is not queued (Codex round 13 on #2689, option C): it is
// refunded by hand from an operator alert until MYK9-964.
export type RefundRequestKind = 'abandoned_cart' | 'entry_payment_link';

interface RpcError {
  message: string;
  code?: string;
}

export interface RefundQueueDeps {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
  alertAdmin: (
    title: string,
    html: string,
    opts: { source: string; dedupeKey: string; detail?: Record<string, unknown> }
  ) => Promise<void>;
}

const SOURCE = 'stripe-webhook';

/**
 * The path when a queued charge is honored by hand instead (Codex round 6 on
 * #2689): without it the request stays approvable and a full refund can still
 * go out after the entries were marked paid.
 */
export const RESOLVE_INSTEAD_HTML =
  'If you fulfill the entries by hand instead, press <strong>Resolve without refund</strong> on the same row (a note is required). Until you do, the refund can still be approved.';

const APPROVE_WHERE = `Approve it under <strong>Refunds awaiting approval</strong> on /admin/health. Do not refund it from the Stripe dashboard: the approval records it. ${RESOLVE_INSTEAD_HTML}`;

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function firstRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? (row as T) : null;
}

/** A request the queue CONFIRMED exists: created, already there, or read back. */
interface ConfirmedRequest {
  id: string;
  /** Its current status, as the queue write or read reported it. */
  status: string | null;
  kind: RefundRequestKind;
  sessionId: string;
  paymentIntentId: string;
  amountCents: number;
  /** Shown when known; the abandoned-cart claim does not report it. */
  reason: string | null;
  summaryHtml: string;
}

/** Closed requests owe nothing: no awaiting-approval alert for them. */
const CLOSED_REQUEST_STATUSES: ReadonlySet<string> = new Set([
  'refunded',
  'resolved_without_refund',
]);

/**
 * The ONE place the "awaiting approval" alert is raised (Codex round 11 on
 * #2689). Called whenever the queue confirms a request exists, for every
 * kind, whether the write created it, found it already there, or read it
 * back, so an alert lost with a lost response is always recovered. It is
 * keyed on the request id, and alertAdmin deduplicates it while unresolved.
 * A closed request (refunded, resolved without refund) is not re-announced.
 * Deliberately not exported: only the queue helpers below call it.
 */
async function ensureRefundRequestAlert(
  deps: Pick<RefundQueueDeps, 'alertAdmin'>,
  request: ConfirmedRequest
): Promise<void> {
  if (request.status && CLOSED_REQUEST_STATUSES.has(request.status)) return;
  console.error(
    `CRITICAL: refund of ${request.amountCents}¢ for session ${request.sessionId} (${request.kind}) awaits approval`
  );
  await deps.alertAdmin(
    request.kind === 'abandoned_cart'
      ? 'Paid abandoned cart — refund awaiting approval'
      : 'Refund awaiting approval',
    `<p>${request.summaryHtml}</p>
     <p>${dollars(request.amountCents)} USD is owed on payment intent
     <code>${request.paymentIntentId}</code> (session <code>${request.sessionId}</code>${
       request.reason ? `, reason <code>${request.reason}</code>` : ''
     }). Refunds are never automatic. ${APPROVE_WHERE}</p>`,
    {
      source: SOURCE,
      dedupeKey: `refund-request-${request.id}`,
      detail: {
        refund_request_id: request.id,
        kind: request.kind,
        amount_cents: request.amountCents,
        payment_intent_id: request.paymentIntentId,
        checkout_session_id: request.sessionId,
      },
    }
  );
}

/** What queue_payment_link_refund returns. */
interface PaymentLinkRow {
  link_status: string | null;
  link_closed: boolean;
  /** True when this call inserted the session's stripe_orders row. */
  order_created?: boolean;
  refund_request_id: string | null;
  created: boolean;
  request_status: string | null;
  amount_cents: number | null;
  reason: string | null;
  stripe_payment_intent_id: string | null;
}

/** How many times queue_payment_link_refund is tried before giving up. */
export const QUEUE_WRITE_ATTEMPTS = 3;

export interface PaymentLinkObligation {
  sessionId: string;
  paymentIntentId: string | null;
  /** The link row, or null when the paid session has no link row at all. */
  linkId: string | null;
  /** Close the link from this status in the SAME transaction; null leaves it. */
  closeLinkFrom: 'open' | 'expired' | null;
  /** What the invalid entries are owed, or null when nothing is owed. */
  owed: {
    amountCents: number | null;
    reason: string;
    detail: Record<string, unknown>;
    /** One sentence for the alert: what was paid for that could not be served. */
    summaryHtml: string;
  } | null;
  showId: string | null;
  /**
   * The session's stripe_orders row (column -> value), inserted in the SAME
   * transaction as the latch and the request (Codex round 14); an existing
   * order is left as it is. Null on the paths that record no order.
   */
  order?: object | null;
  /**
   * The entries this delivery stamped paid (MYK9-968). Their waitlist offers
   * move offered/expired -> accepted in the SAME transaction as the latch, so
   * a committed call whose response is lost leaves nothing to replay: the
   * redelivery takes the replay-first branch (paidSessionEntry.ts) and never
   * reaches a separate offer write. Empty when nothing was paid.
   */
  paidEntryIds: string[];
}

export type PaymentLinkOutcome = 'queued' | 'already_queued' | 'latched_only' | 'not_queued';

async function callPaymentLinkRpc(
  deps: RefundQueueDeps,
  args: Record<string, unknown>
): Promise<{ row: PaymentLinkRow | null; error: string | null }> {
  try {
    const result = await deps.rpc('queue_payment_link_refund', args);
    if (result.error) return { row: null, error: result.error.message };
    return { row: firstRow<PaymentLinkRow>(result.data), error: null };
  } catch (err) {
    return { row: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The payment-link fulfillment latch, its order and its refund obligation, in
 * ONE database transaction (queue_payment_link_refund; Codex rounds 13-14 on
 * #2689): the link closes, the order is recorded, the paid entries' waitlist
 * offers resolve (MYK9-968) and, when something is owed, the refund request
 * is written, or none of them happens. There is no separate queue write to lose and
 * no order row to replay from. The call is idempotent, so it is retried; if
 * it still cannot be confirmed this THROWS (5xx). The latch is then still
 * open, and the redelivery runs the same reconcile and this same call again.
 */
export async function settlePaymentLinkObligation(
  deps: RefundQueueDeps,
  input: PaymentLinkObligation
): Promise<PaymentLinkOutcome> {
  let owed = input.owed;
  if (owed && (!input.paymentIntentId || !owed.amountCents || owed.amountCents <= 0)) {
    console.error(
      `CRITICAL: refund owed for session ${input.sessionId} has no payment intent or amount`
    );
    const copy = queueMissingInputsAlert({
      summaryHtml: owed.summaryHtml,
      sessionId: input.sessionId,
      paymentIntentId: input.paymentIntentId,
      amountCents: owed.amountCents,
    });
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `refund-queue-missing-inputs-${input.sessionId}`,
    });
    owed = null;
  }
  if (!owed && !input.closeLinkFrom && !input.order && input.paidEntryIds.length === 0) {
    return input.owed ? 'not_queued' : 'latched_only';
  }

  const args = {
    p_session_id: input.sessionId,
    p_link_id: input.linkId,
    p_close_from: input.closeLinkFrom,
    p_payment_intent_id: owed ? input.paymentIntentId : null,
    p_amount_cents: owed ? owed.amountCents : null,
    p_reason: owed ? owed.reason : null,
    p_detail: owed ? owed.detail : {},
    p_show_id: input.showId,
    p_order: input.order ?? null,
    p_paid_entry_ids: input.paidEntryIds.length > 0 ? input.paidEntryIds : null,
  };
  let row: PaymentLinkRow | null = null;
  let lastError = 'no row returned';
  for (let attempt = 1; attempt <= QUEUE_WRITE_ATTEMPTS && !row; attempt += 1) {
    const result = await callPaymentLinkRpc(deps, args);
    if (result.row) row = result.row;
    else {
      lastError = result.error ?? 'no row returned';
      console.error(
        `queue_payment_link_refund ${attempt}/${QUEUE_WRITE_ATTEMPTS} for session ${input.sessionId} unconfirmed:`,
        lastError
      );
    }
  }

  if (!row) {
    if (owed && input.paymentIntentId && owed.amountCents) {
      const copy = queueUnconfirmedAlert({
        summaryHtml: owed.summaryHtml,
        kind: 'entry_payment_link',
        sessionId: input.sessionId,
        paymentIntentId: input.paymentIntentId,
        amountCents: owed.amountCents,
        reason: owed.reason,
        message: lastError,
      });
      await deps.alertAdmin(copy.title, copy.html, {
        source: SOURCE,
        dedupeKey: `refund-queue-unconfirmed-entry_payment_link-${input.sessionId}`,
      });
    }
    throw new Error(
      `Payment link ${input.sessionId}: latch and refund could not be confirmed; Stripe will retry`
    );
  }

  if (!owed) return input.owed ? 'not_queued' : 'latched_only';
  await ensureFromRow(deps, input.sessionId, row, owed.summaryHtml);
  return row.created ? 'queued' : 'already_queued';
}

/** A session's refund request, as the webhook's entry reads it (Codex round 15). */
export interface SessionRefundRequest {
  id: string;
  kind: string;
  status: string;
  amount_cents: number;
  reason: string | null;
  stripe_payment_intent_id: string;
}

/** Requests that still owe a decision: their alert is ensured on a redelivery. */
export const OPEN_REQUEST_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'awaiting_stripe',
  'failed',
]);

/**
 * A redelivery of a session that already has refund request(s) (Codex round 15
 * on #2689): ensure the alert of every OPEN one; a refunded or resolved
 * request gets nothing, and no recovery instructions. Runs at the webhook's
 * entry before any first-time validation, so a cart deleted since can never
 * turn into a "refund in the dashboard" alert for money already queued.
 */
export async function ensureSessionRefundAlerts(
  deps: Pick<RefundQueueDeps, 'alertAdmin'>,
  sessionId: string,
  requests: SessionRefundRequest[]
): Promise<void> {
  for (const request of requests) {
    if (!OPEN_REQUEST_STATUSES.has(request.status)) continue;
    await ensureRefundRequestAlert(deps, {
      id: request.id,
      status: request.status,
      kind: request.kind as RefundRequestKind,
      sessionId,
      paymentIntentId: request.stripe_payment_intent_id,
      amountCents: request.amount_cents,
      reason: request.reason,
      summaryHtml:
        'A refund request for this checkout already exists (seen again on a redelivery).',
    });
  }
}

/**
 * A redelivery of a payment-link session whose link is already latched (or
 * whose order is already recorded): read the session's request and ensure its
 * alert, so an alert lost with a lost response is recovered. Throws (5xx) when
 * it cannot read.
 */
export async function ensurePaymentLinkRefundAlert(
  deps: RefundQueueDeps,
  sessionId: string
): Promise<void> {
  const { row, error } = await callPaymentLinkRpc(deps, { p_session_id: sessionId });
  if (!row) throw new Error(`Could not read the refund request for ${sessionId}: ${error}`);
  await ensureFromRow(
    deps,
    sessionId,
    row,
    'A payment-link charge could not be honored in full (seen again on a redelivery).'
  );
}

async function ensureFromRow(
  deps: RefundQueueDeps,
  sessionId: string,
  row: PaymentLinkRow,
  summaryHtml: string
): Promise<void> {
  if (!row.refund_request_id || !row.stripe_payment_intent_id || !row.amount_cents) return;
  await ensureRefundRequestAlert(deps, {
    id: row.refund_request_id,
    status: row.request_status,
    kind: 'entry_payment_link',
    sessionId,
    paymentIntentId: row.stripe_payment_intent_id,
    amountCents: row.amount_cents,
    reason: row.reason,
    summaryHtml,
  });
}

export interface AbandonedCartRefundInput {
  cartId: string;
  sessionId: string;
  paymentIntentId: string | null;
  /** What Stripe charged for the session (its fresh `amount_total`). */
  chargedCents: number | null;
}

/**
 * OWNER RULE (2026-10-04, MYK9-997): when the exhibitor got NOTHING for a
 * charge, the refund request is the FULL amount charged, service fee
 * included, and the platform absorbs Stripe's processing fee. Two paths are
 * that case, both order-less: a paid abandoned cart, and a paid payment-link
 * session with no link row. Every other refund still returns entry fees only
 * (MYK9-966, `entryFeeRefundCents`). The refund itself still waits for a site
 * admin's approval (stripe-approve-refund).
 *
 * Null when the charge is not a positive whole number of cents, which takes
 * the missing-inputs alert rather than a guessed amount.
 */
export function fullChargeRefundCents(chargedCents: number | null | undefined): number | null {
  return typeof chargedCents === 'number' && Number.isInteger(chargedCents) && chargedCents > 0
    ? chargedCents
    : null;
}

/** What a paid payment-link session with no link row is owed: the full charge. */
export function noLinkRecordObligation(
  chargedCents: number | null | undefined
): NonNullable<PaymentLinkObligation['owed']> {
  return {
    amountCents: fullChargeRefundCents(chargedCents),
    reason: 'no_link_record',
    detail: { invalid_entry_ids: [] },
    summaryHtml: 'A payment-link charge could not be honored in full.',
  };
}

export type AbandonedCartRefundOutcome = 'claimed' | 'already_pending' | 'not_refundable';

/**
 * MYK9-874: claim a paid session on an abandoned/expired cart for refund. The
 * RPC moves the cart to 'refund_pending' and queues the request in one
 * statement, so it and the webhook's `active -> submitted` fulfillment claim
 * can never both win. 'already_pending' is a re-delivery (or the first
 * response was lost): return 2xx, and ensure the request's alert (Codex
 * round 11 on #2689). 'not_refundable' means the cart is not held for this
 * session; the caller falls through to its existing handling. Its idempotency
 * is the request keyed on the session, never the order row (an abandoned cart
 * has none).
 *
 * THROWS on an RPC error so Stripe redelivers: the cart is unchanged, and the
 * next delivery takes this same path.
 */
export async function claimAbandonedCartRefund(
  deps: RefundQueueDeps,
  input: AbandonedCartRefundInput
): Promise<AbandonedCartRefundOutcome> {
  const amountCents = fullChargeRefundCents(input.chargedCents);
  if (!input.paymentIntentId || !amountCents) {
    console.error(`CRITICAL: abandoned cart ${input.cartId} paid with no intent or amount`);
    const copy = abandonedCartMissingInputsAlert(input);
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `abandoned-cart-refund-missing-inputs-${input.sessionId}`,
    });
    return 'not_refundable';
  }

  const { data, error } = await deps.rpc('claim_abandoned_cart_refund', {
    p_cart_id: input.cartId,
    p_session_id: input.sessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_amount_cents: amountCents,
    p_detail: { cart_id: input.cartId },
  });
  if (error) {
    throw new Error(
      `claim_abandoned_cart_refund failed for cart ${input.cartId}: ${error.message}`
    );
  }

  const row = firstRow<{
    outcome: string;
    refund_request_id: string | null;
    request_status: string | null;
  }>(data);
  const outcome = row?.outcome;
  if ((outcome !== 'claimed' && outcome !== 'already_pending') || !row?.refund_request_id) {
    return 'not_refundable';
  }

  await ensureRefundRequestAlert(deps, {
    id: row.refund_request_id,
    status: row.request_status ?? null,
    kind: 'abandoned_cart',
    sessionId: input.sessionId,
    paymentIntentId: input.paymentIntentId,
    amountCents,
    reason: null,
    summaryHtml: `Checkout session <code>${input.sessionId}</code> was PAID after cart
     <code>${input.cartId}</code> was abandoned. No entries were created, and the cart is
     now held so it can never be fulfilled.`,
  });
  return outcome;
}

/** Cart statuses the abandoned-cart refund claim can act on. */
export const REFUNDABLE_ABANDONED_CART_STATUSES: ReadonlySet<string> = new Set([
  'abandoned',
  'expired',
  'refund_pending',
]);

/**
 * The Stripe Refund fields the attempt lifecycle reads. Settling an attempt
 * lives in refundSettlement.ts (settleAttemptFromStripe), its one writer.
 */
export interface SettlingRefund {
  id: string;
  amount: number;
  status: string | null;
  metadata?: Record<string, string> | null;
  failure_reason?: string | null;
}

export type AttemptStatus = 'pending' | 'succeeded' | 'failed' | 'canceled';

/** Stripe refund status -> attempt status ('requires_action' and unknown are pending). */
export function toAttemptStatus(status: string | null | undefined): AttemptStatus {
  if (status === 'succeeded' || status === 'failed' || status === 'canceled') return status;
  return 'pending';
}

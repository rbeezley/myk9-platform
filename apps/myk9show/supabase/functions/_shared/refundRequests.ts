// The pending-refund queue (MYK9-876 / MYK9-874). Deno-free; the Deno glue
// (stripe-webhook, stripe-approve-refund) injects the Supabase rpc and
// alertAdmin, so the colocated vitest drives every branch.
//
// OWNER RULE (2026-09-29): refunds are never automatic. A webhook that finds a
// charge it cannot honor QUEUES a refund_requests row and raises the CRITICAL
// operator alert; it never calls stripe.refunds.create. Only
// stripe-approve-refund issues the refund, after a site admin approves it.

import {
  abandonedCartMissingInputsAlert,
  queueMissingInputsAlert,
  queueUnconfirmedAlert,
} from './refundAlertCopy.ts';

export const APPROVED_REFUND_METADATA_TYPE = 'approved_refund_request';
export const REFUND_REQUEST_METADATA_KEY = 'refund_request_id';
export const REFUND_ATTEMPT_METADATA_KEY = 'refund_attempt_no';

export type RefundRequestKind = 'abandoned_cart' | 'cart_overflow' | 'entry_payment_link';

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

export interface QueueRefundInput {
  kind: 'cart_overflow' | 'entry_payment_link';
  sessionId: string;
  paymentIntentId: string | null;
  amountCents: number | null;
  reason: string;
  /** One sentence for the alert: what was paid for that could not be served. */
  summaryHtml: string;
  detail?: Record<string, unknown>;
  cartId?: string | null;
  entryPaymentLinkId?: string | null;
  showId?: string | null;
}

export type QueueRefundOutcome = 'queued' | 'already_queued' | 'not_queued';

export interface QueueDeps extends RefundQueueDeps {
  /**
   * Re-read a request by its idempotency key (session, kind): its id and
   * status, or null when none exists. Used only when the queue write's
   * outcome is unknown.
   */
  findRefundRequest: (
    sessionId: string,
    kind: QueueRefundInput['kind']
  ) => PromiseLike<{ data: { id: string; status: string } | null; error: RpcError | null }>;
}

/** A request the queue CONFIRMED exists: created, already there, or found on re-read. */
interface ConfirmedRequest {
  id: string;
  /** Its current status, as the queue write or re-read reported it. */
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
 * kind, whether the write created it, found it already there, or found it on
 * a re-read, so an alert lost with a lost response is always recovered. It is
 * keyed on the request id, and alertAdmin deduplicates it while unresolved.
 * A closed request (refunded, resolved without refund) is not re-announced.
 * Deliberately not exported: only the two queue helpers below call it.
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

/** How many times the idempotent queue write is tried before the re-read. */
export const QUEUE_WRITE_ATTEMPTS = 3;

/**
 * Queue a partial make-whole refund (cart overflow, unhonorable payment-link
 * lines) for approval. The approval queue is the ONLY path (Codex round 10
 * on #2689): there is no "refund by hand" fallback, because a dashboard
 * refund carries no request metadata and a request whose response was lost
 * would later refund the same money again.
 *
 * request_refund_approval is idempotent per (session, kind), so it is retried
 * up to QUEUE_WRITE_ATTEMPTS times; if the outcome is still unknown the
 * request is re-read by (session, kind). If it exists, the refund is queued.
 * If it still cannot be confirmed this THROWS, so the webhook answers 5xx and
 * Stripe redelivers. The callers make sure a redelivery reaches this write
 * again (stripe-webhook replays it from the order row it recorded).
 */
export async function queueRefundForApproval(
  deps: QueueDeps,
  input: QueueRefundInput
): Promise<QueueRefundOutcome> {
  if (!input.paymentIntentId || !input.amountCents || input.amountCents <= 0) {
    console.error(
      `CRITICAL: refund owed for session ${input.sessionId} has no payment intent or amount`
    );
    const copy = queueMissingInputsAlert(input);
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `refund-queue-missing-inputs-${input.sessionId}`,
    });
    return 'not_queued';
  }

  let requestId: string | null = null;
  let requestStatus: string | null = null;
  let created = false;
  let lastError = 'no request row returned';
  for (let attempt = 1; attempt <= QUEUE_WRITE_ATTEMPTS && !requestId; attempt += 1) {
    let result: { data: unknown; error: RpcError | null };
    try {
      result = await deps.rpc('request_refund_approval', {
        p_kind: input.kind,
        p_session_id: input.sessionId,
        p_payment_intent_id: input.paymentIntentId,
        p_amount_cents: input.amountCents,
        p_reason: input.reason,
        p_detail: input.detail ?? {},
        p_cart_id: input.cartId ?? null,
        p_entry_payment_link_id: input.entryPaymentLinkId ?? null,
        p_show_id: input.showId ?? null,
      });
    } catch (err) {
      result = { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
    const row = firstRow<{
      refund_request_id: string | null;
      created: boolean;
      request_status: string | null;
    }>(result.data);
    if (!result.error && row?.refund_request_id) {
      requestId = row.refund_request_id;
      requestStatus = row.request_status ?? null;
      created = row.created === true;
    } else {
      lastError = result.error?.message ?? 'no request row returned';
      console.error(
        `Queue write ${attempt}/${QUEUE_WRITE_ATTEMPTS} for session ${input.sessionId} unconfirmed:`,
        lastError
      );
    }
  }

  if (!requestId) {
    // Still unknown: did any attempt commit? Re-read by (session, kind).
    try {
      const found = await deps.findRefundRequest(input.sessionId, input.kind);
      if (found.error) lastError = found.error.message;
      else if (found.data) {
        requestId = found.data.id;
        requestStatus = found.data.status;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!requestId) {
    console.error(
      `CRITICAL: refund for session ${input.sessionId} (${input.kind}) could not be confirmed as queued:`,
      lastError
    );
    const copy = queueUnconfirmedAlert({
      summaryHtml: input.summaryHtml,
      kind: input.kind,
      sessionId: input.sessionId,
      paymentIntentId: input.paymentIntentId,
      amountCents: input.amountCents,
      reason: input.reason,
      message: lastError,
    });
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `refund-queue-unconfirmed-${input.kind}-${input.sessionId}`,
    });
    throw new Error(
      `Refund for session ${input.sessionId} (${input.kind}) could not be confirmed as queued; Stripe will retry`
    );
  }

  // Whatever the write reported (created, already there, found on re-read),
  // the request exists: make sure its alert does too.
  await ensureRefundRequestAlert(deps, {
    id: requestId,
    status: requestStatus,
    kind: input.kind,
    sessionId: input.sessionId,
    paymentIntentId: input.paymentIntentId,
    amountCents: input.amountCents,
    reason: input.reason,
    summaryHtml: input.summaryHtml,
  });
  return created ? 'queued' : 'already_queued';
}

export interface AbandonedCartRefundInput {
  cartId: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountCents: number | null;
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
  if (!input.paymentIntentId || !input.amountCents || input.amountCents <= 0) {
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
    p_amount_cents: input.amountCents,
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
    amountCents: input.amountCents,
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

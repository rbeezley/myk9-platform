// The pending-refund queue (MYK9-876 / MYK9-874). Deno-free; the Deno glue
// (stripe-webhook, stripe-approve-refund) injects the Supabase rpc and
// alertAdmin, so the colocated vitest drives every branch.
//
// OWNER RULE (2026-09-29): refunds are never automatic. A webhook that finds a
// charge it cannot honor QUEUES a refund_requests row and raises the CRITICAL
// operator alert; it never calls stripe.refunds.create. Only
// stripe-approve-refund issues the refund, after a site admin approves it.

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
const APPROVE_WHERE =
  'Approve it under <strong>Refunds awaiting approval</strong> on /admin/health. Do not refund it from the Stripe dashboard: the approval records it.';

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

/**
 * Queue a partial make-whole refund (cart overflow, unhonorable payment-link
 * lines) for approval. Never throws: these run after the order is recorded,
 * so a Stripe retry would short-circuit before reaching here again. A failure
 * becomes a CRITICAL alert asking for the refund by hand.
 */
export async function queueRefundForApproval(
  deps: RefundQueueDeps,
  input: QueueRefundInput
): Promise<QueueRefundOutcome> {
  if (!input.paymentIntentId || !input.amountCents || input.amountCents <= 0) {
    console.error(
      `CRITICAL: refund owed for session ${input.sessionId} has no payment intent or amount`
    );
    await deps.alertAdmin(
      'Refund owed but could not be queued — refund by hand',
      `<p>${input.summaryHtml}</p>
       <p>A refund is owed for Checkout Session <code>${input.sessionId}</code>, but the
       payment intent or amount is missing (payment intent
       <code>${input.paymentIntentId ?? 'unknown'}</code>, amount
       <code>${input.amountCents ?? 'unknown'}</code>), so it was not queued.</p>`,
      { source: SOURCE, dedupeKey: `refund-queue-missing-inputs-${input.sessionId}` }
    );
    return 'not_queued';
  }

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

  const row = firstRow<{ refund_request_id: string | null; created: boolean }>(result.data);
  if (result.error || !row?.refund_request_id) {
    const message = result.error?.message ?? 'no request row returned';
    console.error(`CRITICAL: refund for session ${input.sessionId} could not be queued:`, message);
    await deps.alertAdmin(
      'Refund owed but could not be queued — refund by hand',
      `<p>${input.summaryHtml}</p>
       <p>${dollars(input.amountCents)} USD is owed on payment intent
       <code>${input.paymentIntentId}</code> (session <code>${input.sessionId}</code>,
       reason <code>${input.reason}</code>), but queuing it for approval failed:</p>
       <pre>${message}</pre>
       <p>Recovery: refund that amount from the Stripe dashboard, then record it on
       the order (<code>make_whole_refunded_cents</code>).</p>`,
      { source: SOURCE, dedupeKey: `refund-queue-failed-${input.kind}-${input.sessionId}` }
    );
    return 'not_queued';
  }

  if (!row.created) {
    console.log(`Refund for session ${input.sessionId} (${input.kind}) already queued`);
    return 'already_queued';
  }

  console.error(
    `CRITICAL: refund of ${input.amountCents}¢ for session ${input.sessionId} (${input.kind}) awaits approval`
  );
  await deps.alertAdmin(
    'Refund awaiting approval',
    `<p>${input.summaryHtml}</p>
     <p>${dollars(input.amountCents)} USD is owed on payment intent
     <code>${input.paymentIntentId}</code> (session <code>${input.sessionId}</code>,
     reason <code>${input.reason}</code>). Refunds are never automatic. ${APPROVE_WHERE}</p>`,
    {
      source: SOURCE,
      dedupeKey: `refund-request-${row.refund_request_id}`,
      detail: {
        refund_request_id: row.refund_request_id,
        kind: input.kind,
        amount_cents: input.amountCents,
        payment_intent_id: input.paymentIntentId,
        checkout_session_id: input.sessionId,
      },
    }
  );
  return 'queued';
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
 * can never both win. 'already_pending' is a re-delivery: return 2xx, no new
 * alert. 'not_refundable' means the cart is not held for this session; the
 * caller falls through to its existing handling.
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
    await deps.alertAdmin(
      'Paid abandoned cart could not be queued for refund — refund by hand',
      `<p>Checkout session <code>${input.sessionId}</code> was PAID after cart
       <code>${input.cartId}</code> was abandoned, but the payment intent or amount is
       missing, so no refund request was queued and no entries were created.</p>
       <p>Recovery: find the payment in the Stripe dashboard and refund it.</p>`,
      { source: SOURCE, dedupeKey: `abandoned-cart-refund-missing-inputs-${input.sessionId}` }
    );
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

  const row = firstRow<{ outcome: string; refund_request_id: string | null }>(data);
  const outcome = row?.outcome;
  if (outcome === 'already_pending') {
    console.log(`Abandoned cart ${input.cartId} already queued for refund — skipping`);
    return 'already_pending';
  }
  if (outcome !== 'claimed' || !row?.refund_request_id) {
    return 'not_refundable';
  }

  console.error(
    `CRITICAL: paid session ${input.sessionId} on abandoned cart ${input.cartId} queued for refund`
  );
  await deps.alertAdmin(
    'Paid abandoned cart — refund awaiting approval',
    `<p>Checkout session <code>${input.sessionId}</code> was PAID after cart
     <code>${input.cartId}</code> was abandoned. No entries were created, and the cart is
     now held so it can never be fulfilled.</p>
     <p>${dollars(input.amountCents)} USD is owed back on payment intent
     <code>${input.paymentIntentId}</code>. Refunds are never automatic. ${APPROVE_WHERE}</p>`,
    {
      source: SOURCE,
      dedupeKey: `refund-request-${row.refund_request_id}`,
      detail: {
        refund_request_id: row.refund_request_id,
        kind: 'abandoned_cart',
        amount_cents: input.amountCents,
        payment_intent_id: input.paymentIntentId,
        checkout_session_id: input.sessionId,
      },
    }
  );
  return 'claimed';
}

/** Cart statuses the abandoned-cart refund claim can act on. */
export const REFUNDABLE_ABANDONED_CART_STATUSES: ReadonlySet<string> = new Set([
  'abandoned',
  'expired',
  'refund_pending',
]);

/** The Stripe Refund fields the attempt lifecycle reads. */
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

export interface SettleDeps extends RefundQueueDeps {
  /** `stripe.refunds.retrieve` — the refund's CURRENT state, not the event's. */
  retrieveRefund: (refundId: string) => Promise<SettlingRefund>;
}

export type SettleOutcome =
  'not_approved_refund' | 'not_found' | 'updated' | 'unchanged' | 'conflict' | 'error';

const MAX_SETTLE_ROUNDS = 3;

interface SettleRow {
  outcome: string;
  request_id: string | null;
  attempt_status: string | null;
  request_status: string | null;
  live_attempts: number | null;
}

/**
 * stripe-webhook's half of the attempt lifecycle (refund.updated,
 * refund.failed, charge.refunded). Only a refund stamped
 * `type=approved_refund_request` is considered, and it updates ONLY the
 * attempt that owns that Stripe refund id (settle_refund_attempt); the
 * request's status is derived from its attempts in the database. The refund
 * is re-read from Stripe so a delayed or reordered event writes Stripe's
 * current state, not a stale one. Never throws.
 */
export async function settleApprovedRefund(
  deps: SettleDeps,
  refund: SettlingRefund
): Promise<SettleOutcome> {
  if (
    refund.metadata?.type !== APPROVED_REFUND_METADATA_TYPE ||
    !refund.metadata?.[REFUND_REQUEST_METADATA_KEY]
  ) {
    return 'not_approved_refund';
  }

  // Compare-and-set (Codex round 3 on #2689): read the attempt's version
  // BEFORE re-reading Stripe, settle against it, and on 'conflict' (another
  // write landed in between) read both again. Never overwrite blind.
  let current: SettlingRefund = refund;
  let status: AttemptStatus = toAttemptStatus(refund.status);
  let data: unknown = null;
  let error: { message: string } | null = null;
  for (let round = 0; round < MAX_SETTLE_ROUNDS; round += 1) {
    const version = await deps.rpc('refund_attempt_version', { p_stripe_refund_id: refund.id });
    if (version.error) {
      error = version.error;
      break;
    }
    if (typeof version.data !== 'number') {
      // The approval records the id right after Stripe answers; an event that
      // beats it is ignored here and the approval writes the status it saw.
      console.log(`Refund ${refund.id} matches no refund attempt yet — ignored`);
      return 'not_found';
    }
    try {
      current = await deps.retrieveRefund(refund.id);
    } catch (err) {
      console.error(`Could not re-read refund ${refund.id}; using the event's copy:`, err);
    }
    status = toAttemptStatus(current.status);
    ({ data, error } = await deps.rpc('settle_refund_attempt', {
      p_stripe_refund_id: refund.id,
      p_expected_version: version.data,
      p_status: status,
      p_failure_reason: current.failure_reason ?? null,
    }));
    const outcomeRow = (Array.isArray(data) ? data[0] : data) as SettleRow | null;
    if (error || outcomeRow?.outcome !== 'conflict') break;
  }
  if (error) {
    await deps.alertAdmin(
      'Approved refund changed at Stripe but its attempt was not updated',
      `<p>Stripe refund <code>${refund.id}</code> is <code>${status}</code>, but updating
       its refund attempt failed:</p><pre>${error.message}</pre>
       <p>The approval queue may show the wrong state for this refund until the next
       Stripe event for it, or an admin approval, re-reads it.</p>`,
      { source: SOURCE, dedupeKey: `refund-attempt-settle-failed-${refund.id}-${status}` }
    );
    return 'error';
  }

  const row = (Array.isArray(data) ? data[0] : data) as SettleRow | null;
  if (!row || row.outcome === 'not_found') {
    console.log(`Refund ${refund.id} matches no refund attempt yet — ignored`);
    return 'not_found';
  }
  if (row.outcome === 'conflict') {
    // Still contended after MAX_SETTLE_ROUNDS: nothing written; the next event
    // for this refund settles it.
    console.error(`Refund ${refund.id}: attempt kept changing; left for the next event`);
    return 'conflict';
  }

  if ((row.live_attempts ?? 0) > 1) {
    await deps.alertAdmin(
      'Two refunds are live for one refund request — check for a double refund',
      `<p>Refund request <code>${row.request_id}</code> has ${row.live_attempts} attempts
       that are pending or succeeded at Stripe (latest change: refund
       <code>${refund.id}</code> is <code>${status}</code>). The customer may be refunded
       twice. Check the payment in Stripe.</p>`,
      { source: SOURCE, dedupeKey: `refund-request-double-live-${row.request_id}` }
    );
  }

  if (row.outcome === 'updated' && (status === 'failed' || status === 'canceled')) {
    const reason = `${status}: ${current.failure_reason ?? 'no reason given'}`;
    const reopened = row.request_status === 'failed';
    await deps.alertAdmin(
      reopened
        ? 'Approved refund failed at Stripe — back in the approval queue'
        : 'An approved refund attempt failed at Stripe',
      `<p>Stripe refund <code>${refund.id}</code> (${dollars(refund.amount)} USD) for request
       <code>${row.request_id}</code> ended <code>${reason}</code>.</p>
       <p>${
         reopened
           ? 'The customer was NOT paid. The request is back under <strong>Refunds awaiting approval</strong> on /admin/health; approving it again issues a new refund.'
           : `The request reads <code>${row.request_status}</code> from its other attempts.`
       }</p>`,
      {
        source: SOURCE,
        dedupeKey: `refund-attempt-failed-${refund.id}`,
        detail: { refund_request_id: row.request_id, stripe_refund_id: refund.id, reason },
      }
    );
  }
  return row.outcome === 'updated' ? 'updated' : 'unchanged';
}

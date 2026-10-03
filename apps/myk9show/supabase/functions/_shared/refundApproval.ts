// The admin approval step for a queued refund (MYK9-876). Deno-free; the
// stripe-approve-refund edge function authorises the caller as a site admin,
// then hands its Supabase rpc, Stripe refunds client and alertAdmin to
// approveRefundRequest, so the colocated vitest drives every branch.
//
// This is the ONLY place a queued refund becomes a Stripe refund. Each
// approval works on ONE attempt (public.refund_request_attempts; Codex rounds
// 1-2 on #2689):
//   1. begin_refund_attempt locks the request and opens attempt n+1 only
//      while no attempt is pending or succeeded ('claimed'), or hands back
//      the pending one ('resume'); an abandoned cart that was fulfilled after
//      all is refused;
//   2. every refund on the intent is listed (all pages). A refund stamped
//      with this request AND this attempt is reused; a live refund for this
//      request on ANOTHER attempt stops the approval (possible double refund);
//   3. otherwise a refund is created with idempotency key
//      refund-request-<id>-<n>, so concurrent clicks on one attempt get one
//      Stripe refund;
//   4. record_refund_attempt writes the refund to THAT attempt only. The
//      request's status is derived from its attempts in the database, so the
//      webhook (settleApprovedRefund) and this function never race on it.

import { MAKE_WHOLE_METADATA_KEY } from './orderSnapshot.ts';
import {
  APPROVED_REFUND_METADATA_TYPE,
  REFUND_ATTEMPT_METADATA_KEY,
  REFUND_REQUEST_METADATA_KEY,
  toAttemptStatus,
  type RefundQueueDeps,
} from './refundRequests.ts';

export interface ApprovalRefund {
  id: string;
  amount: number;
  status: string | null;
  metadata?: Record<string, string> | null;
  failure_reason?: string | null;
}

export interface RefundListPage {
  data: ApprovalRefund[];
  has_more: boolean;
}

export type RefundPageLoader = (params: {
  payment_intent: string;
  limit: number;
  starting_after?: string;
}) => Promise<RefundListPage>;

export interface RefundApprovalDeps {
  rpc: RefundQueueDeps['rpc'];
  alertAdmin: RefundQueueDeps['alertAdmin'];
  /** One page of `stripe.refunds.list({ payment_intent })`. */
  listRefundsPage: RefundPageLoader;
  createRefund: (
    params: {
      payment_intent: string;
      amount: number;
      metadata: Record<string, string>;
    },
    idempotencyKey: string
  ) => Promise<ApprovalRefund>;
}

export type ApprovalResult =
  | { status: 200; body: { outcome: 'refunded' | 'already_refunded'; refund_id: string | null } }
  | { status: 202; body: { outcome: 'pending'; refund_id: string } }
  | { status: 404 | 409 | 500 | 502; body: { error: string } };

interface BeginRow {
  outcome: string;
  attempt_id: string | null;
  attempt_no: number | null;
  kind: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  amount_cents: number | null;
  reason: string | null;
  stripe_refund_id: string | null;
}

const DEAD_STATUSES = new Set(['failed', 'canceled']);
const SOURCE = 'stripe-approve-refund';

function isForRequest(refund: ApprovalRefund, requestId: string): boolean {
  return refund.metadata?.[REFUND_REQUEST_METADATA_KEY] === requestId;
}

/** The refund already issued for this request's attempt n, if any. */
export function findAttemptRefund<T extends ApprovalRefund>(
  refunds: T[],
  requestId: string,
  attemptNo: number,
  recordedRefundId: string | null
): T | undefined {
  return refunds.find(
    r =>
      (recordedRefundId !== null && r.id === recordedRefundId) ||
      (isForRequest(r, requestId) &&
        r.metadata?.[REFUND_ATTEMPT_METADATA_KEY] === String(attemptNo))
  );
}

/** A refund for this request on ANOTHER attempt that Stripe still has live. */
export function findLiveRefundOnOtherAttempt<T extends ApprovalRefund>(
  refunds: T[],
  requestId: string,
  attemptNo: number
): T | undefined {
  return refunds.find(
    r =>
      isForRequest(r, requestId) &&
      r.metadata?.[REFUND_ATTEMPT_METADATA_KEY] !== String(attemptNo) &&
      !DEAD_STATUSES.has(r.status ?? '')
  );
}

/**
 * Every refund on the intent (Codex P2 on #2689): reuse must see a request's
 * earlier refunds even past the first 100.
 */
export async function listAllIntentRefunds(
  listPage: RefundPageLoader,
  paymentIntentId: string,
  pageSize = 100
): Promise<ApprovalRefund[]> {
  const all: ApprovalRefund[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await listPage({
      payment_intent: paymentIntentId,
      limit: pageSize,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) return all;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

export async function approveRefundRequest(
  deps: RefundApprovalDeps,
  input: { requestId: string; actorAuthUserId: string }
): Promise<ApprovalResult> {
  const { data, error } = await deps.rpc('begin_refund_attempt', {
    p_request_id: input.requestId,
    p_actor_auth_user_id: input.actorAuthUserId,
  });
  if (error) {
    console.error(`begin_refund_attempt failed for ${input.requestId}:`, error);
    return { status: 500, body: { error: 'claim_failed' } };
  }
  const claim = (Array.isArray(data) ? data[0] : data) as BeginRow | null;
  if (!claim || claim.outcome === 'not_found') {
    return { status: 404, body: { error: 'not_found' } };
  }
  if (claim.outcome === 'already_refunded') {
    return {
      status: 200,
      body: { outcome: 'already_refunded', refund_id: claim.stripe_refund_id },
    };
  }
  if (claim.outcome === 'fulfilled') {
    // The session was fulfilled after all; refunding it would leave paid
    // entries with the money returned (MYK9-874).
    return { status: 409, body: { error: 'fulfilled' } };
  }
  if (
    (claim.outcome !== 'claimed' && claim.outcome !== 'resume') ||
    !claim.attempt_id ||
    !claim.attempt_no ||
    !claim.stripe_payment_intent_id ||
    !claim.amount_cents
  ) {
    return { status: 500, body: { error: 'claim_failed' } };
  }

  const intentId = claim.stripe_payment_intent_id;
  const attemptNo = claim.attempt_no;
  let refund: ApprovalRefund;
  try {
    const prior = await listAllIntentRefunds(deps.listRefundsPage, intentId);
    const otherLive = findLiveRefundOnOtherAttempt(prior, input.requestId, attemptNo);
    if (otherLive) {
      await deps.alertAdmin(
        'Refund approval stopped: another refund for this request is still live',
        `<p>Approving request <code>${input.requestId}</code> (attempt ${attemptNo}) found
         Stripe refund <code>${otherLive.id}</code> (${otherLive.status}) from another
         attempt still live on payment intent <code>${intentId}</code>. No new refund was
         created. Check the payment in Stripe before approving again.</p>`,
        { source: SOURCE, dedupeKey: `approved-refund-other-live-${otherLive.id}` }
      );
      return { status: 409, body: { error: 'refund_exists_for_other_attempt' } };
    }
    refund =
      findAttemptRefund(prior, input.requestId, attemptNo, claim.stripe_refund_id) ??
      (await deps.createRefund(
        {
          payment_intent: intentId,
          amount: claim.amount_cents,
          metadata: {
            type: APPROVED_REFUND_METADATA_TYPE,
            [REFUND_REQUEST_METADATA_KEY]: input.requestId,
            [REFUND_ATTEMPT_METADATA_KEY]: String(attemptNo),
            kind: claim.kind ?? '',
            reason: claim.reason ?? '',
            checkout_session_id: claim.stripe_checkout_session_id ?? '',
            // Every queued refund returns money for lines that never became
            // paid entries: make-whole, not a platform loss. On the Stripe
            // object so charge.refunded attributes it right in any order.
            [MAKE_WHOLE_METADATA_KEY]: 'true',
          },
        },
        `refund-request-${input.requestId}-${attemptNo}`
      ));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Approved refund ${input.requestId} failed at Stripe:`, err);
    await deps.alertAdmin(
      'Approved refund FAILED at Stripe',
      `<p>Refund request <code>${input.requestId}</code> (attempt ${attemptNo}) was
       approved, but creating the Stripe refund on payment intent
       <code>${intentId}</code> failed:</p>
       <pre>${message}</pre>
       <p>The attempt stays open; approving it again retries it with the same
       idempotency key.</p>`,
      { source: SOURCE, dedupeKey: `approved-refund-failed-${input.requestId}-${attemptNo}` }
    );
    return { status: 502, body: { error: 'stripe_refund_failed' } };
  }

  const attemptStatus = toAttemptStatus(refund.status);
  const { data: recorded, error: recordError } = await deps.rpc('record_refund_attempt', {
    p_attempt_id: claim.attempt_id,
    p_stripe_refund_id: refund.id,
    p_status: attemptStatus,
    p_failure_reason: refund.failure_reason ?? null,
  });
  if (recordError || recorded !== 'recorded') {
    const why = recordError?.message ?? String(recorded);
    await deps.alertAdmin(
      'Approved refund issued but not recorded on its attempt',
      `<p>Stripe refund <code>${refund.id}</code> (${refund.status}) for request
       <code>${input.requestId}</code>, attempt ${attemptNo}, could not be recorded:
       <code>${why}</code>.</p>
       <p>Check the refund in Stripe before approving again.</p>`,
      { source: SOURCE, dedupeKey: `approved-refund-unrecorded-${refund.id}` }
    );
    return recordError
      ? { status: 500, body: { error: 'record_failed' } }
      : { status: 409, body: { error: 'refund_attempt_conflict' } };
  }

  if (attemptStatus === 'failed' || attemptStatus === 'canceled') {
    // The request now reads 'failed' and is back in the queue.
    return { status: 502, body: { error: `stripe_refund_${attemptStatus}` } };
  }
  if (attemptStatus === 'pending') {
    // NOT refunded until Stripe says so; the webhook settles this attempt.
    return { status: 202, body: { outcome: 'pending', refund_id: refund.id } };
  }

  // Book the succeeded refund now; the ledger is keyed on the refund id, so
  // this and the webhook's sweep are the same upsert.
  const { error: ledgerError } = await deps.rpc('record_order_refund_cents', {
    p_payment_intent_id: intentId,
    p_refund_id: refund.id,
    p_amount_cents: refund.amount,
    p_kind: 'make_whole',
  });
  if (ledgerError) {
    await deps.alertAdmin(
      'Approved refund not recorded on the order',
      `<p>Refund <code>${refund.id}</code> (payment intent <code>${intentId}</code>)
       could not be written to <code>stripe_order_refunds</code>:</p>
       <pre>${ledgerError.message}</pre>
       <p>The charge.refunded webhook books it again; if the order still reads as
       collected in full, set <code>make_whole_refunded_cents</code> by hand.</p>`,
      { source: SOURCE, dedupeKey: `approved-refund-ledger-${refund.id}` }
    );
  }

  return { status: 200, body: { outcome: 'refunded', refund_id: refund.id } };
}

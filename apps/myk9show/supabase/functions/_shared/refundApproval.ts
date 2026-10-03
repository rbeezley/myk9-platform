// The admin approval step for a queued refund (MYK9-876). Deno-free; the
// stripe-approve-refund edge function authorises the caller as a site admin,
// then hands its Supabase rpc, Stripe refunds client and alertAdmin to
// approveRefundRequest, so the colocated vitest drives every branch.
//
// This is the ONLY place a queued refund becomes a Stripe refund. Exactly once:
//   1. claim_refund_request_approval locks the row and moves it pending ->
//      approved (or reports 'resume' for an approval that crashed mid-flight),
//      and, for an abandoned cart, refuses if anything fulfilled the session;
//   2. a refund already stamped with this request id is REUSED, never doubled;
//   3. a new one carries an idempotency key per (request, attempt), so two
//      concurrent clicks on one attempt get the same Stripe refund; the
//      attempt counts EVERY refund on the intent stamped with this request,
//      across all pages, so a dead attempt always earns a new key;
//   4. the request becomes 'refunded' only when Stripe reports 'succeeded'. A
//      pending refund leaves it 'approved' with the refund id recorded, and
//      settleApprovedRefund (stripe-webhook) completes it or, on failure or
//      cancel, moves it to 'failed', back in the queue (Codex P1 on #2689).

import { MAKE_WHOLE_METADATA_KEY } from './orderSnapshot.ts';
import { resolveRefundLedgerAction } from './refundLifecycle.ts';
import {
  APPROVED_REFUND_METADATA_TYPE,
  failRefundRequest,
  REFUND_REQUEST_METADATA_KEY,
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

interface ClaimRow {
  outcome: string;
  kind: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  amount_cents: number | null;
  reason: string | null;
  stripe_refund_id: string | null;
}

const DEAD_STATUSES = new Set(['failed', 'canceled']);
const SOURCE = 'stripe-approve-refund';

/** A live refund already issued for this request, if any. */
export function findRequestRefund<T extends ApprovalRefund>(
  refunds: T[],
  requestId: string
): T | undefined {
  return refunds.find(
    r =>
      r.metadata?.[REFUND_REQUEST_METADATA_KEY] === requestId && !DEAD_STATUSES.has(r.status ?? '')
  );
}

/** Attempts so far for this request only (a dead attempt earns a new key). */
export function requestRefundAttempt(refunds: ApprovalRefund[], requestId: string): number {
  return refunds.filter(r => r.metadata?.[REFUND_REQUEST_METADATA_KEY] === requestId).length;
}

/**
 * Every refund on the intent (Codex P2 on #2689): the reuse and attempt
 * decisions must see a request's earlier refunds even past the first 100.
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
  const { data, error } = await deps.rpc('claim_refund_request_approval', {
    p_request_id: input.requestId,
    p_actor_auth_user_id: input.actorAuthUserId,
  });
  if (error) {
    console.error(`claim_refund_request_approval failed for ${input.requestId}:`, error);
    return { status: 500, body: { error: 'claim_failed' } };
  }
  const claim = (Array.isArray(data) ? data[0] : data) as ClaimRow | null;
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
    !claim.stripe_payment_intent_id ||
    !claim.amount_cents
  ) {
    return { status: 500, body: { error: 'claim_failed' } };
  }

  const intentId = claim.stripe_payment_intent_id;
  let refund: ApprovalRefund;
  try {
    const prior = await listAllIntentRefunds(deps.listRefundsPage, intentId);
    refund =
      findRequestRefund(prior, input.requestId) ??
      (await deps.createRefund(
        {
          payment_intent: intentId,
          amount: claim.amount_cents,
          metadata: {
            type: APPROVED_REFUND_METADATA_TYPE,
            [REFUND_REQUEST_METADATA_KEY]: input.requestId,
            kind: claim.kind ?? '',
            reason: claim.reason ?? '',
            checkout_session_id: claim.stripe_checkout_session_id ?? '',
            // Every queued refund returns money for lines that never became
            // paid entries: make-whole, not a platform loss. On the Stripe
            // object so charge.refunded attributes it right in any order.
            [MAKE_WHOLE_METADATA_KEY]: 'true',
          },
        },
        `refund-request-${input.requestId}-${requestRefundAttempt(prior, input.requestId)}`
      ));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Approved refund ${input.requestId} failed at Stripe:`, err);
    await deps.alertAdmin(
      'Approved refund FAILED at Stripe',
      `<p>Refund request <code>${input.requestId}</code> was approved, but creating the
       Stripe refund on payment intent <code>${intentId}</code> failed:</p>
       <pre>${message}</pre>
       <p>The request stays approved; approving it again retries safely.</p>`,
      { source: SOURCE, dedupeKey: `approved-refund-failed-${input.requestId}` }
    );
    return { status: 502, body: { error: 'stripe_refund_failed' } };
  }

  const ledgerAction = resolveRefundLedgerAction(refund.status);
  if (ledgerAction === 'fail' || ledgerAction === 'cancel') {
    // Dead on arrival: back to the queue at once; the next approval ignores
    // this refund and takes a new attempt.
    await failRefundRequest(deps, input.requestId, refund);
    return { status: 502, body: { error: `stripe_refund_${refund.status}` } };
  }

  if (ledgerAction === 'defer') {
    // In flight (pending / requires_action). NOT refunded until Stripe says
    // so: record the refund id and let refund.updated settle the request.
    const { data: noted, error: noteError } = await deps.rpc('note_refund_request_in_flight', {
      p_request_id: input.requestId,
      p_stripe_refund_id: refund.id,
    });
    if (noteError || noted !== true) {
      await deps.alertAdmin(
        'Approved refund is in flight but the request did not record it',
        `<p>Stripe refund <code>${refund.id}</code> (${refund.status}) was issued for
         request <code>${input.requestId}</code>, but recording it failed:</p>
         <pre>${noteError?.message ?? 'no row updated'}</pre>
         <p>Approving it again reuses this refund.</p>`,
        { source: SOURCE, dedupeKey: `approved-refund-in-flight-unrecorded-${refund.id}` }
      );
    }
    return { status: 202, body: { outcome: 'pending', refund_id: refund.id } };
  }

  const { data: completed, error: completeError } = await deps.rpc('complete_refund_request', {
    p_request_id: input.requestId,
    p_stripe_refund_id: refund.id,
  });
  if (completeError || completed !== true) {
    await deps.alertAdmin(
      'Approved refund issued but the request was not marked refunded',
      `<p>Stripe refund <code>${refund.id}</code> was issued for request
       <code>${input.requestId}</code>, but marking the request refunded failed:</p>
       <pre>${completeError?.message ?? 'no row updated'}</pre>
       <p>Approving it again reuses this refund and retries the update.</p>`,
      { source: SOURCE, dedupeKey: `approved-refund-unrecorded-${refund.id}` }
    );
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

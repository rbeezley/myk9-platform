// The admin approval step for a queued refund (MYK9-876). Deno-free; the
// stripe-approve-refund edge function authorises the caller as a site admin,
// then hands its Supabase rpc, Stripe refunds client and alertAdmin to
// approveRefundRequest, so the colocated vitest drives every branch.
//
// This is the ONLY place a queued refund becomes a Stripe refund, and the
// same call is the admin's "Check status". Each approval works on ONE attempt
// (public.refund_request_attempts; Codex rounds 1-4 on #2689):
//   1. begin_refund_attempt locks the request and opens attempt n+1 only
//      while no attempt is pending or succeeded ('claimed'), or hands back
//      the pending one ('resume'); an abandoned cart that was fulfilled after
//      all is refused;
//   2. settleAttemptFromStripe (refundSettlement.ts, the ONLY status writer)
//      settles the attempt from Stripe: it finds the attempt's refund on
//      Stripe if none is attached yet, re-reads it, and writes its current
//      state as a compare-and-set. A missed webhook is caught up here;
//   3. only when Stripe holds NO refund for the attempt is one created: after
//      checking that no other attempt of the request still has a live refund,
//      with idempotency key refund-request-<id>-<n> (concurrent clicks on one
//      attempt get one Stripe refund), and then settled through step 2. If
//      Stripe DEFINITIVELY refuses the create (refundCreateRejection.ts), the
//      attempt is failed with Stripe's code so the request can be approved
//      again or resolved; an ambiguous error leaves it pending.
// Nothing here writes a status, and the request's status is derived from its
// attempts in the database.

import { MAKE_WHOLE_METADATA_KEY } from './orderSnapshot.ts';
import { definitiveStripeRejection, failRejectedAttempt } from './refundCreateRejection.ts';
import {
  APPROVED_REFUND_METADATA_TYPE,
  REFUND_ATTEMPT_METADATA_KEY,
  REFUND_REQUEST_METADATA_KEY,
  type SettlingRefund,
} from './refundRequests.ts';
import {
  settleAttemptFromStripe,
  type AttemptRef,
  type SettleAttemptResult,
  type SettleDeps,
} from './refundSettlement.ts';

export {
  findAttemptRefund,
  listAllIntentRefunds,
  type RefundListPage,
  type RefundPageLoader,
} from './refundSettlement.ts';

export type ApprovalRefund = SettlingRefund;

export interface RefundApprovalDeps extends SettleDeps {
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
  | { status: 404 | 409 | 500 | 502 | 503; body: { error: string } };

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
  attempt_version: number | null;
}

const DEAD_STATUSES = new Set(['failed', 'canceled']);
const SOURCE = 'stripe-approve-refund';

/** A refund for this request on ANOTHER attempt that Stripe still has live. */
export function findLiveRefundOnOtherAttempt<T extends ApprovalRefund>(
  refunds: T[],
  requestId: string,
  attemptNo: number
): T | undefined {
  return refunds.find(
    r =>
      r.metadata?.[REFUND_REQUEST_METADATA_KEY] === requestId &&
      r.metadata?.[REFUND_ATTEMPT_METADATA_KEY] !== String(attemptNo) &&
      !DEAD_STATUSES.has(r.status ?? '')
  );
}

/** What the admin sees for a settle result. */
function toApprovalResult(result: SettleAttemptResult): ApprovalResult {
  switch (result.outcome) {
    case 'settled':
      if (result.status === 'succeeded') {
        return { status: 200, body: { outcome: 'refunded', refund_id: result.refund.id } };
      }
      if (result.status === 'pending') {
        return { status: 202, body: { outcome: 'pending', refund_id: result.refund.id } };
      }
      // The request now reads 'failed' (unless another attempt succeeded).
      return { status: 502, body: { error: `stripe_refund_${result.status}` } };
    case 'stripe_unreachable':
      return { status: 503, body: { error: 'stripe_unreachable' } };
    case 'conflict':
      return { status: 503, body: { error: 'settle_busy' } };
    case 'refund_on_other_attempt':
      return { status: 409, body: { error: 'refund_attempt_conflict' } };
    case 'error':
      return { status: 500, body: { error: 'record_failed' } };
    default:
      return { status: 500, body: { error: 'claim_failed' } };
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
  if (claim.outcome === 'resolved') {
    // A site admin resolved it without a refund (Codex round 6): terminal.
    return { status: 409, body: { error: 'resolved_without_refund' } };
  }
  if (
    (claim.outcome !== 'claimed' && claim.outcome !== 'resume') ||
    !claim.attempt_no ||
    !claim.stripe_payment_intent_id ||
    !claim.amount_cents
  ) {
    return { status: 500, body: { error: 'claim_failed' } };
  }

  const ref: AttemptRef = { requestId: input.requestId, attemptNo: claim.attempt_no };
  const intentId = claim.stripe_payment_intent_id;

  // A refund Stripe already holds for this attempt is settled, never re-created.
  const first = await settleAttemptFromStripe(deps, ref);
  if (first.outcome !== 'no_refund') return toApprovalResult(first);

  const otherLive = findLiveRefundOnOtherAttempt(
    first.intentRefunds,
    input.requestId,
    ref.attemptNo
  );
  if (otherLive) {
    await deps.alertAdmin(
      'Refund approval stopped: another refund for this request is still live',
      `<p>Approving request <code>${input.requestId}</code> (attempt ${ref.attemptNo}) found
       Stripe refund <code>${otherLive.id}</code> (${otherLive.status}) from another
       attempt still live on payment intent <code>${intentId}</code>. No new refund was
       created. Check the payment in Stripe before approving again.</p>`,
      { source: SOURCE, dedupeKey: `approved-refund-other-live-${otherLive.id}` }
    );
    return { status: 409, body: { error: 'refund_exists_for_other_attempt' } };
  }

  let created: ApprovalRefund;
  try {
    created = await deps.createRefund(
      {
        payment_intent: intentId,
        amount: claim.amount_cents,
        metadata: {
          type: APPROVED_REFUND_METADATA_TYPE,
          [REFUND_REQUEST_METADATA_KEY]: input.requestId,
          [REFUND_ATTEMPT_METADATA_KEY]: String(ref.attemptNo),
          kind: claim.kind ?? '',
          reason: claim.reason ?? '',
          checkout_session_id: claim.stripe_checkout_session_id ?? '',
          // Every queued refund returns money for lines that never became
          // paid entries: make-whole, not a platform loss. On the Stripe
          // object so charge.refunded attributes it right in any order.
          [MAKE_WHOLE_METADATA_KEY]: 'true',
        },
      },
      `refund-request-${input.requestId}-${ref.attemptNo}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Approved refund ${input.requestId} failed at Stripe:`, err);
    const code = definitiveStripeRejection(err);
    if (code) {
      // Definitive: no refund exists and this key can only replay the error.
      return failRejectedAttempt(
        deps,
        {
          requestId: input.requestId,
          attemptNo: ref.attemptNo,
          attemptId: first.attemptId,
          attemptVersion: first.attemptVersion,
          paymentIntentId: intentId,
          code,
          message,
        },
        SOURCE
      );
    }
    // Ambiguous: Stripe may have created it. The attempt stays pending.
    await deps.alertAdmin(
      'Approved refund FAILED at Stripe',
      `<p>Refund request <code>${input.requestId}</code> (attempt ${ref.attemptNo}) was
       approved, but creating the Stripe refund on payment intent
       <code>${intentId}</code> failed:</p>
       <pre>${message}</pre>
       <p>The attempt stays open; approving it again retries it with the same
       idempotency key.</p>`,
      { source: SOURCE, dedupeKey: `approved-refund-failed-${input.requestId}-${ref.attemptNo}` }
    );
    return { status: 502, body: { error: 'stripe_refund_failed' } };
  }

  // The create response is never trusted for status: attach its id, re-read
  // the refund from Stripe, settle.
  const settled = await settleAttemptFromStripe(deps, ref, { createdRefundId: created.id });
  if (settled.outcome === 'refund_on_other_attempt' || settled.outcome === 'error') {
    await deps.alertAdmin(
      'Approved refund issued but not recorded on its attempt',
      `<p>Stripe refund <code>${created.id}</code> for request
       <code>${input.requestId}</code>, attempt ${ref.attemptNo}, could not be recorded:
       <code>${settled.outcome === 'error' ? settled.message : settled.outcome}</code>.</p>
       <p>Check the refund in Stripe before approving again.</p>`,
      { source: SOURCE, dedupeKey: `approved-refund-unrecorded-${created.id}` }
    );
  }
  if (settled.outcome === 'stripe_unreachable' || settled.outcome === 'conflict') {
    // Issued, and Stripe is the only truth for its state: report it submitted.
    // "Check status" (or the webhook) settles it.
    return { status: 202, body: { outcome: 'pending', refund_id: created.id } };
  }
  return toApprovalResult(settled);
}

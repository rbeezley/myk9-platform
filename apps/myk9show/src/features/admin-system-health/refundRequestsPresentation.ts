/** Pure shapes and copy for the refunds-awaiting-approval queue (MYK9-876). */

export type RefundRequestKind = 'abandoned_cart' | 'cart_overflow' | 'entry_payment_link';

export interface RefundRequest {
  id: string;
  kind: RefundRequestKind;
  /**
   * Derived in the database from the request's refund attempts:
   * 'awaiting_stripe': an approval is open and Stripe has not settled its
   * refund; checking again resumes that same attempt. 'failed': the latest
   * attempt's refund failed or was canceled; approving again opens a new
   * attempt (Codex rounds 1-2 on #2689).
   */
  status: 'pending' | 'awaiting_stripe' | 'failed';
  /** Why the last refund failed ("failed: expired_or_canceled_card"), or null. */
  lastFailure: string | null;
  amountCents: number;
  reason: string;
  paymentIntentId: string;
  checkoutSessionId: string;
  createdAt: string;
}

export interface RefundRequestRow {
  id: string;
  kind: string;
  status: string;
  amount_cents: number;
  reason: string;
  stripe_payment_intent_id: string;
  stripe_checkout_session_id: string;
  created_at: string;
  last_failure: string | null;
}

export function parseRefundRequest(row: RefundRequestRow): RefundRequest {
  return {
    id: row.id,
    kind: row.kind as RefundRequestKind,
    status: row.status === 'awaiting_stripe' || row.status === 'failed' ? row.status : 'pending',
    lastFailure: row.last_failure ?? null,
    amountCents: row.amount_cents,
    reason: row.reason,
    paymentIntentId: row.stripe_payment_intent_id,
    checkoutSessionId: row.stripe_checkout_session_id,
    createdAt: row.created_at,
  };
}

const KIND_LABEL: Record<RefundRequestKind, string> = {
  abandoned_cart: 'Paid after the cart was abandoned',
  cart_overflow: 'Cart lines the class could not take',
  entry_payment_link: 'Payment-link entries that could not be honored',
};

export function refundKindLabel(kind: string): string {
  return KIND_LABEL[kind as RefundRequestKind] ?? 'Refund owed';
}

export function formatRefundAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const APPROVAL_ERRORS: Record<string, string> = {
  fulfilled:
    'Not refunded: this payment was fulfilled with entries after all. Check the entries before doing anything else.',
  not_found: 'This refund request no longer exists.',
  stripe_refund_failed:
    'Stripe could not issue the refund. Nothing was refunded; you can approve it again.',
  claim_failed: 'The approval could not be recorded. Nothing was refunded; try again.',
  refund_exists_for_other_attempt:
    'Not refunded: Stripe still has a live refund for this request from an earlier approval. Check the payment in Stripe.',
  stripe_unreachable: "Couldn't reach Stripe to check this refund. Nothing was changed; try again.",
  settle_busy: 'This refund was being updated while we checked. Nothing was changed; try again.',
  refund_attempt_conflict:
    'The refund could not be matched to this approval. Check the payment in Stripe before trying again.',
  charge_already_refunded:
    'Not refunded: Stripe says this charge was already refunded. Check the payment in Stripe, then use Resolve without refund.',
  stripe_refund_rejected:
    'Stripe refused this refund, so nothing was refunded. You can approve it again or resolve it without a refund.',
  resolved_without_refund:
    'Not refunded: this request was resolved without a refund, so it can no longer be approved.',
};

export function approvalErrorMessage(code: string | undefined): string {
  if (code && APPROVAL_ERRORS[code]) return APPROVAL_ERRORS[code];
  if (code?.startsWith('stripe_refund_')) return APPROVAL_ERRORS.stripe_refund_failed;
  return 'The approval did not finish. Approving again is safe: it reuses any refund already issued.';
}

const RESOLUTION_ERRORS: Record<string, string> = {
  note_required: 'Add a note saying how the charge was honored.',
  has_live_attempt:
    'Not resolved: a refund for this request is still with Stripe or already went through. Check its status first.',
  not_resolvable: 'Not resolved: this request can no longer be resolved without a refund.',
  not_found: 'This refund request no longer exists.',
};

export function resolutionErrorMessage(code: string | undefined): string {
  if (code && RESOLUTION_ERRORS[code]) return RESOLUTION_ERRORS[code];
  return 'The request was not resolved. Nothing changed; try again.';
}

/**
 * "Resolve without refund" (Codex round 6 on #2689) is offered only while no
 * refund is with Stripe: the server refuses it otherwise.
 */
export function canResolveWithoutRefund(status: RefundRequest['status']): boolean {
  return status === 'pending' || status === 'failed';
}

/** The button label for a row, by where its refund stands. */
export function approveActionLabel(status: RefundRequest['status']): string {
  if (status === 'awaiting_stripe') return 'Check status';
  if (status === 'failed') return 'Approve again';
  return 'Approve refund';
}

/** What the approval returned: refunded now, or submitted and still settling. */
export type ApprovalOutcome = 'refunded' | 'already_refunded' | 'pending';

export function approvalSuccessMessage(outcome: ApprovalOutcome, amount: string): string {
  if (outcome === 'pending') {
    return `Refund of ${amount} submitted. Stripe is still processing it; it leaves this list once it succeeds.`;
  }
  return `Refunded ${amount} to the payer's card.`;
}

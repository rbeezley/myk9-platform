/** Pure shapes and copy for the refunds-awaiting-approval queue (MYK9-876). */

export type RefundRequestKind = 'abandoned_cart' | 'cart_overflow' | 'entry_payment_link';

export interface RefundRequest {
  id: string;
  kind: RefundRequestKind;
  /**
   * 'approved': an approval started and Stripe has not settled the refund yet;
   * approving again resumes it. 'failed': Stripe failed or canceled the refund;
   * approving again issues a new one (Codex P1 on #2689).
   */
  status: 'pending' | 'approved' | 'failed';
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
    status: row.status === 'approved' || row.status === 'failed' ? row.status : 'pending',
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
};

export function approvalErrorMessage(code: string | undefined): string {
  if (code && APPROVAL_ERRORS[code]) return APPROVAL_ERRORS[code];
  if (code?.startsWith('stripe_refund_')) return APPROVAL_ERRORS.stripe_refund_failed;
  return 'The approval did not finish. Approving again is safe: it reuses any refund already issued.';
}

/** The button label for a row, by where its refund stands. */
export function approveActionLabel(status: RefundRequest['status']): string {
  if (status === 'approved') return 'Finish refund';
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

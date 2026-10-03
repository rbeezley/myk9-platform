/** Pure shapes and copy for the refunds-awaiting-approval queue (MYK9-876). */

// Cart overflow is not queued (MYK9-964): it never appears here.
export type RefundRequestKind = 'abandoned_cart' | 'entry_payment_link';

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
  entry_payment_link: 'Payment-link entries that could not be honored',
};

export function refundKindLabel(kind: string): string {
  return KIND_LABEL[kind as RefundRequestKind] ?? 'Refund owed';
}

export function formatRefundAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * When the server cannot know whether Stripe created the refund: a create
 * that timed out or errored ambiguously, Stripe unreachable on a status
 * check, a contended or unrecorded settle, or no answer at all. Never
 * "nothing was refunded" here (Codex round 8 on #2689): the refund may
 * exist, and Check status finds it before anything is created again.
 */
export const UNCONFIRMED_REFUND_MESSAGE =
  "We couldn't confirm the refund with Stripe. It may have gone through, so use Check status before approving again.";

/**
 * Every code stripe-approve-refund returns for an approval or a Check status,
 * with its copy. "Nothing was refunded" / "no refund was created" appears ONLY
 * where the server KNOWS no refund exists for this approval: refused before
 * Stripe was called, or Stripe definitively refused or failed it.
 */
const APPROVAL_ERRORS: Record<string, string> = {
  // Refused before Stripe was called.
  fulfilled:
    'Not refunded: this payment was fulfilled with entries after all. Check the entries before doing anything else.',
  resolved_without_refund:
    'Not refunded: this request was resolved without a refund, so it can no longer be approved.',
  not_found: 'This refund request no longer exists.',
  claim_failed: 'The approval could not start, so no refund was created. Try again.',
  refund_exists_for_other_attempt:
    'No new refund was created: Stripe still has a live refund for this request from an earlier approval. Check the payment in Stripe.',
  // Stripe answered definitively.
  charge_already_refunded:
    'Not refunded by this approval: Stripe says this charge was already refunded. Check the payment in Stripe, then use Resolve without refund.',
  stripe_refund_rejected:
    'Stripe refused this refund, so nothing was refunded. You can approve it again or resolve it without a refund.',
  stripe_refund_failed:
    'Stripe reports this refund failed, so the customer was not paid. You can approve it again or resolve it without a refund.',
  stripe_refund_canceled:
    'Stripe reports this refund was canceled, so the customer was not paid. You can approve it again or resolve it without a refund.',
  // A refund exists but is not recorded on this approval.
  refund_unrecorded:
    'Stripe issued the refund, but it could not be recorded here. Check the payment in Stripe before approving again.',
  refund_attempt_conflict:
    'The refund could not be matched to this approval. Check the payment in Stripe before trying again.',
  // Not known whether a refund exists.
  stripe_create_unconfirmed: UNCONFIRMED_REFUND_MESSAGE,
  stripe_unreachable: UNCONFIRMED_REFUND_MESSAGE,
  settle_busy: UNCONFIRMED_REFUND_MESSAGE,
  record_failed: UNCONFIRMED_REFUND_MESSAGE,
};

/** Unknown codes and transport failures are unconfirmed, never "nothing refunded". */
export function approvalErrorMessage(code: string | undefined): string {
  return (code && APPROVAL_ERRORS[code]) || UNCONFIRMED_REFUND_MESSAGE;
}

const RESOLUTION_ERRORS: Record<string, string> = {
  note_required: 'Add a note saying how the charge was honored.',
  has_live_attempt:
    'Not resolved: a refund for this request is still with Stripe or already went through. Check its status first.',
  not_resolvable: 'Not resolved: this request can no longer be resolved without a refund.',
  not_found: 'This refund request no longer exists.',
};

/** A resolution that may or may not have landed (a database error, or no answer). */
export const UNCONFIRMED_RESOLUTION_MESSAGE =
  "We couldn't confirm the resolution. Refresh the list before trying again.";

export function resolutionErrorMessage(code: string | undefined): string {
  return (code && RESOLUTION_ERRORS[code]) || UNCONFIRMED_RESOLUTION_MESSAGE;
}

/**
 * What a FAILED row says, chosen from the latest attempt's failure reason
 * (Codex round 9 on #2689). `lastFailure` is derived in the database as
 * "<attempt status>: <failure_reason>". The reason is either a code from a
 * DEFINITIVE Stripe create rejection (fail_unissued_refund_attempt writes
 * one of PERMANENT_CREATE_CODES in refundCreateRejection.ts; each has its own
 * entry below) or Stripe's own reason for a refund it reports failed or
 * canceled. Only that last case may say "the customer was not paid".
 */
export interface FailedRowCopy {
  message: string;
  /** 'resolve': Approve again would only be refused the same way; hide it. */
  primaryAction: 'approve_again' | 'resolve';
}

export const DEFINITIVE_REJECTION_COPY: Record<string, FailedRowCopy> = {
  charge_already_refunded: {
    message:
      'Stripe says this charge was already refunded. Check the payment in Stripe, then Resolve without refund.',
    primaryAction: 'resolve',
  },
  amount_too_large: {
    message:
      'Stripe refused the refund: the amount is more than is left to refund on this charge (amount_too_large). No refund was made by us. Check the payment in Stripe, then approve again or resolve without refund.',
    primaryAction: 'approve_again',
  },
  charge_disputed: {
    message:
      'Stripe refused the refund: this charge is disputed (charge_disputed). No refund was made by us. Settle the dispute in Stripe, then approve again or resolve without refund.',
    primaryAction: 'approve_again',
  },
  refund_disputed_payment: {
    message:
      'Stripe refused the refund: the payment is under dispute (refund_disputed_payment). No refund was made by us. Settle the dispute in Stripe, then approve again or resolve without refund.',
    primaryAction: 'approve_again',
  },
};

export function failedRowCopy(lastFailure: string | null): FailedRowCopy {
  const separator = lastFailure?.indexOf(': ') ?? -1;
  const status = separator >= 0 ? lastFailure!.slice(0, separator) : null;
  const reason = separator >= 0 ? lastFailure!.slice(separator + 2) : null;
  if (reason && DEFINITIVE_REJECTION_COPY[reason]) return DEFINITIVE_REJECTION_COPY[reason];
  const ended = status === 'canceled' ? 'canceled the refund' : 'could not complete the refund';
  return {
    message: `Stripe ${ended} (${reason ?? 'no reason given'}); the customer was not paid. Approve again or resolve without refund.`,
    primaryAction: 'approve_again',
  };
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

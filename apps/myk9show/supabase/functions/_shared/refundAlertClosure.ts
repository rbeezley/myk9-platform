// A "Refund awaiting approval" alert closes when a site admin decides the
// request (MYK9-2540). Deno-free; stripe-approve-refund calls it after its
// decision with `resolveOperatorAlerts` from alertAdmin.ts.
//
// The database already closes the alert when the request reaches refunded or
// resolved_without_refund (trg_refund_requests_sync_closure, MYK9-981). What
// it does not close is an approval whose Stripe refund is still pending: the
// request reads awaiting_stripe and the alert kept asking for an approval
// that was given. So an approval closes it as soon as a refund is issued
// (200 refunded, 202 pending), and a resolution closes it again here too, with
// a note saying who decided it (a no-op when the trigger got there first).
//
// An approval that did not issue a refund (Stripe refused, an unconfirmed
// create, a conflict) leaves it open: the request still waits on a person. If
// an issued refund later fails at Stripe, refundSettlement.ts raises its own
// "back in the approval queue" alert. Nothing here moves money.

import type { AlertMatch } from './alertResolve.ts';

/** The awaiting-approval alert's source and key (raised by refundRequests.ts). */
export const AWAITING_APPROVAL_ALERT_SOURCE = 'stripe-webhook';
export function awaitingApprovalAlertKey(requestId: string): string {
  return `refund-request-${requestId}`;
}

export type RefundDecision = 'approved' | 'resolved_without_refund';

export type ResolveAlerts = (source: string, match: AlertMatch, note: string) => Promise<number>;

/** True when the decision's HTTP result means the request no longer awaits approval. */
export function decisionClosesAlert(decision: RefundDecision, httpStatus: number): boolean {
  // approved: 200 refunded / already_refunded, 202 refund issued and pending.
  // resolved_without_refund: 200 resolved / already_resolved.
  return decision === 'approved' ? httpStatus === 200 || httpStatus === 202 : httpStatus === 200;
}

export function refundDecisionNote(decision: RefundDecision, at: Date): string {
  const what =
    decision === 'approved'
      ? 'Approved by a site admin; the refund was issued'
      : 'Resolved without refund by a site admin';
  return `${what} at ${at.toISOString()}.`;
}

/**
 * Close the request's awaiting-approval alert when the decision took effect.
 * Never throws (a failed resolve must not turn a refund that went out into an
 * error the admin retries). Returns how many alerts it resolved.
 */
export async function closeAwaitingApprovalAlert(
  resolveAlerts: ResolveAlerts,
  input: { requestId: string; decision: RefundDecision; httpStatus: number; now: Date }
): Promise<number> {
  if (!decisionClosesAlert(input.decision, input.httpStatus)) return 0;
  try {
    return await resolveAlerts(
      AWAITING_APPROVAL_ALERT_SOURCE,
      { dedupeKey: awaitingApprovalAlertKey(input.requestId) },
      refundDecisionNote(input.decision, input.now)
    );
  } catch (err) {
    console.error(`Closing the awaiting-approval alert of ${input.requestId} failed:`, err);
    return 0;
  }
}

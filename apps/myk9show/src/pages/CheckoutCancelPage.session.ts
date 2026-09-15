/**
 * Did the "cancelled" checkout actually complete? (MYK9-509)
 *
 * Stripe's cancel_url is not only reached by pressing Cancel. The exhibitor can
 * hit Back from the receipt, restore a stale tab, or follow the link again from
 * history — all of which land here with a session that was PAID. The page used
 * to answer "Payment Cancelled" unconditionally and, since the MYK9-509 amend
 * button, offer a one-click path back into a live cart: a completed payment
 * represented as cancelled, one click from being paid twice.
 *
 * So the cancel page asks the same question the receipt asks, through the same
 * owner-scoped RPC (`verifyCheckoutSession`). This is a sibling module rather
 * than page-local state so the rule can be unit-tested without the card chrome,
 * and so the page itself stays small.
 *
 * Only a definite YES changes anything. `not_found`, `processing`, `failed`,
 * `unavailable`, a thrown request and a missing session id all keep the page
 * exactly as it was — a cancel landing that cannot verify is still the calm,
 * recoverable state the exhibitor needs, and guessing "paid" on a failure would
 * strand a genuinely abandoned cart with no way back to it.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { verifyCheckoutSession } from '@/lib/stripe';

export type CancelSessionStatus =
  /** No session id in the URL — the pre-MYK9-509 links, and any hand-typed visit. */
  | 'absent'
  /** A session id is present and the answer is still in flight. */
  | 'checking'
  /** Verified: this session was paid. The page must not call it cancelled. */
  | 'paid'
  /** Asked, and the answer was not "paid" (or could not be obtained). */
  | 'unresolved';

export interface CancelSessionState {
  status: CancelSessionStatus;
  /** The session id this verdict is about, for the link to the receipt. */
  sessionId: string | null;
}

/** Classify a verification result. Pure, so the mapping is testable on its own. */
export function isPaidVerification(result: { success: boolean }): boolean {
  // `success: true` is the only shape that carries a committed order, including
  // the full-overflow-refund outcome — money moved either way, and the receipt
  // surface is the one place allowed to explain which.
  return result.success === true;
}

export function useCancelledCheckoutSession(): CancelSessionState {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  // The verdict carries the id it is ABOUT, so a session id that changes under
  // the page can never be answered with the previous session's result, and the
  // status below is derived rather than pushed — no setState in render or
  // synchronously inside the effect.
  const [verdict, setVerdict] = useState<{ sessionId: string; paid: boolean } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    verifyCheckoutSession(sessionId)
      .then(result => {
        if (live) setVerdict({ sessionId, paid: isPaidVerification(result) });
      })
      .catch(() => {
        // A failed question is not evidence of a cancelled payment, but it is
        // also not evidence of a paid one. Fall back to today's behaviour.
        if (live) setVerdict({ sessionId, paid: false });
      });
    return () => {
      live = false;
    };
  }, [sessionId]);

  if (!sessionId) return { status: 'absent', sessionId: null };
  if (verdict?.sessionId !== sessionId) return { status: 'checking', sessionId };
  return { status: verdict.paid ? 'paid' : 'unresolved', sessionId };
}

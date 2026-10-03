// When Stripe refuses to CREATE an approved refund (Codex round 7 on #2689).
// Deno-free; refundApproval.ts calls it from its create catch.
//
// DEFINITIVE: a StripeInvalidRequestError (4xx, not 429) with a code that can
// never succeed for this charge, e.g. charge_already_refunded. No refund
// exists, and the attempt's idempotency key would only replay the same error,
// so the attempt is failed with the code (fail_unissued_refund_attempt, a
// compare-and-set) and the request derives to 'failed': approve again (a new
// attempt and key) or resolve without refund.
//
// AMBIGUOUS (anything else: network, timeout, 5xx, rate limit, idempotency
// errors, unknown codes): Stripe may or may not have created the refund. The
// attempt stays pending; Check status re-lists the intent and retries on the
// same key, which is safe.

import type { RefundQueueDeps } from './refundRequests.ts';

/** Stripe create errors that can never succeed for this charge. */
export const PERMANENT_CREATE_CODES: ReadonlySet<string> = new Set([
  'charge_already_refunded',
  'amount_too_large',
  'charge_disputed',
  'refund_disputed_payment',
]);

/** The Stripe error code when the rejection is definitive, else null (ambiguous). */
export function definitiveStripeRejection(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { type?: unknown; rawType?: unknown; statusCode?: unknown; code?: unknown };
  const invalidRequest =
    e.type === 'StripeInvalidRequestError' || e.rawType === 'invalid_request_error';
  const status = typeof e.statusCode === 'number' ? e.statusCode : null;
  if (!invalidRequest || status === null || status < 400 || status >= 500 || status === 429) {
    return null;
  }
  return typeof e.code === 'string' && PERMANENT_CREATE_CODES.has(e.code) ? e.code : null;
}

export type RejectionResult = { status: 409 | 500 | 502 | 503; body: { error: string } };

/** Fail the unissued attempt with Stripe's code, and say what to do next. */
export async function failRejectedAttempt(
  deps: Pick<RefundQueueDeps, 'rpc' | 'alertAdmin'>,
  input: {
    requestId: string;
    attemptNo: number;
    attemptId: string;
    attemptVersion: number;
    paymentIntentId: string;
    code: string;
    message: string;
  },
  source: string
): Promise<RejectionResult> {
  const { data, error } = await deps.rpc('fail_unissued_refund_attempt', {
    p_attempt_id: input.attemptId,
    p_expected_version: input.attemptVersion,
    p_failure_reason: input.code,
  });
  if (error) {
    console.error(`fail_unissued_refund_attempt failed for ${input.requestId}:`, error);
    return { status: 500, body: { error: 'record_failed' } };
  }
  const outcome = (Array.isArray(data) ? data[0] : data)?.outcome as string | undefined;
  if (outcome !== 'failed') {
    // The attempt changed under us (another approval, or a refund got
    // attached): nothing written. Check status settles whatever is true now.
    return { status: 503, body: { error: 'settle_busy' } };
  }

  const alreadyRefunded = input.code === 'charge_already_refunded';
  await deps.alertAdmin(
    alreadyRefunded
      ? 'Approved refund refused: Stripe says the charge was ALREADY refunded'
      : 'Approved refund refused by Stripe — attempt marked failed',
    `<p>Stripe refused to create the refund for request <code>${input.requestId}</code>
     (attempt ${input.attemptNo}, payment intent <code>${input.paymentIntentId}</code>):
     <code>${input.code}</code>.</p>
     <pre>${input.message}</pre>
     <p>${
       alreadyRefunded
         ? 'The money already went back to the payer at Stripe, outside this queue. Check the payment in Stripe; if it is confirmed, press <strong>Resolve without refund</strong> on the request (a note is required). Approving again will be refused the same way.'
         : 'Nothing was refunded. The attempt is marked failed and the request is back under <strong>Refunds awaiting approval</strong>: approve it again (a new attempt), or press <strong>Resolve without refund</strong> if it was honored another way.'
     }</p>`,
    {
      source,
      dedupeKey: `approved-refund-rejected-${input.requestId}-${input.attemptNo}`,
      detail: { refund_request_id: input.requestId, code: input.code },
    }
  );
  return {
    status: alreadyRefunded ? 409 : 502,
    body: { error: alreadyRefunded ? 'charge_already_refunded' : 'stripe_refund_rejected' },
  };
}

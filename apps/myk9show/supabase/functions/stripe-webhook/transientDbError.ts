// A PostgREST read or write that FAILED is not a missing row (MYK9-2338).
// Answering 200 to a failure tells Stripe the event is handled, so it never
// redelivers: a paid order stays unfulfilled until someone notices. Throwing instead reaches the request
// handler's catch (webhookHandler.ts), which alerts once per event and answers
// 500, and Stripe retries the event on its own schedule.
//
// Callers throw BEFORE any side effect in the handler (refund request, alert
// email, partial write), so a retry repeats nothing.

export interface DbError {
  message: string;
  code?: string;
}

/** PostgREST's code for `.single()` matching no row: a confirmed absence, not a failure. */
export const NO_ROW_CODE = 'PGRST116';

/**
 * Throws (so the webhook answers 5xx and Stripe retries) on ANY error. For
 * writes and for reads that are not `.single()`, where no error means "no row".
 */
export function throwIfDbError(error: DbError | null | undefined, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/**
 * The `.single()` form: PGRST116 (no row) is a confirmed absence the caller
 * handles from `data === null`; every other error throws for a retry.
 */
export function throwIfSingleReadFailed(error: DbError | null | undefined, what: string): void {
  if (error && error.code !== NO_ROW_CODE) throw new Error(`${what}: ${error.message}`);
}

/**
 * The time a paid checkout is judged at: the signed event's own `created`
 * (epoch seconds), which every redelivery of that event repeats. The retry
 * clock would refuse a cart that was paid before its expiry, or price it in a
 * later fee tier, only because Stripe retried after a failure above.
 */
export function paidAtIsoFromEvent(eventCreatedSeconds: number): string {
  return new Date(eventCreatedSeconds * 1000).toISOString();
}

/**
 * The payment-link row a paid session points at, or null when the lookup
 * CONFIRMED there is none (no error, no row). Only that confirmed absence may
 * queue the full-charge refund request; a failed lookup throws, because a
 * refund request recorded on a transient error makes every later redelivery
 * refuse to fulfill the paid order (routePaidSession checks requests first).
 * The lookup is `.maybeSingle()`, which reports no row as `data: null` with no
 * error, so EVERY error here is a failure.
 */
export function paymentLinkRowOrMissing<TData>(
  lookup: { data: TData; error: DbError | null },
  sessionId: string
): NonNullable<TData> | null {
  throwIfDbError(lookup.error, `Could not read the payment link for ${sessionId}`);
  return lookup.data ?? null;
}

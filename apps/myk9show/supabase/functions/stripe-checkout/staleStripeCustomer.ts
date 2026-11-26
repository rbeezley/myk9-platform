// Forget a stripe_customers row whose Stripe customer is gone (MYK9-2447).
// Deno-free so it runs under vitest.
//
// The delete guards correctness, so a failure stops checkout rather than
// carrying on: stripe_customers(person_id, livemode) is UNIQUE, so with the
// stale row still there the replacement insert hits 23505, and that branch
// hands back the surviving row's id, the deleted customer, after orphaning a
// freshly created one at Stripe. The caller deletes by the observed stale
// customer id, so a delete that matches no row (a concurrent request already
// replaced it) is not a failure: the insert's 23505 then returns that replacement.

export interface StaleRowDeleteResult {
  error: { message: string; code?: string } | null;
}

export async function forgetStaleStripeCustomer(
  staleCustomerId: string,
  deleteRow: () => PromiseLike<StaleRowDeleteResult>,
  logError: (message: string, error: unknown) => void
): Promise<boolean> {
  const { error } = await deleteRow();
  if (error) {
    logError(
      `Could not delete stale Stripe customer row ${staleCustomerId}; not creating a replacement:`,
      error
    );
    return false;
  }
  return true;
}

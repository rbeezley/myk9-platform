// Find or create the club's Stripe Express account for the running key's mode
// (MYK9-2445). Three failure rules:
//  - a failed lookup fails closed: no Stripe account is created, because an
//    unread row may exist and a second account would split the club's payouts;
//  - any insert failure re-reads the (club_id, livemode) row first: our own
//    id saved (a lost response) is success; another id saved (a 23505 race) is
//    used and ours deleted; no row deletes ours and fails; a failed re-read
//    keeps ours, since the saved row may name it.
// An upsert was rejected: it hides the race and can overwrite a saved account id.
//
// Deno-free so it runs under vitest; the edge function injects the Supabase
// and Stripe calls.

export interface DbError {
  code?: string;
  message?: string;
}

export interface ClubStripeAccountDeps {
  /** Select the (club_id, livemode) row's stripe_account_id. */
  findExisting: () => PromiseLike<{
    data: { stripe_account_id: string | null } | null;
    error: DbError | null;
  }>;
  /** Create a new Express account at Stripe and return its id. */
  createAccount: () => Promise<string>;
  /** Insert the (club_id, livemode, stripe_account_id) row. */
  insertRow: (stripeAccountId: string) => PromiseLike<{ error: DbError | null }>;
  /** Delete a Stripe account that was never saved. */
  deleteAccount: (stripeAccountId: string) => Promise<void>;
  logError: (message: string, detail?: unknown) => void;
}

export type ClubStripeAccountResult =
  | { ok: true; stripeAccountId: string; created: boolean }
  | { ok: false; reason: 'lookup_failed' | 'persist_failed' };

async function deleteOrphan(deps: ClubStripeAccountDeps, stripeAccountId: string): Promise<void> {
  // Nothing is onboarded on an account we just made, so deleting it is safe;
  // if Stripe refuses we keep the litter rather than fail the request twice.
  try {
    await deps.deleteAccount(stripeAccountId);
  } catch (delErr) {
    deps.logError(`Could not clean up orphaned account ${stripeAccountId}:`, delErr);
  }
}

export async function findOrCreateClubStripeAccount(
  deps: ClubStripeAccountDeps
): Promise<ClubStripeAccountResult> {
  const lookup = await deps.findExisting();
  if (lookup.error) {
    deps.logError('club_stripe_accounts lookup failed:', lookup.error);
    return { ok: false, reason: 'lookup_failed' };
  }
  const existingId = lookup.data?.stripe_account_id;
  if (existingId) return { ok: true, stripeAccountId: existingId, created: false };

  const createdId = await deps.createAccount();
  let insertError: DbError | null;
  try {
    ({ error: insertError } = await deps.insertRow(createdId));
  } catch (thrown) {
    insertError = { message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
  if (!insertError) return { ok: true, stripeAccountId: createdId, created: true };
  deps.logError(`Failed to persist stripe account ${createdId}:`, insertError);

  // Any insert failure is ambiguous until the row is re-read: a timeout can
  // hide a committed write, and a 23505 means another request saved first.
  // Delete our account only once the read proves it is not the saved one.
  const reread = await deps.findExisting();
  if (reread.error) {
    // Inconclusive: keep the Stripe account, since the saved row may name it.
    deps.logError('club_stripe_accounts re-read after a failed insert failed:', reread.error);
    return { ok: false, reason: 'persist_failed' };
  }
  const savedId = reread.data?.stripe_account_id;
  if (savedId === createdId) return { ok: true, stripeAccountId: createdId, created: true };
  await deleteOrphan(deps, createdId);
  if (!savedId) return { ok: false, reason: 'persist_failed' };
  return { ok: true, stripeAccountId: savedId, created: false };
}

// Find or create the club's Stripe Express account for the running key's mode
// (MYK9-2445). Three failure rules:
//  - a failed lookup fails closed: no Stripe account is created, because an
//    unread row may exist and a second account would split the club's payouts;
//  - a 23505 on insert means a concurrent request already saved a row for
//    (club_id, livemode): the account we just made is deleted and the saved
//    row is re-read and used;
//  - any other insert failure deletes the just-made account and fails.
// An upsert was rejected: it hides the race and can overwrite a saved account id.
//
// Deno-free so it runs under vitest; the edge function injects the Supabase
// and Stripe calls.

const UNIQUE_VIOLATION = '23505';

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
    // A rejected insert (network) must still clean up, or a retry makes a second account.
    insertError = { message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
  if (!insertError) return { ok: true, stripeAccountId: createdId, created: true };

  deps.logError(`Failed to persist stripe account ${createdId}:`, insertError);
  await deleteOrphan(deps, createdId);

  if (insertError.code !== UNIQUE_VIOLATION) return { ok: false, reason: 'persist_failed' };

  // A concurrent request saved the row first: use the account it saved.
  const reread = await deps.findExisting();
  if (reread.error) {
    deps.logError('club_stripe_accounts re-read after 23505 failed:', reread.error);
    return { ok: false, reason: 'persist_failed' };
  }
  const winnerId = reread.data?.stripe_account_id;
  if (!winnerId) {
    deps.logError('club_stripe_accounts re-read after 23505 found no account id');
    return { ok: false, reason: 'persist_failed' };
  }
  return { ok: true, stripeAccountId: winnerId, created: false };
}

import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { PendingMutation } from './types';

/**
 * Adoption of held ringside scores by a fresh anonymous (passcode) session
 * (MYK9-1205).
 *
 * A passcode judge whose anonymous session cannot be resumed signs in as a NEW
 * anonymous user, and owner isolation then holds the old user's queue forever.
 * After the new passcode validates online, the owner may let the new session take
 * those scores over so they upload under the re-validated claim. The rule is
 * narrow on purpose:
 *
 *  - pending rows only (a dead letter was refused by the server, or ran out of
 *    retries, and is a person's call to retry, never a bulk takeover);
 *  - stamped `ownerIsAnonymous` at enqueue: a signed-in account's work, and rows
 *    queued before the stamp existed, are never adoptable;
 *  - stamped with the SAME `showId` the new claim covers;
 *  - the replica rows those mutations target move with them, through their
 *    tables (MutationManager.adoptHeldMutations);
 *  - only the named ringside RPCs, which the server authorizes per row against
 *    the claim. Adoption changes the label on a row, nothing the server checks:
 *    show claim and OCC version still decide every upload.
 */
export interface AdoptHeldMutationsOptions {
  /** The show the new session's validated claim covers. */
  showId: string;
  /** The new owner: the current anonymous session's user id. */
  toAuthUserId: string;
  /** Ringside RPC names whose mutations may be adopted. */
  rpcNames: readonly string[];
}

export function isAdoptableHeldMutation(
  mutation: PendingMutation,
  { showId, toAuthUserId, rpcNames }: AdoptHeldMutationsOptions
): boolean {
  return (
    mutation.ownerIsAnonymous === true &&
    typeof mutation.authUserId === 'string' &&
    mutation.authUserId !== toAuthUserId &&
    mutation.showId === showId &&
    mutation.status === 'pending' &&
    mutation.rpc !== undefined &&
    rpcNames.includes(mutation.rpc.name)
  );
}

/** The held mutations this session may adopt right now, read from the queue. */
export async function findAdoptableHeldMutations(
  options: AdoptHeldMutationsOptions
): Promise<PendingMutation[]> {
  const db = await databaseManager.getDatabase('MutationManager');
  const pending = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
  return pending.filter(mutation => isAdoptableHeldMutation(mutation, options));
}

/**
 * Re-owns the queue rows `ids` in ONE transaction, each only if it is still
 * adoptable (a row that drained or changed since it was found is skipped).
 * Returns how many moved. The replica rows they target are moved BEFORE this, by
 * their tables (see OwnerTransferRegistry and MutationManager.adoptHeldMutations).
 */
export async function adoptHeldMutationsInStore(
  options: AdoptHeldMutationsOptions,
  ids: ReadonlySet<string>
): Promise<number> {
  const db = await databaseManager.getDatabase('MutationManager');
  const tx = db.transaction(REPLICATION_STORES.PENDING_MUTATIONS, 'readwrite');
  const rows = (await tx.store.getAll()) as PendingMutation[];
  let adopted = 0;
  for (const row of rows) {
    if (!ids.has(row.id) || !isAdoptableHeldMutation(row, options)) continue;
    await tx.store.put({ ...row, authUserId: options.toAuthUserId });
    adopted++;
  }
  await tx.done;
  return adopted;
}

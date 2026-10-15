import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { PendingMutation, ReplicatedRow } from './types';

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
 *  - the replica rows those mutations target move with them (see
 *    adoptHeldMutationsInStore);
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

export async function countAdoptableHeldMutations(
  options: AdoptHeldMutationsOptions
): Promise<number> {
  const db = await databaseManager.getDatabase('MutationManager');
  const pending = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
  return pending.filter(mutation => isAdoptableHeldMutation(mutation, options)).length;
}

/**
 * Re-owns the adoptable queue rows AND the replica rows they target, in ONE
 * transaction across both stores (they share a database). Returns how many
 * mutations moved.
 *
 * Account-owned replica rows are read by owner: a row left with the dead session
 * would be invisible to the new one, including a conflicted row (its conflict
 * snapshot is never cleared here), and an upload that hit a conflict could not be
 * resolved. Only the rows the adopted mutations name move, and only when the row
 * is owned by the SAME dead anonymous owner as the mutation.
 */
export async function adoptHeldMutationsInStore(
  options: AdoptHeldMutationsOptions
): Promise<number> {
  const db = await databaseManager.getDatabase('MutationManager');
  const tx = db.transaction(
    [REPLICATION_STORES.PENDING_MUTATIONS, REPLICATION_STORES.REPLICATED_TABLES],
    'readwrite'
  );
  const queue = tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS);
  const replica = tx.objectStore(REPLICATION_STORES.REPLICATED_TABLES);
  const rows = (await queue.getAll()) as PendingMutation[];
  let adopted = 0;
  for (const row of rows) {
    if (!isAdoptableHeldMutation(row, options)) continue;
    const replicaRow = (await replica.get([row.tableName, row.rowId])) as
      ReplicatedRow<unknown> | undefined;
    if (replicaRow && replicaRow.ownerAuthUserId === row.authUserId) {
      await replica.put({ ...replicaRow, ownerAuthUserId: options.toAuthUserId });
    }
    await queue.put({ ...row, authUserId: options.toAuthUserId });
    adopted++;
  }
  await tx.done;
  return adopted;
}

import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { requeueFailedMutation } from './mutation-requeue';
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
 *  - pending rows, plus (MYK9-2009) the dead letters the server refused ONLY because
 *    the passcode was regenerated or retired, named by `failedErrorIncludes`. Those
 *    never failed on their merits: the code they were scored under was replaced, so
 *    the new code must send them, with no tap from the judge. Any other dead letter
 *    (refused, or out of retries) is a person's call to retry, never a bulk takeover;
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
  /**
   * Dead letters whose recorded error contains this text are adopted and put back
   * in the queue as pending (MYK9-2009). Absent: dead letters are never adopted.
   * Unlike a pending row, one the new session already owns qualifies too: the
   * anonymous user can survive a code change when the sign-out never landed.
   */
  failedErrorIncludes?: string;
  /**
   * The live session's passcode claim (role and judge). A dead letter is adopted only
   * when it was queued under this same claim; a pending row queued under a different
   * claim is left for its own judge. Rows with no stamp match show-wide, as before
   * (pending only), so one judge's refused scores are never handed to another judge
   * on a shared device (MYK9-2009).
   */
  claim?: string;
}

export function isAdoptableHeldMutation(
  mutation: PendingMutation,
  { showId, toAuthUserId, rpcNames, failedErrorIncludes, claim }: AdoptHeldMutationsOptions
): boolean {
  if (
    mutation.ownerIsAnonymous !== true ||
    typeof mutation.authUserId !== 'string' ||
    mutation.showId !== showId ||
    mutation.rpc === undefined ||
    !rpcNames.includes(mutation.rpc.name)
  ) {
    return false;
  }
  if (mutation.status === 'pending') {
    const otherClaim =
      mutation.ringsideClaim !== undefined &&
      claim !== undefined &&
      mutation.ringsideClaim !== claim;
    return mutation.authUserId !== toAuthUserId && !otherClaim;
  }
  return (
    mutation.status === 'failed' &&
    claim !== undefined &&
    mutation.ringsideClaim === claim &&
    failedErrorIncludes !== undefined &&
    typeof mutation.error === 'string' &&
    mutation.error.includes(failedErrorIncludes)
  );
}

/** The held mutations this session may adopt right now, read from the queue (and the dead letters). */
export async function findAdoptableHeldMutations(
  options: AdoptHeldMutationsOptions
): Promise<PendingMutation[]> {
  const db = await databaseManager.getDatabase('MutationManager');
  const held = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
  const failed = (await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[];
  return [...held, ...failed].filter(mutation => isAdoptableHeldMutation(mutation, options));
}

/**
 * Re-owns the queue rows `ids` in ONE transaction, each only if it is still
 * adoptable (a row that drained or changed since it was found is skipped). A dead
 * letter moves out of the failed store into the queue as a fresh pending row.
 * Returns how many moved. The replica rows they target are moved BEFORE this, by
 * their tables (see OwnerTransferRegistry and MutationManager.adoptHeldMutations).
 */
export async function adoptHeldMutationsInStore(
  options: AdoptHeldMutationsOptions,
  ids: ReadonlySet<string>
): Promise<number> {
  const db = await databaseManager.getDatabase('MutationManager');
  const tx = db.transaction(
    [REPLICATION_STORES.PENDING_MUTATIONS, REPLICATION_STORES.FAILED_MUTATIONS],
    'readwrite'
  );
  const pendingStore = tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS);
  const failedStore = tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS);
  const rows = [
    ...((await pendingStore.getAll()) as PendingMutation[]),
    ...((await failedStore.getAll()) as PendingMutation[]),
  ];
  let adopted = 0;
  for (const row of rows) {
    if (!ids.has(row.id) || !isAdoptableHeldMutation(row, options)) continue;
    if (row.status === 'failed') {
      await pendingStore.put({
        ...requeueFailedMutation(row),
        authUserId: options.toAuthUserId,
      });
      await failedStore.delete(row.id);
    } else {
      await pendingStore.put({ ...row, authUserId: options.toAuthUserId });
    }
    adopted++;
  }
  await tx.done;
  return adopted;
}

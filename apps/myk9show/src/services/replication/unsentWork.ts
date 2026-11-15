/**
 * Everything on this device that has not reached the server, counted the way a judge
 * counts it (MYK9-2011, owner decision 6, 2026-11-14).
 *
 * Two stores hold unsent work: the queue (waiting, retried on its own) and the dead
 * letters (`failed_mutations`, refused by the server or out of retries). Both count:
 * a refused score that drops out of the count let the header read "All changes saved"
 * while the score sat on the phone.
 *
 * The count is in scores, not queue rows. One dog scored is one score, however many
 * rows that save queued (the score, the ring exit, a correction). Any other change is
 * counted once per row it changes. Reads IndexedDB only, so it works with no signal,
 * and reads every account on this device, like the sign-out guard: a score saved under
 * an earlier passcode is still on this phone and still not sent.
 */
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';
import { RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';

/** One dog's score that has not reached the server. */
export interface UnsentScore {
  entryId: string;
  /** The show the score was taken at (stamped at enqueue); absent on old rows. */
  showId: string | undefined;
  /** The score to show: the refused one when there is one, else the newest waiting one. */
  mutation: PendingMutation;
  /** True when the server refused it (or it ran out of tries); it will not send on its own. */
  refused: boolean;
  /** Every refused queue row for this dog's entry: what Try again and Remove act on. */
  failedMutationIds: string[];
}

export interface UnsentWork {
  scores: UnsentScore[];
  /** Rows changed by anything other than a score (a check-in, a show edit). */
  otherChangeCount: number;
  /** Refused scores plus refused other changes: the work that needs a person. */
  refusedCount: number;
  /** Scores plus other changes: zero, and only zero, is "all sent". */
  total: number;
}

export const EMPTY_UNSENT_WORK: UnsentWork = {
  scores: [],
  otherChangeCount: 0,
  refusedCount: 0,
  total: 0,
};

/** A judge's saved score: a ringside entry write that marks the dog scored. */
export function isScoreMutation(
  mutation: Pick<PendingMutation, 'tableName' | 'rpc'>
): mutation is Pick<PendingMutation, 'tableName' | 'rpc'> & {
  rpc: NonNullable<PendingMutation['rpc']>;
} {
  return (
    mutation.tableName === 'entries' &&
    mutation.rpc?.name === RINGSIDE_RPC_FUNCTION &&
    mutation.rpc.fields?.is_scored === true
  );
}

/** The later of two writes: by queue sequence when both have one, else by when they were saved. */
function newest(a: PendingMutation, b: PendingMutation): PendingMutation {
  if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
    return b.sequenceNumber > a.sequenceNumber ? b : a;
  }
  return b.timestamp > a.timestamp ? b : a;
}

export function summarizeUnsentWork(
  pending: readonly PendingMutation[],
  failed: readonly PendingMutation[]
): UnsentWork {
  const scores = new Map<string, UnsentScore>();
  const add = (mutation: PendingMutation, refused: boolean) => {
    if (!isScoreMutation(mutation)) return;
    const current = scores.get(mutation.rowId);
    if (!current) {
      scores.set(mutation.rowId, {
        entryId: mutation.rowId,
        showId: mutation.showId,
        mutation,
        refused,
        failedMutationIds: [],
      });
      return;
    }
    if (current.refused && !refused) return;
    const shown = current.refused === refused ? newest(current.mutation, mutation) : mutation;
    scores.set(mutation.rowId, {
      ...current,
      showId: current.showId ?? mutation.showId,
      mutation: shown,
      refused: current.refused || refused,
    });
  };
  for (const mutation of failed) add(mutation, true);
  for (const mutation of pending) add(mutation, false);

  // Every other row changed, once, unless it is a scored dog's own row (already counted).
  const otherRows = new Set<string>();
  const refusedOtherRows = new Set<string>();
  const countOther = (mutation: PendingMutation, refused: boolean) => {
    const score = mutation.tableName === 'entries' ? scores.get(mutation.rowId) : undefined;
    if (score) {
      if (refused) score.failedMutationIds.push(mutation.id);
      return;
    }
    const key = `${mutation.tableName}:${mutation.rowId}`;
    otherRows.add(key);
    if (refused) refusedOtherRows.add(key);
  };
  for (const mutation of failed) countOther(mutation, true);
  for (const mutation of pending) countOther(mutation, false);

  const list = [...scores.values()].sort((a, b) => a.mutation.timestamp - b.mutation.timestamp);
  const refusedScores = list.filter(score => score.refused).length;
  return {
    scores: list,
    otherChangeCount: otherRows.size,
    refusedCount: refusedScores + refusedOtherRows.size,
    total: list.length + otherRows.size,
  };
}

/** This device's whole queue and dead letters, every account, in one read. */
export async function readDeviceUnsentWork(): Promise<UnsentWork> {
  const db = await databaseManager.getDatabase('MutationManager');
  const tx = db.transaction(
    [REPLICATION_STORES.PENDING_MUTATIONS, REPLICATION_STORES.FAILED_MUTATIONS],
    'readonly'
  );
  const [pending, failed] = (await Promise.all([
    tx.objectStore(REPLICATION_STORES.PENDING_MUTATIONS).getAll(),
    tx.objectStore(REPLICATION_STORES.FAILED_MUTATIONS).getAll(),
  ])) as [PendingMutation[], PendingMutation[]];
  await tx.done;
  return summarizeUnsentWork(pending, failed);
}

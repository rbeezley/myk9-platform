/**
 * Everything on this device that has not reached the server, counted the way a judge
 * counts it (MYK9-2011, owner decision 6, 2026-11-14).
 *
 * Two stores hold unsent work: the queue (waiting, retried on its own) and the dead
 * letters (`failed_mutations`, refused by the server or out of retries). Both count:
 * a refused score that drops out of the count let the header read "All changes saved"
 * while the score sat on the phone.
 *
 * The count is in scores, not queue rows. Each scored dog is one "score unit", built once
 * here and used by every count, the Scores not sent list and its actions:
 *  - the unit shows the NEWEST version of the dog's score on this device, so a correction
 *    saved after a refusal is what the judge sees;
 *  - Try again resends only that newest version, and only when it is the refused one. A
 *    refused version that a newer score replaced (still waiting, or already on the replica
 *    from an upload) is never resent over it; it can only be removed;
 *  - Remove acts only on the score's own queue rows. A refused check-in or ring change on the
 *    same entry is its own change, counted on its own and never removed with the score.
 * Waiting rows that ride along with a score (the ring exit of the same save) fold into it.
 *
 * Reads IndexedDB only, so it works with no signal, and reads every account on this device,
 * like the sign-out guard: a score saved under an earlier passcode is still on this phone and
 * still not sent. A failed read rejects; it is never reported as "nothing unsent".
 */
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';
import { RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';
import { replicatedEntriesTable } from './ReplicatedEntriesTable';
import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/**
 * - `waiting`: the newest version is queued and will send on its own.
 * - `refused`: the newest version was refused; Try again resends it.
 * - `superseded`: a refused version that a newer score for the dog replaced (the replica holds a
 *   later scored run). Nothing to send; it can only be removed.
 */
export type ScoreUnitState = 'waiting' | 'refused' | 'superseded';

/** One dog's score on this device that has not reached the server. */
export interface UnsentScore {
  entryId: string;
  /** The show the score was taken at (stamped at enqueue, else the replica row's show). */
  showId: string | undefined;
  /** This device's replica row for the entry (any account), for the dog and class. */
  entry: ReplicatedEntry | undefined;
  /** The newest version of the dog's score on this device: what the list shows. */
  mutation: PendingMutation;
  state: ScoreUnitState;
  /** What Try again resends: the newest version, only when it is the refused one. */
  retryIds: string[];
  /** What Remove deletes: this score's own refused versions, never another change. */
  removeIds: string[];
  /** A refused change on the same entry that is not the score (a check-in, a ring change). */
  hasOtherRefusedChange: boolean;
}

export interface UnsentWork {
  /** Every score unit, superseded ones included (they are listed, not counted). */
  scores: UnsentScore[];
  /** Dogs whose score is waiting or refused. */
  unsentScoreCount: number;
  /** Rows changed by anything other than a score (a check-in, a show edit). */
  otherChangeCount: number;
  /** Refused scores plus refused other changes: the work that needs a person. */
  refusedCount: number;
  /** Unsent scores plus other changes: zero, and only zero, is "all sent". */
  total: number;
}

export const EMPTY_UNSENT_WORK: UnsentWork = {
  scores: [],
  unsentScoreCount: 0,
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

/** Later first: by queue sequence when both have one, else by when they were saved. */
function byNewest(a: PendingMutation, b: PendingMutation): number {
  if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
    return b.sequenceNumber - a.sequenceNumber;
  }
  return b.timestamp - a.timestamp;
}

function scoredAt(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : at;
}

/** The replica holds a later scored run than this version: a newer score replaced it. */
function replacedOnReplica(mutation: PendingMutation, entry: ReplicatedEntry | undefined): boolean {
  const mine = scoredAt(mutation.rpc?.fields?.scoring_completed_at);
  const replica = scoredAt(entry?.scoring_completed_at ?? entry?.scoringCompletedAt);
  return mine !== undefined && replica !== undefined && replica > mine;
}

interface Versions {
  versions: PendingMutation[];
  failedIds: Set<string>;
}

function scoreUnit(
  entryId: string,
  { versions, failedIds }: Versions,
  entry: ReplicatedEntry | undefined,
  hasOtherRefusedChange: boolean
): UnsentScore {
  const sorted = [...versions].sort(byNewest);
  const newest = sorted[0] as PendingMutation;
  const newestRefused = failedIds.has(newest.id);
  const state: ScoreUnitState = !newestRefused
    ? 'waiting'
    : replacedOnReplica(newest, entry)
      ? 'superseded'
      : 'refused';
  return {
    entryId,
    showId: sorted.find(v => v.showId)?.showId ?? entry?.showId,
    entry,
    mutation: newest,
    state,
    retryIds: state === 'refused' ? [newest.id] : [],
    removeIds: state === 'waiting' ? [] : sorted.filter(v => failedIds.has(v.id)).map(v => v.id),
    hasOtherRefusedChange,
  };
}

export function summarizeUnsentWork(
  pending: readonly PendingMutation[],
  failed: readonly PendingMutation[],
  entries: ReadonlyMap<string, ReplicatedEntry | undefined> = new Map()
): UnsentWork {
  const byEntry = new Map<string, Versions>();
  const collect = (mutation: PendingMutation, refused: boolean) => {
    if (!isScoreMutation(mutation)) return;
    const unit = byEntry.get(mutation.rowId) ?? { versions: [], failedIds: new Set<string>() };
    unit.versions.push(mutation);
    if (refused) unit.failedIds.add(mutation.id);
    byEntry.set(mutation.rowId, unit);
  };
  for (const mutation of failed) collect(mutation, true);
  for (const mutation of pending) collect(mutation, false);

  // Every other change counts once per row. A waiting row on a scored dog's entry rides with
  // the score; a refused one is its own change, named on the dog's row and counted here.
  const otherRows = new Set<string>();
  const refusedOtherRows = new Set<string>();
  const countOther = (mutation: PendingMutation, refused: boolean) => {
    if (isScoreMutation(mutation)) return;
    const onScoredEntry = mutation.tableName === 'entries' && byEntry.has(mutation.rowId);
    if (onScoredEntry && !refused) return;
    const key = `${mutation.tableName}:${mutation.rowId}`;
    otherRows.add(key);
    if (refused) refusedOtherRows.add(key);
  };
  for (const mutation of failed) countOther(mutation, true);
  for (const mutation of pending) countOther(mutation, false);

  const scores = [...byEntry.entries()]
    .map(([entryId, versions]) =>
      scoreUnit(entryId, versions, entries.get(entryId), refusedOtherRows.has(`entries:${entryId}`))
    )
    .sort((a, b) => a.mutation.timestamp - b.mutation.timestamp);
  const unsent = scores.filter(score => score.state !== 'superseded');
  const refusedScores = unsent.filter(score => score.state === 'refused').length;
  return {
    scores,
    unsentScoreCount: unsent.length,
    otherChangeCount: otherRows.size,
    refusedCount: refusedScores + refusedOtherRows.size,
    total: unsent.length + otherRows.size,
  };
}

export type ReadEntryRow = (entryId: string) => Promise<ReplicatedEntry | undefined>;

/** The device's replica row for an entry, whichever account it belongs to. */
const readEntryRowOnDevice: ReadEntryRow = async entryId =>
  (await replicatedEntriesTable.getReplicatedRowIncludingOtherAccounts(entryId))?.data;

/** This device's whole queue and dead letters, every account, in one read. Rejects on failure. */
export async function readDeviceUnsentWork(
  readEntry: ReadEntryRow = readEntryRowOnDevice
): Promise<UnsentWork> {
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
  const scoredIds = new Set(
    [...failed, ...pending].filter(m => isScoreMutation(m)).map(m => m.rowId)
  );
  const entries = new Map<string, ReplicatedEntry | undefined>();
  await Promise.all(
    [...scoredIds].map(async id => {
      entries.set(id, await readEntry(id));
    })
  );
  return summarizeUnsentWork(pending, failed, entries);
}

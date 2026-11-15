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
 *  - Try again resends only that newest version, only when it is the refused one, and only
 *    while this device's replica still holds exactly that score. Supersession is by VALUE:
 *    if any score field on the replica differs from the refused payload (a correction, a
 *    reset that cleared it, another device's score pulled down), resending would overwrite
 *    what the dog now has, so the version is superseded and can only be removed;
 *  - Remove acts only on the score's own queue rows. A refused check-in or ring change on the
 *    same entry is its own change, counted on its own and never removed with the score.
 * A waiting check-in or ring change on the same entry folds into the score only while that
 * score is itself counted (waiting or refused); behind a superseded score it counts on its own.
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
 * - `superseded`: a refused version the replica no longer matches (its score fields differ).
 *   Nothing to send; it can only be removed.
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

/** Ringside columns a score payload may carry that are not the score itself. */
const NOT_SCORE_FIELDS: ReadonlySet<string> = new Set([
  'run_order',
  'check_in_status',
  'is_in_ring',
  'ring_entry_time',
  'ring_exit_time',
  'updated_at',
  'version',
]);

/**
 * The score's own save times, compared as instants with a 1-second tolerance. One save can
 * stamp `scoringCompletedAt` and `scoring_completed_at` a millisecond apart, so within 1 s is the
 * same save. Further apart is a different save: a judge who re-saved the same result after a
 * refusal has a newer completion time, and resending the old one would put it back.
 */
const SAVE_TIME_FIELDS: Readonly<Record<string, string>> = {
  scoring_completed_at: 'scoringCompletedAt',
  scoring_started_at: 'scoringStartedAt',
};
const SAME_SAVE_TOLERANCE_MS = 1000;

function instant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

function sameSaveTime(value: unknown, row: Record<string, unknown>, key: string): boolean {
  const camel = SAVE_TIME_FIELDS[key] as string;
  const mine = instant(value);
  const replica = instant(row[key] ?? row[camel]);
  if (mine === null || replica === null) return mine === replica;
  return Math.abs(replica - mine) <= SAME_SAVE_TOLERANCE_MS;
}

/** Every other timestamp is bookkeeping, not the score, and is left out. */
function isTimestampField(key: string): boolean {
  return /(_at|At|_timestamp|Timestamp)$/.test(key);
}

/** null and undefined are both "not set". */
function normalized(value: unknown): unknown {
  return value === undefined || value === null ? null : value;
}

/**
 * Whether this device's replica still holds exactly the score this version would send. Score
 * CONTENT only: any difference in a result, time, fault, find or reason field means the dog's
 * score moved on, so resending would overwrite it. Of the timestamps, only the score's own
 * save times count (see `SAVE_TIME_FIELDS`).
 * With no replica row there is nothing it could overwrite here, so it still matches.
 */
export function replicaHoldsScore(
  mutation: PendingMutation,
  entry: ReplicatedEntry | undefined
): boolean {
  if (!entry) return true;
  const row = entry as unknown as Record<string, unknown>;
  return Object.entries(mutation.rpc?.fields ?? {}).every(
    ([key, value]) =>
      NOT_SCORE_FIELDS.has(key) ||
      (key in SAVE_TIME_FIELDS
        ? sameSaveTime(value, row, key)
        : isTimestampField(key) || normalized(value) === normalized(row[key]))
  );
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
    : replicaHoldsScore(newest, entry)
      ? 'refused'
      : 'superseded';
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

  const refusedOnEntry = new Set(
    failed.filter(m => !isScoreMutation(m) && m.tableName === 'entries').map(m => m.rowId)
  );
  const scores = [...byEntry.entries()]
    .map(([entryId, versions]) =>
      scoreUnit(entryId, versions, entries.get(entryId), refusedOnEntry.has(entryId))
    )
    .sort((a, b) => a.mutation.timestamp - b.mutation.timestamp);
  const countedUnits = new Set(
    scores.filter(score => score.state !== 'superseded').map(score => score.entryId)
  );

  // Every other change counts once per row. A waiting row rides with its dog's score only while
  // that score is counted; a refused one is always its own change, named on the dog's row.
  const otherRows = new Set<string>();
  const refusedOtherRows = new Set<string>();
  const countOther = (mutation: PendingMutation, refused: boolean) => {
    if (isScoreMutation(mutation)) return;
    const ridesWithScore = mutation.tableName === 'entries' && countedUnits.has(mutation.rowId);
    if (ridesWithScore && !refused) return;
    const key = `${mutation.tableName}:${mutation.rowId}`;
    otherRows.add(key);
    if (refused) refusedOtherRows.add(key);
  };
  for (const mutation of failed) countOther(mutation, true);
  for (const mutation of pending) countOther(mutation, false);

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

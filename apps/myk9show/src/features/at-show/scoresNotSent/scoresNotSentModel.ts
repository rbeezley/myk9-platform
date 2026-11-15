/**
 * "Scores not sent" (MYK9-2011): every score on this device that has not reached the server,
 * whether it is still waiting in the queue or the server refused it. One row per dog.
 *
 * It reads the two stores the queue already keeps in IndexedDB (pending mutations and the
 * failed-mutation dead letters); there is no second queue. A score is a ringside RPC write to
 * `entries` whose delta marks the entry scored, the same test the class card count uses.
 */
import type { PendingMutation } from '@myk9/replication';
import { RINGSIDE_RPC_FUNCTION } from '@/services/replication/ringsideEntryRpc';

export type UnsentScoreState = 'waiting' | 'refused';

export interface UnsentScore {
  entryId: string;
  /** The show the score was queued under, when the queue stamped it (passcode sessions). */
  showId: string | undefined;
  /** `refused` when the newest score for this dog is a dead letter; otherwise still trying. */
  state: UnsentScoreState;
  /** The score as saved: every queued score field for the dog, newest last wins. */
  fields: Readonly<Record<string, unknown>>;
  /** The dead letters for this dog, which Try again and Remove act on. */
  failedMutationIds: string[];
  /** The newest dead letter, for the plain-words reason. Absent while waiting. */
  refusal: Pick<PendingMutation, 'error' | 'failureKind'> | undefined;
  /** When the newest score for this dog was queued (ms). */
  queuedAt: number;
}

/** A queued ringside score: the RPC write whose delta marks the entry scored. */
export function isRingsideScoreMutation(
  mutation: Pick<PendingMutation, 'tableName' | 'rpc'>
): boolean {
  return (
    mutation.tableName === 'entries' &&
    mutation.rpc?.name === RINGSIDE_RPC_FUNCTION &&
    mutation.rpc.fields?.is_scored === true
  );
}

function refusalOf(mutation: PendingMutation): Pick<PendingMutation, 'error' | 'failureKind'> {
  return {
    ...(mutation.error !== undefined && { error: mutation.error }),
    ...(mutation.failureKind !== undefined && { failureKind: mutation.failureKind }),
  };
}

/** One row per dog, newest first. `pending` and `failed` are this user's two queue stores. */
export function collectUnsentScores(
  pending: readonly PendingMutation[],
  failed: readonly PendingMutation[]
): UnsentScore[] {
  const byEntry = new Map<string, PendingMutation[]>();
  for (const mutation of [...pending, ...failed]) {
    if (!isRingsideScoreMutation(mutation)) continue;
    const list = byEntry.get(mutation.rowId) ?? [];
    list.push(mutation);
    byEntry.set(mutation.rowId, list);
  }

  const scores: UnsentScore[] = [];
  for (const [entryId, mutations] of byEntry) {
    mutations.sort((a, b) => a.timestamp - b.timestamp);
    const newest = mutations[mutations.length - 1] as PendingMutation;
    const deadLetters = mutations.filter(mutation => mutation.status === 'failed');
    const newestDeadLetter = deadLetters[deadLetters.length - 1];
    const fields: Record<string, unknown> = {};
    for (const mutation of mutations) Object.assign(fields, mutation.rpc?.fields);
    scores.push({
      entryId,
      showId: mutations.find(mutation => mutation.showId)?.showId,
      state: newest.status === 'failed' ? 'refused' : 'waiting',
      fields,
      failedMutationIds: deadLetters.map(mutation => mutation.id),
      refusal:
        newest.status === 'failed' && newestDeadLetter ? refusalOf(newestDeadLetter) : undefined,
      queuedAt: newest.timestamp,
    });
  }
  return scores.sort((a, b) => b.queuedAt - a.queuedAt);
}

/** "1 score not sent yet", "3 scores not sent yet": the count is in scores, never changes. */
export function scoresNotSentLabel(count: number): string {
  return `${count} ${count === 1 ? 'score' : 'scores'} not sent yet`;
}

/** The one list, reached from every count. */
export function scoresNotSentPath(showId: string): string {
  return `/at-show/${encodeURIComponent(showId)}/scores-not-sent`;
}

/** Router state a count's link carries, so the list's Up returns to that screen. */
export interface ScoresNotSentLinkState {
  scoresNotSentFrom: 'Entries' | 'Classes';
}

/** Fired after Try again or Remove, so every count re-reads the queue at once. */
export const SCORES_NOT_SENT_CHANGED_EVENT = 'scores-not-sent:changed';

/** Every event after which the unsent scores may have changed. */
export const SCORES_NOT_SENT_REFRESH_EVENTS = [
  'replication:mutation-queued',
  'replication:upload-complete',
  'replication:sync-failed',
  'replication:queue-overflow',
  'replication:recovery',
  'replication:conflict',
  SCORES_NOT_SENT_CHANGED_EVENT,
] as const;

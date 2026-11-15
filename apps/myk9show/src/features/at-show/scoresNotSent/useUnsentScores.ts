/**
 * Reads "Scores not sent" from this device (MYK9-2011). IndexedDB only: the queue's two stores
 * and the replicated entries and classes, never PostgREST, so it works with no signal and after a
 * reload. Re-reads on every replication event, after Try again or Remove, and on a slow backstop.
 */
import { useCallback, useEffect, useState } from 'react';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { buildClassName } from '../atShowClassListAdapter';
import {
  collectUnsentScores,
  SCORES_NOT_SENT_CHANGED_EVENT,
  SCORES_NOT_SENT_REFRESH_EVENTS,
  type UnsentScore,
} from './scoresNotSentModel';

/** This user's unsent scores on this device, every show. */
export async function readUnsentScores(): Promise<UnsentScore[]> {
  const [pending, failed] = await Promise.all([
    mutationManager.getPendingMutationsForTable('entries'),
    mutationManager.getFailedMutations(),
  ]);
  return collectUnsentScores(pending, failed);
}

/** Re-runs `read` on every event that can change the unsent scores; keeps the last value on error. */
function useQueueRead<T>(read: () => Promise<T>, initial: T, pollMs = 15_000): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      read()
        .then(next => {
          if (!cancelled) setValue(next);
        })
        .catch(() => {
          /* best-effort; keep the last known value */
        });
    };
    refresh();
    for (const name of SCORES_NOT_SENT_REFRESH_EVENTS) window.addEventListener(name, refresh);
    const interval = setInterval(refresh, pollMs);
    return () => {
      cancelled = true;
      for (const name of SCORES_NOT_SENT_REFRESH_EVENTS) window.removeEventListener(name, refresh);
      clearInterval(interval);
    };
  }, [read, pollMs]);
  return value;
}

/** How many scores on this device have not reached the server, waiting or refused, every show. */
export function useUnsentScoreCount(): number {
  return useQueueRead(readUnsentScoreCount, 0);
}

async function readUnsentScoreCount(): Promise<number> {
  return (await readUnsentScores()).length;
}

/** A row whose dog is not in this device's copy of the show. */
export const UNKNOWN_DOG_LABEL = 'A dog not on this device';

export interface UnsentScoreRow extends UnsentScore {
  /** Armband and call name, "100 Willow". */
  dogLabel: string;
  classId: string | undefined;
  className: string | undefined;
}

/** The unsent scores for one show's dogs, named from the replica. */
export async function readUnsentScoreRows(showId: string): Promise<UnsentScoreRow[]> {
  const scores = await readUnsentScores();
  if (scores.length === 0) return [];
  const entries = new Map(
    (await replicatedEntriesTable.getEntriesByShow(showId)).map(entry => [entry.id, entry])
  );
  const classNames = new Map<string, string | undefined>();
  const rows: UnsentScoreRow[] = [];
  for (const score of scores) {
    const entry = entries.get(score.entryId);
    if (!entry && score.showId !== showId) continue;
    const classId = entry?.classId;
    if (classId && !classNames.has(classId)) {
      const cls = await replicatedClassesTable.getClassById(classId);
      classNames.set(classId, cls ? buildClassName(cls) : undefined);
    }
    const dogLabel = [entry?.armband, entry?.dogCallName ?? entry?.dog_call_name]
      .filter(part => part !== undefined && part !== null && String(part).trim() !== '')
      .join(' ');
    rows.push({
      ...score,
      dogLabel: dogLabel || UNKNOWN_DOG_LABEL,
      classId,
      className: classId ? classNames.get(classId) : undefined,
    });
  }
  return rows;
}

/** One show's unsent scores, `null` until the first read lands. */
export function useUnsentScoreRows(showId: string | undefined): UnsentScoreRow[] | null {
  const read = useCallback(async () => (showId ? readUnsentScoreRows(showId) : []), [showId]);
  return useQueueRead<UnsentScoreRow[] | null>(read, null);
}

function announceChange(): void {
  window.dispatchEvent(new CustomEvent(SCORES_NOT_SENT_CHANGED_EVENT));
}

/** Try again: the refused score goes back in the queue with a full set of tries. */
export async function retryUnsentScore(score: Pick<UnsentScore, 'failedMutationIds'>) {
  await Promise.allSettled(
    score.failedMutationIds.map(id => mutationManager.retryFailedMutation(id))
  );
  announceChange();
}

/** Remove, after the judge confirmed it: the refused score is deleted from this device. */
export async function removeUnsentScore(score: Pick<UnsentScore, 'failedMutationIds'>) {
  await Promise.allSettled(
    score.failedMutationIds.map(id => mutationManager.discardFailedMutation(id))
  );
  announceChange();
}

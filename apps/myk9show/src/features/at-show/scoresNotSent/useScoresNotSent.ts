/**
 * The rows of the Scores not sent list for one show (MYK9-2011). Every source is on this
 * device: the queue and dead letters (`readDeviceUnsentWork`), and the replicated entries and
 * classes for the dog and class names. Nothing here reads the server, so the list works
 * with no signal and comes back after a reload or a new passcode.
 */
import { useEffect, useState } from 'react';
import { UNSENT_WORK_REFRESH_EVENTS } from '@/hooks/useUnsentWork';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import {
  readDeviceUnsentWork,
  type UnsentScore,
  type UnsentWork,
} from '@/services/replication/unsentWork';
import { toUnsentScoreRow, type UnsentScoreRow } from './unsentScoreDetails';

export interface ScoresNotSentRow extends UnsentScoreRow {
  /**
   * False when the score was saved under an earlier sign-in on this device: the queue lets
   * only the session that saved a refused score retry or remove it.
   */
  canAct: boolean;
}

export interface ScoresNotSentState {
  rows: ScoresNotSentRow[];
  /** True until the first read finishes, so an empty list is never shown before it is known. */
  loading: boolean;
  /** The first read of this device failed: nothing is known, which is not "nothing waiting". */
  readFailed: boolean;
}

async function readMyFailedIds(): Promise<ReadonlySet<string>> {
  try {
    return new Set((await mutationManager.getFailedMutations()).map(m => m.id));
  } catch {
    return new Set();
  }
}

export async function buildScoresNotSentRows(
  showId: string,
  work: UnsentWork
): Promise<ScoresNotSentRow[]> {
  if (work.scores.length === 0) return [];
  const entries = await replicatedEntriesTable.getEntriesByShow(showId).catch(() => []);
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  const scores: UnsentScore[] = work.scores.filter(
    score => score.showId === showId || entryById.has(score.entryId)
  );
  if (scores.length === 0) return [];
  const classIds = new Set(scores.flatMap(s => entryById.get(s.entryId)?.classId ?? []));
  const classNames = new Map<string, string>();
  await Promise.all(
    [...classIds].map(async classId => {
      const cls = await replicatedClassesTable.getClassById(classId).catch(() => null);
      if (cls?.name) classNames.set(classId, cls.name);
    })
  );
  const mine = await readMyFailedIds();
  return scores.map(score => {
    const entry = entryById.get(score.entryId);
    const row = toUnsentScoreRow(
      score,
      entry,
      entry?.classId ? (classNames.get(entry.classId) ?? null) : null
    );
    return { ...row, canAct: row.failedMutationIds.every(id => mine.has(id)) };
  });
}

export function useScoresNotSent(showId: string | undefined): ScoresNotSentState {
  const [state, setState] = useState<ScoresNotSentState & { key: string | undefined }>({
    rows: [],
    loading: true,
    readFailed: false,
    key: undefined,
  });

  useEffect(() => {
    if (!showId) return;
    let cancelled = false;
    const refresh = () => {
      readDeviceUnsentWork()
        .then(work => buildScoresNotSentRows(showId, work))
        .then(rows => {
          if (!cancelled) setState({ rows, loading: false, readFailed: false, key: showId });
        })
        .catch(() => {
          // Keep the last rows; a failed read is never shown as "nothing waiting".
          if (cancelled) return;
          setState(prev =>
            prev.key === showId ? prev : { rows: [], loading: false, readFailed: true, key: showId }
          );
        });
    };
    refresh();
    for (const eventName of UNSENT_WORK_REFRESH_EVENTS) window.addEventListener(eventName, refresh);
    const interval = setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      for (const eventName of UNSENT_WORK_REFRESH_EVENTS) {
        window.removeEventListener(eventName, refresh);
      }
      clearInterval(interval);
    };
  }, [showId]);

  if (!showId) return { rows: [], loading: false, readFailed: false };
  return state.key === showId ? state : { rows: [], loading: true, readFailed: false };
}

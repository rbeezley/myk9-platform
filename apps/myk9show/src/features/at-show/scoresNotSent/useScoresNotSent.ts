/**
 * The rows of the Scores not sent list for one show (MYK9-2011). Every source is on this
 * device: the score units from `readDeviceUnsentWork` (queue, dead letters and the entry's
 * replica row) and the replicated classes for the class names. Nothing here reads the server,
 * so the list works with no signal and comes back after a reload or a new passcode.
 *
 * A failed device read is an unknown state, shown as such with Try again; it is never turned
 * into an empty list, which would claim every score is sent.
 */
import { useCallback, useEffect, useState } from 'react';
import { UNSENT_WORK_REFRESH_EVENTS } from '@/hooks/useUnsentWork';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { readDeviceUnsentWork, type UnsentWork } from '@/services/replication/unsentWork';
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
  /** The last read of this device failed: nothing is known, which is not "nothing waiting". */
  readFailed: boolean;
  /** Read the device again. */
  retry: () => void;
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
  // A score with no show stamp and no replica row still sits on this phone: list it here too.
  const scores = work.scores.filter(s => s.showId === showId || s.showId === undefined);
  if (scores.length === 0) return [];
  const classIds = new Set(scores.flatMap(s => s.entry?.classId ?? []));
  const classNames = new Map<string, string>();
  await Promise.all(
    [...classIds].map(async classId => {
      // A class name is a label only; without it the row still names the dog and the score.
      const cls = await replicatedClassesTable.getClassById(classId).catch(() => null);
      if (cls?.name) classNames.set(classId, cls.name);
    })
  );
  const mine = await readMyFailedIds();
  return scores.map(score => {
    const classId = score.entry?.classId;
    const row = toUnsentScoreRow(score, classId ? (classNames.get(classId) ?? null) : null);
    const ids = [...row.retryIds, ...row.removeIds];
    return { ...row, canAct: ids.length > 0 && ids.every(id => mine.has(id)) };
  });
}

interface ReadState {
  rows: ScoresNotSentRow[];
  loading: boolean;
  readFailed: boolean;
  key: string | undefined;
}

export function useScoresNotSent(showId: string | undefined): ScoresNotSentState {
  const [state, setState] = useState<ReadState>({
    rows: [],
    loading: true,
    readFailed: false,
    key: undefined,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

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
          // Unknown, not empty: rows already shown stay, and the page says the read failed.
          if (!cancelled) {
            setState(prev => ({
              rows: prev.key === showId ? prev.rows : [],
              loading: false,
              readFailed: true,
              key: showId,
            }));
          }
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
  }, [showId, attempt]);

  if (!showId) return { rows: [], loading: false, readFailed: false, retry };
  if (state.key !== showId) return { rows: [], loading: true, readFailed: false, retry };
  return { rows: state.rows, loading: state.loading, readFailed: state.readFailed, retry };
}

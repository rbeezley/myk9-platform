/**
 * Whether the CLASS row itself still holds a change this device has not settled with the server
 * (MYK9-1113). "Scores match the paper" saves its check on the server, but this device only learns
 * `results_verified_at` from a later `classes` sync, and the replica refuses to overwrite a dirty
 * row with the server's copy. So while the class row is dirty, queued, failed, or in conflict the
 * saved check cannot show here, and the screen would look as if the click did nothing.
 *
 * Same signal as `useClassUnsyncedScores` (`hasUnsyncedLocalWork`, re-read on the table's own
 * change notice), on the classes table, plus a short re-check while waiting (see below). A persisted conflict snapshot is told apart
 * so the message can point at the "changed elsewhere" choice.
 *
 * `null` until the first read for THIS class and when the queue cannot be read: unknown is not
 * "settled". `classRowSyncBlockedReason(null)` keeps Verify disabled with quiet "Checking this
 * class…" copy, and a failed read re-checks on the same timer as a waiting class (never a dead end).
 */
import { useEffect, useState } from 'react';

/** How often a class waiting to sync is re-read; see the effect below. */
const WAITING_RECHECK_MS = 1_500;

import { replicatedClassesTable } from '@/services/replication';

/** `'unreadable'`: the queue read has failed repeatedly; it is still re-checked on a timer. */
export type ClassRowSyncState = 'settled' | 'waiting' | 'conflict' | 'unreadable';

/** Consecutive failed reads of one class before the copy stops saying "Checking" and says why. */
const UNREADABLE_AFTER_FAILURES = 3;

export async function readClassRowSyncState(
  classId: string
): Promise<Exclude<ClassRowSyncState, 'unreadable'>> {
  const row = await replicatedClassesTable.getReplicatedRow(classId);
  if (row?.conflict) return 'conflict';
  return (await replicatedClassesTable.hasUnsyncedLocalWork(classId)) ? 'waiting' : 'settled';
}

export function useClassRowSyncState(classId: string | null): ClassRowSyncState | null {
  // `value` null means the last read threw; `failures` counts consecutive throws for this class
  // and a successful read resets it.
  const [state, setState] = useState<{
    classId: string;
    value: Exclude<ClassRowSyncState, 'unreadable'> | null;
    failures: number;
  } | null>(null);
  const [notices, setNotices] = useState(0);

  useEffect(
    () =>
      replicatedClassesTable.subscribe(() => setNotices(count => count + 1), {
        emitCurrent: false,
      }),
    []
  );

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    void (async () => {
      try {
        const value = await readClassRowSyncState(classId);
        if (!cancelled) setState({ classId, value, failures: 0 });
      } catch {
        if (!cancelled) {
          setState(prev => ({
            classId,
            value: null,
            failures: prev?.classId === classId ? prev.failures + 1 : 1,
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, notices]);

  // Keyed by class id so a read for the previous class can never stand in for this one.
  const current = classId && state?.classId === classId ? state : null;
  const failed = (current?.failures ?? 0) > 0;
  const value: ClassRowSyncState | null =
    current && current.failures >= UNREADABLE_AFTER_FAILURES
      ? 'unreadable'
      : (current?.value ?? null);

  // Some transitions empty this class's queue without a classes-table notice: Take theirs
  // discards the queued write after its replace has notified, and an upload ack marks the row
  // synced with a raw write. Event-driven alone, Verify could stay on "waiting" for a change
  // that will never sync, so re-read on a short timer while, and only while, the class waits.
  // A failed read re-checks the same way, so an unreadable queue is retried, not left stuck.
  useEffect(() => {
    if (value !== 'waiting' && !failed) return;
    const timer = setTimeout(() => setNotices(count => count + 1), WAITING_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [value, failed, notices]);

  return value;
}

/** What to tell the secretary when the saved check cannot show yet, or null when it can. */
export function classRowSyncBlockedReason(state: ClassRowSyncState | null): string | null {
  // Unknown is pending, not settled: the first read has not landed (or the queue was unreadable).
  if (state === null) return 'Checking this class…';
  if (state === 'unreadable') {
    return "Can't read this device's saved changes. Reload the page; if it keeps happening, the check can be saved from another device.";
  }
  if (state === 'conflict') {
    // The notice can be closed, and a reload raises it again, so say so: never a dead end.
    return 'This class was changed elsewhere. Choose Keep mine or Take theirs on the notice to settle it, then the check can show. If you closed the notice, reload the page to bring it back.';
  }
  if (state === 'waiting') {
    return "Waiting for this class's changes to sync before the check can show";
  }
  return null;
}

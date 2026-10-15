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
 * class…" copy, and an unknown class re-checks on the same timer as a waiting class (never a dead end), and after
 * UNREADABLE_AFTER_MS without a successful read (rejected or hung) the copy says why.
 */
import { useEffect, useRef, useState } from 'react';

/** How often a class waiting to sync is re-read; see the effect below. */
const WAITING_RECHECK_MS = 1_500;

import { replicatedClassesTable } from '@/services/replication';

/** `'unreadable'`: no read has succeeded for a while (failed or hung); it is still re-checked on a timer. */
export type ClassRowSyncState = 'settled' | 'waiting' | 'conflict' | 'unreadable';

/**
 * How long a class may go without a successful read before the copy stops saying "Checking" and
 * says why. Time, not failure count: a read that never settles (IndexedDB blocked by a stalled
 * upgrade or another tab) never rejects, so a count would never reach it (MYK9-1190).
 */
const UNREADABLE_AFTER_MS = 5_000;

export async function readClassRowSyncState(
  classId: string
): Promise<Exclude<ClassRowSyncState, 'unreadable'>> {
  const row = await replicatedClassesTable.getReplicatedRow(classId);
  if (row?.conflict) return 'conflict';
  return (await replicatedClassesTable.hasUnsyncedLocalWork(classId)) ? 'waiting' : 'settled';
}

export function useClassRowSyncState(classId: string | null): ClassRowSyncState | null {
  // `value` null means the last read threw; it is set only by a read that settled.
  const [state, setState] = useState<{
    classId: string;
    value: Exclude<ClassRowSyncState, 'unreadable'> | null;
  } | null>(null);
  const [notices, setNotices] = useState(0);
  // The class whose reads have gone UNREADABLE_AFTER_MS without succeeding. Reset on class change.
  const [stalledId, setStalledId] = useState<string | null>(null);
  const [prevClassId, setPrevClassId] = useState(classId);
  if (prevClassId !== classId) {
    setPrevClassId(classId);
    setStalledId(null);
  }
  // Reads are keyed by class, not by effect run, so a re-run never discards a pending read for
  // the same class, and a read for a previous class never applies.
  const classIdRef = useRef(classId);
  const inFlightRef = useRef<string | null>(null);
  const rerunRef = useRef(false);
  // A read can settle after this unmounts (navigation, test teardown): never set state then (MYK9-1203).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    classIdRef.current = classId;
  }, [classId]);

  useEffect(
    () =>
      replicatedClassesTable.subscribe(
        () => {
          // A change notice while a read hangs must not be lost: re-read once that read ends.
          if (inFlightRef.current) rerunRef.current = true;
          setNotices(count => count + 1);
        },
        { emitCurrent: false }
      ),
    []
  );

  useEffect(() => {
    // One read at a time per class: a hung read must not pile up behind the re-check timer.
    if (!classId || inFlightRef.current === classId) return;
    inFlightRef.current = classId;
    void (async () => {
      try {
        const value = await readClassRowSyncState(classId);
        if (mountedRef.current && classIdRef.current === classId) {
          setState({ classId, value });
          setStalledId(null);
        }
      } catch {
        if (mountedRef.current && classIdRef.current === classId) {
          setState({ classId, value: null });
        }
      } finally {
        if (inFlightRef.current === classId) inFlightRef.current = null;
        if (mountedRef.current && rerunRef.current && classIdRef.current === classId) {
          rerunRef.current = false;
          setNotices(count => count + 1);
        }
      }
    })();
  }, [classId, notices]);

  // Keyed by class id so a read for the previous class can never stand in for this one.
  const current = classId && state?.classId === classId ? state : null;
  const known = current?.value ?? null;

  // Escalate by elapsed time while the class has no successful read, whether reads reject or hang.
  useEffect(() => {
    if (!classId || known !== null) return;
    const timer = setTimeout(() => setStalledId(classId), UNREADABLE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [classId, known]);

  const value: ClassRowSyncState | null =
    known === null && classId && stalledId === classId ? 'unreadable' : known;

  // Some transitions empty this class's queue without a classes-table notice: Take theirs
  // discards the queued write after its replace has notified, and an upload ack marks the row
  // synced with a raw write. Event-driven alone, Verify could stay on "waiting" for a change
  // that will never sync, so re-read on a short timer while, and only while, the class waits.
  // An unknown class re-checks the same way, so an unreadable queue is retried, not left stuck.
  const recheck = !!classId && (known === null || known === 'waiting');
  useEffect(() => {
    if (!recheck) return;
    const timer = setTimeout(() => setNotices(count => count + 1), WAITING_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [recheck, notices]);

  return value;
}

/** What to tell the secretary when the saved check cannot show yet, or null when it can. */
export function classRowSyncBlockedReason(state: ClassRowSyncState | null): string | null {
  // Unknown is pending, not settled: the first read has not landed (or the queue was unreadable).
  if (state === null) return 'Checking this class…';
  if (state === 'unreadable') {
    return 'Still checking this class. If this message stays, reload the page.';
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

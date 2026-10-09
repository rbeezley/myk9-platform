/**
 * Whether a class still has a score change this device has not got to the server (MYK9-1031).
 *
 * Release on the Results tab asks the server whether the class is checked. While an entry of the
 * class holds a local write the server has not seen, that answer would describe results this
 * device has already moved past, so Release waits. Read per row (`hasUnsyncedLocalWork`: the row
 * is dirty, or a pending or failed mutation points at it), not from the data-level `_syncStatus`
 * hint, which older builds left stuck. Re-read on the replica's own change notice, so an upload
 * ack (which flips only the row's dirty flag) re-enables Release; never polled.
 *
 * `null` until the first read and when the queue cannot be read: unknown is not "nothing waiting".
 */
import { useEffect, useState } from 'react';

import { replicatedEntriesTable } from '@/services/replication';

/** The check itself, for callers that must not trust a hook value that may be a render behind. */
export async function classHasUnsyncedScores(classId: string): Promise<boolean> {
  const entries = await replicatedEntriesTable.getEntriesByClass(classId);
  const flags = await Promise.all(
    entries.map(entry => replicatedEntriesTable.hasUnsyncedLocalWork(entry.id))
  );
  return flags.some(Boolean);
}

export function useClassUnsyncedScores(classId: string | null): boolean | null {
  const [state, setState] = useState<{ classId: string; unsynced: boolean } | null>(null);
  const [notices, setNotices] = useState(0);

  useEffect(
    () =>
      replicatedEntriesTable.subscribe(() => setNotices(count => count + 1), {
        emitCurrent: false,
      }),
    []
  );

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    void (async () => {
      try {
        const unsynced = await classHasUnsyncedScores(classId);
        if (!cancelled) setState({ classId, unsynced });
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, notices]);

  return classId && state?.classId === classId ? state.unsynced : null;
}

/**
 * The classes with a score change this device has not got to the server yet (MYK9-1031).
 *
 * The paper check is a claim about the results the SERVER holds, saved online only. While an
 * entry of a class still has a local change waiting to sync, the server's stamp (if any) may
 * describe results this device has already corrected, and a new check could not be saved (its
 * fingerprint would not match). So Release on the Results tab waits for these to clear.
 *
 * Re-read from the replica on its own change notice (the same one the score freshness uses),
 * never polled. The projected entries array is structurally shared, so an upload ack that flips
 * only `_syncStatus` leaves it unchanged: the replica notice is the signal that advances on acks.
 * `null` until the first read: unknown is not "nothing waiting".
 */
import { useEffect, useState } from 'react';

import { replicatedEntriesTable } from '@/services/replication';

export function useUnsyncedScoreClasses(
  showId: string,
  entriesVersion: unknown
): ReadonlySet<string> | null {
  const [notices, setNotices] = useState(0);
  const [state, setState] = useState<{
    showId: string;
    version: unknown;
    classIds: ReadonlySet<string>;
  } | null>(null);

  useEffect(() => {
    if (!showId) return;
    return replicatedEntriesTable.subscribe(() => setNotices(count => count + 1), {
      emitCurrent: false,
    });
  }, [showId]);

  useEffect(() => {
    if (!showId) return;
    let cancelled = false;
    void replicatedEntriesTable
      .getEntriesByShow(showId)
      .then(entries => {
        if (cancelled) return;
        const classIds = new Set<string>();
        for (const entry of entries) {
          if (entry.classId && entry._syncStatus !== undefined && entry._syncStatus !== 'synced') {
            classIds.add(entry.classId);
          }
        }
        setState({ showId, version: entriesVersion, classIds });
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showId, entriesVersion, notices]);

  // A notice only triggers a re-read; the last answer stands meanwhile. That is safe: a notice
  // that is an ack can only move a class toward synced, and one that is a new local change
  // also moves `entriesVersion`, which makes the last answer stale at once.
  return state && state.showId === showId && state.version === entriesVersion
    ? state.classIds
    : null;
}

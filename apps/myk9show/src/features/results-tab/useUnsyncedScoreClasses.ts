/**
 * The classes with a score change this device has not got to the server yet (MYK9-1031).
 *
 * The paper check is a claim about the results the SERVER holds, saved online only. While an
 * entry of a class still has a local change waiting to sync, the server's stamp (if any) may
 * describe results this device has already corrected, and a new check could not be saved (its
 * fingerprint would not match). So Release on the Results tab waits for these to clear.
 *
 * Read from the replica on the existing entries-change signal (`entriesVersion` moves whenever the
 * scores do), never polled. `null` until the first read: unknown is not "nothing waiting".
 */
import { useEffect, useState } from 'react';

import { replicatedEntriesTable } from '@/services/replication';

export function useUnsyncedScoreClasses(
  showId: string,
  entriesVersion: unknown
): ReadonlySet<string> | null {
  const [state, setState] = useState<{
    showId: string;
    version: unknown;
    classIds: ReadonlySet<string>;
  } | null>(null);

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
  }, [showId, entriesVersion]);

  return state && state.showId === showId && state.version === entriesVersion
    ? state.classIds
    : null;
}

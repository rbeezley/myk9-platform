/**
 * A class's replicated entry rows, re-read whenever the entry replica changes, so
 * ringside surfaces that summarise a class (statistics) work offline and follow a
 * score saved on this or another device. `rows` is null until the first read. A
 * failed read is reported as `failed` (never as an empty class) and `retry` reads
 * again; rows already read for this class stay on screen through a later failure.
 */
import { useCallback, useEffect, useState } from 'react';
import { replicatedEntriesTable } from '@/services/replication';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

interface LiveClassEntries {
  rows: ReplicatedEntry[] | null;
  failed: boolean;
  retry: () => void;
}

export function useLiveClassEntries(classId: string, enabled = true): LiveClassEntries {
  // Keyed by the class read: a reused hook must not answer with the previous class.
  const [snapshot, setSnapshot] = useState<{ key: string; rows: ReplicatedEntry[] | null } | null>(
    null
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !classId) return;
    let cancelled = false;
    // Reads can resolve out of order: only the newest one may update the snapshot.
    let latest = 0;
    const read = () => {
      const mine = ++latest;
      replicatedEntriesTable
        .getEntriesByClass(classId)
        .then(rows => {
          if (cancelled || mine !== latest) return;
          setSnapshot({ key: classId, rows });
          setFailedKey(null);
        })
        .catch(() => {
          if (!cancelled && mine === latest) setFailedKey(classId);
        });
    };
    const unsubscribe = replicatedEntriesTable.subscribe(read);
    read();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [classId, enabled, attempt]);

  const retry = useCallback(() => {
    setFailedKey(null);
    setAttempt(n => n + 1);
  }, []);

  const rows = snapshot?.key === classId ? snapshot.rows : null;
  return { rows, failed: failedKey === classId && rows === null, retry };
}

/**
 * The replicated rows for these classes, re-read whenever the class replica
 * changes (a save on this device, or one synced from another). Ringside surfaces
 * that act on a class's max time or rule must not hold the copy they read when
 * they opened (MYK9-1099, MYK9-1100). Null until the first read; a failed read
 * reads as no classes (unknown), so nothing waits on it forever.
 */
import { useEffect, useState } from 'react';
import { replicatedClassesTable } from '@/services/replication';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

/** `refreshKey` re-runs the read when bumped (a Retry after a read that came back empty). */
export function useLiveClasses(
  classIds: string[],
  enabled = true,
  refreshKey = 0
): ReplicatedClass[] | null {
  const idsKey = classIds.join(',');
  // Keyed by the ids read: a list reused for another class (no remount) must not
  // answer with the previous class while the new read runs.
  const [snapshot, setSnapshot] = useState<{ key: string; rows: ReplicatedClass[] } | null>(null);

  useEffect(() => {
    if (!enabled || !idsKey) return;
    let cancelled = false;
    const read = () => {
      Promise.all(idsKey.split(',').map(id => replicatedClassesTable.getClassById(id)))
        .then(rows => {
          if (!cancelled) {
            setSnapshot({ key: idsKey, rows: rows.filter((row): row is ReplicatedClass => !!row) });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSnapshot(current => (current?.key === idsKey ? current : { key: idsKey, rows: [] }));
          }
        });
    };
    const unsubscribe = replicatedClassesTable.subscribe(read);
    read();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [idsKey, enabled, refreshKey]);

  return snapshot?.key === idsKey ? snapshot.rows : null;
}

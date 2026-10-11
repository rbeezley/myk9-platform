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

export function useLiveClasses(classIds: string[], enabled = true): ReplicatedClass[] | null {
  const idsKey = classIds.join(',');
  const [classes, setClasses] = useState<ReplicatedClass[] | null>(null);

  useEffect(() => {
    if (!enabled || !idsKey) return;
    let cancelled = false;
    const read = () => {
      Promise.all(idsKey.split(',').map(id => replicatedClassesTable.getClassById(id)))
        .then(rows => {
          if (!cancelled) setClasses(rows.filter((row): row is ReplicatedClass => !!row));
        })
        .catch(() => {
          if (!cancelled) setClasses(current => current ?? []);
        });
    };
    const unsubscribe = replicatedClassesTable.subscribe(read);
    read();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [idsKey, enabled]);

  return classes;
}

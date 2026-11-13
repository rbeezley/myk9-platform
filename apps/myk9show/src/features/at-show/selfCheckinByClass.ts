/**
 * Per-class self check-in, read live from the replicated class rows (MYK9-1807). The server's
 * `self_checkin_entry` judges each entry by its OWN class, so a combined A and B list cannot use
 * section A's answer for section B's dogs. Same source and shape as `useIsClassCancelledFor`.
 */
import { useCallback, useEffect, useState } from 'react';
import { replicatedClassesTable } from '@/services/replication';

/** Class ids whose self check-in is off; every other class (and an unknown one) reads as on. */
export function useSelfCheckinFor(
  classIds: Array<string | undefined>
): (classId: string) => boolean {
  const idsKey = classIds.filter(Boolean).join(',');
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!idsKey) return;
    const wanted = new Set(idsKey.split(','));
    return replicatedClassesTable.subscribe(rows => {
      const next = new Set(
        rows.filter(row => wanted.has(row.id) && row.selfCheckinEnabled === false).map(r => r.id)
      );
      setOff(prev =>
        prev.size === next.size && [...next].every(id => prev.has(id)) ? prev : next
      );
    });
  }, [idsKey]);

  return useCallback((classId: string) => !off.has(classId), [off]);
}

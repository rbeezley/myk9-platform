/**
 * MYK9-1847: ringside offers no scoring, check-in or in-ring change for a cancelled class.
 * "Cancelled" is read from the replicated class rows on every change (the same source and
 * predicate as the class list), so cancelling or un-cancelling a class while a screen is open
 * takes effect without a reload.
 */
import { useCallback, useEffect, useState } from 'react';
import { replicatedClassesTable } from '@/services/replication';
import { isCancelledClassStatus } from './ringsideClassStatusMap';

/** Shown instead of the scoring, check-in and in-ring controls while a class is cancelled. */
export const CANCELLED_CLASS_MESSAGE =
  'This class is cancelled. Scoring and check-in are off until the secretary changes its status.';

/**
 * The ids among `classIds` whose stored status is cancelled, live. Subscribes to the class
 * replica rather than re-reading by id, so it never competes with a screen's own class load.
 * Empty until the first emission, which reads as "not cancelled".
 */
function useCancelledIds(classIds: Array<string | undefined>): ReadonlySet<string> {
  const idsKey = classIds.filter(Boolean).join(',');
  const [cancelled, setCancelled] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!idsKey) return;
    const wanted = new Set(idsKey.split(','));
    return replicatedClassesTable.subscribe(rows => {
      const next = new Set(
        rows
          .filter(row => wanted.has(row.id) && isCancelledClassStatus(row.classStatus))
          .map(r => r.id)
      );
      setCancelled(prev =>
        prev.size === next.size && [...next].every(id => prev.has(id)) ? prev : next
      );
    });
  }, [idsKey]);

  return cancelled;
}

/** True when this one class is cancelled. */
export function useIsClassCancelled(classId: string | undefined): boolean {
  return useCancelledIds([classId]).has(classId ?? '');
}

/**
 * Per-class decision for a list that can span two sections (combined A/B): each entry is
 * judged by its own class, never by section A's status.
 */
export function useIsClassCancelledFor(
  classIds: Array<string | undefined>
): (classId: string) => boolean {
  const cancelled = useCancelledIds(classIds);
  return useCallback((classId: string) => cancelled.has(classId), [cancelled]);
}

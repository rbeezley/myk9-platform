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
 * `known` is false until the replica has answered for these ids: an empty set before that means
 * "not heard yet", not "not cancelled", so a tap must not act on it (see `useClassCancelledStatus`).
 */
function useCancelledIds(classIds: Array<string | undefined>): {
  cancelled: ReadonlySet<string>;
  known: boolean;
} {
  const idsKey = classIds.filter(Boolean).join(',');
  // Keyed by the ids read, so a list reused for another class does not answer with the old one.
  const [answer, setAnswer] = useState<{ key: string; ids: ReadonlySet<string> } | null>(null);

  useEffect(() => {
    if (!idsKey) return;
    const wanted = new Set(idsKey.split(','));
    return replicatedClassesTable.subscribe(rows => {
      const next = new Set(
        rows
          .filter(row => wanted.has(row.id) && isCancelledClassStatus(row.classStatus))
          .map(r => r.id)
      );
      setAnswer(prev =>
        prev?.key === idsKey &&
        prev.ids.size === next.size &&
        [...next].every(id => prev.ids.has(id))
          ? prev
          : { key: idsKey, ids: next }
      );
    });
  }, [idsKey]);

  // No class to ask about is a complete answer.
  const known = !idsKey || answer?.key === idsKey;
  return { cancelled: answer?.key === idsKey ? answer.ids : EMPTY_IDS, known };
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/** True when this one class is cancelled. */
export function useIsClassCancelled(classId: string | undefined): boolean {
  return useCancelledIds([classId]).cancelled.has(classId ?? '');
}

/**
 * Per-class decision for a list that can span two sections (combined A/B): each entry is
 * judged by its own class, never by section A's status. `known` is false until the class replica
 * has answered; a dog tap waits for it rather than open the scoresheet of a class that may be
 * cancelled (MYK9-1911).
 */
export function useClassCancelledStatus(classIds: Array<string | undefined>): {
  isClassCancelled: (classId: string) => boolean;
  known: boolean;
} {
  const { cancelled, known } = useCancelledIds(classIds);
  const isClassCancelled = useCallback((classId: string) => cancelled.has(classId), [cancelled]);
  return { isClassCancelled, known };
}

export function useIsClassCancelledFor(
  classIds: Array<string | undefined>
): (classId: string) => boolean {
  return useClassCancelledStatus(classIds).isClassCancelled;
}

/**
 * Holds a dog tap (returns true, "do not open the scoresheet") until the class replica has
 * answered, then defers to `gate`. A tap that lands first would otherwise open the scoresheet
 * of a class that turns out to be cancelled (MYK9-1911). Same shape as the other tap gates.
 */
export function useHoldTapUntilKnown(known: boolean, gate: () => boolean): () => boolean {
  return useCallback(() => !known || gate(), [known, gate]);
}

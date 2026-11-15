/**
 * When the entry list offers "Mark class complete" (MYK9-2013).
 *
 * A class completes by itself only on the server: `refresh_class_scoring_state()` sets
 * `is_scoring_finalized` once every accounted-for dog's score has arrived, so with no signal, or
 * when the class was left with a manual status, it stays open after its last dog. The offer is
 * the same write as Class Options, Status, Completed (`updateClassStatus(id, 'completed')`), one
 * tap from the list instead of four, and it rides the class replica, so it queues offline.
 */
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { isCancelledClassStatus } from './ringsideClassStatusMap';

export type ClassCompletionFields = Pick<ReplicatedClass, 'classStatus' | 'isScoringFinalized'>;

export function isClassCompleted(cls: ClassCompletionFields): boolean {
  return cls.isScoringFinalized === true || cls.classStatus?.toLowerCase() === 'completed';
}

/**
 * Offer the button when every dog in the list has a result (the host's own pending/accounted
 * pair, the same one the tabs show) and some class in it is still open. Null classes are not
 * known yet: no offer until the replica answers. A cancelled class is never completed here.
 */
export function shouldOfferMarkComplete({
  canManage,
  statusCounts,
  classes,
}: {
  canManage: boolean;
  statusCounts: { pending: number; completed: number } | undefined;
  classes: readonly (ClassCompletionFields | null)[];
}): boolean {
  if (!canManage || !statusCounts) return false;
  if (statusCounts.pending > 0 || statusCounts.completed === 0) return false;
  if (classes.length === 0 || classes.some(cls => cls === null)) return false;
  const known = classes as readonly ClassCompletionFields[];
  if (known.some(cls => isCancelledClassStatus(cls.classStatus))) return false;
  return known.some(cls => !isClassCompleted(cls));
}

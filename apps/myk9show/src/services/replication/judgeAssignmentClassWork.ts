/**
 * What `judge_assignments` writes are still undelivered, in the terms the class judge overlay
 * needs (MYK9-1327).
 *
 * A class-level assignment write names its class in the queued payload (`class_id`, and on a
 * DELETE the row itself is already gone locally), so the queue alone says which classes have
 * unsent judge work, across a reload.
 */
import type { PendingMutation } from '@myk9/replication';

export interface UnsentClassJudgeWork {
  /** Assignment rows with an undelivered INSERT or UPDATE. */
  unsentRowIds: Set<string>;
  /** Assignment rows with an undelivered DELETE: gone locally, still on the server. */
  deletedRowIds: Set<string>;
  /** Every class with any undelivered class-level assignment write (a delete counts). */
  classIds: Set<string>;
}

const classIdOf = (mutation: PendingMutation): string | null => {
  const classId = mutation.data?.class_id;
  return typeof classId === 'string' && classId.length > 0 ? classId : null;
};

/** Sort the queue's undelivered (pending or failed) mutations into the overlay's inputs. */
export function summarizeUnsentClassWork(
  mutations: readonly PendingMutation[]
): UnsentClassJudgeWork {
  const work: UnsentClassJudgeWork = {
    unsentRowIds: new Set(),
    deletedRowIds: new Set(),
    classIds: new Set(),
  };
  for (const mutation of mutations) {
    const classId = classIdOf(mutation);
    if (!classId) continue; // a show-level assignment touches no class
    work.classIds.add(classId);
    if (mutation.operation === 'DELETE') work.deletedRowIds.add(String(mutation.rowId));
    else work.unsentRowIds.add(String(mutation.rowId));
  }
  return work;
}

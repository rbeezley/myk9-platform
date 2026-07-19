import { CLASS_STATUS, type ClassStatusValue } from '@myk9/core';

import { replicatedClassesTable } from '@/services/replication';

export type ManualClassStatus = ClassStatusValue;

/**
 * Applies a manually-chosen class status through the replicated write path.
 *
 * status_source: 'manual' rides the SAME replicated payload so the server
 * derivation won't overwrite this secretary decision on later recompute.
 *
 * This is the single canonical mutation for manual class status changes —
 * row actions, bulk actions, and Show Map all delegate here so every path
 * queues offline and carries the same `statusSource: 'manual'` marker.
 */
export async function applyManualClassStatus(
  classId: string,
  targetStatus: ManualClassStatus
): Promise<void> {
  switch (targetStatus) {
    case CLASS_STATUS.IN_PROGRESS:
      // Starting a class must NOT clear a reopen stamp — only a manual
      // completion does (see the Completed case below).
      await replicatedClassesTable.updateClass(classId, {
        classStatus: targetStatus,
        statusSource: 'manual',
        actual_start_time: new Date().toISOString(),
      });
      return;

    case CLASS_STATUS.COMPLETED:
      // reopenedAfterCloseoutAt: null clears any server reopen stamp — a manual
      // completion is the secretary resolving that reopen, so the attention
      // reason must go with it.
      await replicatedClassesTable.updateClass(classId, {
        classStatus: targetStatus,
        statusSource: 'manual',
        reopenedAfterCloseoutAt: null,
        actual_end_time: new Date().toISOString(),
      });
      return;

    case CLASS_STATUS.SCHEDULED:
    case CLASS_STATUS.UPCOMING:
      // Resetting to not-started must not leave stale timing that downstream
      // readiness UIs read as "ran".
      await replicatedClassesTable.updateClass(classId, {
        classStatus: targetStatus,
        statusSource: 'manual',
        actual_start_time: undefined,
        actual_end_time: undefined,
      });
      return;

    case CLASS_STATUS.CANCELLED:
      // Cancellation preserves timing history.
      await replicatedClassesTable.updateClass(classId, {
        classStatus: targetStatus,
        statusSource: 'manual',
      });
      return;

    default:
      await replicatedClassesTable.updateClass(classId, {
        classStatus: targetStatus,
        statusSource: 'manual',
      });
  }
}

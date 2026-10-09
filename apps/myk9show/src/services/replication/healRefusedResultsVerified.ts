/**
 * MYK9-1031: take a refused "scores match the paper" off the local class row.
 *
 * `setResultsVerified` stamps the replica at once and queues `mark_class_results_verified`. When
 * the server permanently refuses that call (MK015: the results moved since the check, 55000: the
 * class is not complete, P0002: the class is gone) the queue parks it in the failed-mutations
 * store and nothing else touches the row: an unchanged server row is never re-fetched, so the
 * replica would keep saying "checked" for a class the server says is not. Called with every
 * failed mutation the sync-failed event reports.
 *
 * Only a stamp that is still the one the failed call sent is removed, so a newer check made
 * since is left alone. The row keeps whatever dirty flag it had: other queued writes still own it.
 */
import type { PendingMutation } from '@myk9/replication';
import { logger } from '@myk9/core';

import { refusedResultsVerifiedMark } from './classResultsVerified';
import { replicatedClassesTable } from './ReplicatedClassesTable';

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

export async function healRefusedResultsVerified(
  mutations: readonly Pick<PendingMutation, 'rpc'>[]
): Promise<number> {
  let healed = 0;
  for (const mutation of mutations) {
    const refused = refusedResultsVerifiedMark(mutation);
    if (!refused) continue;
    try {
      const row = await replicatedClassesTable.get(refused.classId);
      if (!row?.resultsVerifiedAt) continue;
      if (refused.at && !sameInstant(refused.at, row.resultsVerifiedAt)) continue;
      const stored = await replicatedClassesTable.getReplicatedRow(refused.classId);
      await replicatedClassesTable.set(
        refused.classId,
        {
          ...row,
          resultsVerifiedAt: null,
          resultsVerifiedBy: null,
          resultsVerifiedFingerprint: null,
        },
        stored?.isDirty ?? false
      );
      healed++;
    } catch (error) {
      logger.warn('Could not clear a refused results check from the local class', {
        classId: refused.classId,
        error,
      });
    }
  }
  return healed;
}

/**
 * MYK9-1030: record and clear "results checked against the paper score sheets" for a class.
 *
 * Offline-first like the judge's sign-off (`judgeSignOffMutations.ts`): each class is written to
 * the local replica at once and queued as its own RPC-routed mutation
 * (`ReplicatedClassesTable.setResultsVerified` → `set_class_results_verified`), which the server
 * authorizes (show managers only) and refuses for a class that is not complete.
 *
 * No UI yet: the Results tab rebuild (MYK9-1031) adds the per-row ticks and gates its own Release
 * button on this. Nothing server-side (release, automatic release presets) is gated on it.
 */
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { replicatedClassesTable } from '@/services/replication';

export interface ResultsVerifiedOutcome {
  /** Classes whose write was applied locally and queued. */
  saved: string[];
  /** Classes that could not be written; the rest stay written. */
  failed: string[];
}

export async function markResultsVerified(input: {
  classIds: readonly string[];
  /** Auth uid of the secretary recording it (the server stamps its own from the JWT). */
  verifiedBy: string | null;
  at?: string;
}): Promise<ResultsVerifiedOutcome> {
  const at = input.at ?? new Date().toISOString();
  const outcome = await dispatchBulk([...new Set(input.classIds)], async classId => {
    await replicatedClassesTable.setResultsVerified(classId, { at, by: input.verifiedBy });
  });
  return { saved: outcome.succeeded, failed: outcome.failed.map(failure => failure.item) };
}

/** A correction after checking means a re-check: clearing is always allowed. */
export async function clearResultsVerified(
  classIds: readonly string[]
): Promise<ResultsVerifiedOutcome> {
  const outcome = await dispatchBulk([...new Set(classIds)], async classId => {
    await replicatedClassesTable.setResultsVerified(classId, null);
  });
  return { saved: outcome.succeeded, failed: outcome.failed.map(failure => failure.item) };
}

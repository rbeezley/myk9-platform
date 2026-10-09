/**
 * MYK9-1030: record and undo the judge's end-of-day sign-off.
 *
 * Offline-first, the way Release and Mark Complete are: every class is written to the local
 * replica at once and queued as its own replicated mutation (an RPC-routed UPDATE,
 * `ReplicatedClassesTable.setJudgeSignOff`), so a secretary with no signal records the judge's
 * whole day and it syncs, in queue order, when the device reconnects. The server authorizes each
 * one (`mark_classes_judge_signed_off` / `clear_class_judge_sign_off`, show managers only).
 *
 * No React here, so the Show Map executor today and the Results tab (MYK9-1031) share it.
 */
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { replicatedClassesTable } from '@/services/replication';

export interface JudgeSignOffOutcome {
  /** Classes whose write was applied locally and queued. */
  recorded: string[];
  /** Classes that could not be recorded; the rest stay recorded. */
  failed: string[];
}

export async function recordJudgeDaySignOff(input: {
  classIds: readonly string[];
  /** Auth uid of the secretary recording it (the server stamps its own from the JWT). */
  recordedBy: string | null;
  at?: string;
}): Promise<JudgeSignOffOutcome> {
  const at = input.at ?? new Date().toISOString();
  const classIds = [...new Set(input.classIds)];
  // Bounded: one queued write per class, never an unbounded burst (see dispatchBulk).
  const outcome = await dispatchBulk(classIds, async classId => {
    await replicatedClassesTable.setJudgeSignOff(classId, { at, by: input.recordedBy });
  });
  return { recorded: outcome.succeeded, failed: outcome.failed.map(failure => failure.item) };
}

/** Undo: one class (the per-class undo) or the classes a record just wrote (its toast's Undo). */
export async function clearJudgeSignOffs(
  classIds: readonly string[]
): Promise<JudgeSignOffOutcome> {
  const outcome = await dispatchBulk([...new Set(classIds)], async classId => {
    await replicatedClassesTable.setJudgeSignOff(classId, null);
  });
  return { recorded: outcome.succeeded, failed: outcome.failed.map(failure => failure.item) };
}

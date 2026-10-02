/**
 * "Is anything on this device still saving?" One question, no per-kind scope
 * walk. A delete cascades to children, and a child created here (or with a
 * queued score, or an INSERT that failed and sits in the failed queue) is work
 * the server can neither count nor restore. Walking each kind's descendants
 * missed those twice, so the rule is device-wide instead: delete is unavailable
 * while ANY mutation is pending or failed. Both counts are owner-independent: on a shared device another account's failed uploads still block. Reads only; never touches the queue. A queue that
 * cannot be read throws: an unreadable queue is never a pass.
 */
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { SHOW_STILL_SAVING } from '@/services/database/shows/deleteOutcome';

export interface UnsavedWork {
  /** Changes on this device that have not uploaded (pending + failed). */
  total: number;
  /** Of those, uploads that failed and need Retry or Discard (the sync error notice). */
  failed: number;
}

export const NO_UNSAVED_WORK: UnsavedWork = { total: 0, failed: 0 };

export async function deviceHasUnsavedWork(): Promise<UnsavedWork> {
  const [pending, failed] = await Promise.all([
    mutationManager.getPendingCount(),
    mutationManager.getDeviceFailedCount(),
  ]);
  // Counted from the queue alone. A `_localOnly` replica row is unsaved work only
  // while its INSERT is pending or failed, and then it is already counted here; a
  // row with nothing queued is an orphan (its failed INSERT was discarded) that
  // will never upload, so counting it would block every delete forever.
  return { total: pending + failed, failed };
}

/** The error a still-saving delete is refused with; `classifyDeleteError` reads its code. */
export function stillSavingError(): { code: string; message: string } {
  return { code: SHOW_STILL_SAVING, message: 'Still saving' };
}

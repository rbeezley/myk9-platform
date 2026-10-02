/**
 * "Is anything on this device still saving?" One question, no per-kind scope
 * walk. A delete cascades to children, and a child created here (or with a
 * queued score, or an INSERT that failed and sits in the failed queue) is work
 * the server can neither count nor restore. Walking each kind's descendants
 * missed those twice, so the rule is device-wide instead: delete is unavailable
 * while ANY mutation is pending or failed, or any row the delete could touch
 * exists only on this device. Reads only; never touches the queue. A queue that
 * cannot be read throws: an unreadable queue is never a pass.
 */
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClubsTable } from '@/services/replication/ReplicatedClubsTable';
import { SHOW_STILL_SAVING } from '@/services/database/shows/deleteOutcome';

export interface UnsavedWork {
  /** Changes on this device that have not uploaded (pending + failed, or local-only rows if more). */
  total: number;
  /** Of those, uploads that failed and need Retry or Discard (the sync error notice). */
  failed: number;
}

export const NO_UNSAVED_WORK: UnsavedWork = { total: 0, failed: 0 };

/** The replicas a delete can touch (everything `deleteLocalState` purges). */
const DELETE_REPLICAS = [
  replicatedShowsTable,
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedDogsTable,
  replicatedClubsTable,
] as const;

async function countLocalOnlyRows(): Promise<number> {
  const tables = await Promise.all(
    DELETE_REPLICAS.map(async table => (await table.getAllOrThrow()) as { _localOnly?: boolean }[])
  );
  return tables.reduce((sum, rows) => sum + rows.filter(row => row._localOnly === true).length, 0);
}

export async function deviceHasUnsavedWork(): Promise<UnsavedWork> {
  const [pending, failed, localOnly] = await Promise.all([
    mutationManager.getPendingCount(),
    mutationManager.getFailedMutations(),
    countLocalOnlyRows(),
  ]);
  // A local-only row normally has its INSERT pending or failed; do not count it twice.
  const total = Math.max(pending + failed.length, localOnly);
  return { total, failed: failed.length };
}

/** The error a still-saving delete is refused with; `classifyDeleteError` reads its code. */
export function stillSavingError(): { code: string; message: string } {
  return { code: SHOW_STILL_SAVING, message: 'Still saving' };
}

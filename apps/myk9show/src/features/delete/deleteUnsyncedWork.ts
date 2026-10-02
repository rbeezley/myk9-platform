/**
 * "Is this item still saving?" for every kind that has a replica. A row created
 * here, or with any mutation still queued, may not be on the server yet (or may
 * be committed with its response lost), so the server cannot tell "not found"
 * from "not uploaded yet": a delete (or an "already deleted" purge) then would
 * drop work the queue is about to upload. Reads only; never touches the queue.
 * A queue that cannot be read throws: an unreadable queue is never a pass.
 */
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { SHOW_STILL_SAVING } from '@/services/database/shows/deleteOutcome';
import type { DeleteObjectKind } from './deleteTypes';

/** The replicated table each kind queues its mutations under. A person has none. */
const MUTATION_TABLE: Record<DeleteObjectKind, string | undefined> = {
  show: 'shows',
  trial: 'trials',
  class: 'classes',
  entry: 'entries',
  dog: 'dogs',
  club: 'clubs',
  person: undefined,
};

export async function hasUnsyncedWork(kind: DeleteObjectKind, id: string): Promise<boolean> {
  // The show also counts a row created here that has not uploaded (`_localOnly`).
  if (kind === 'show') return replicatedShowsTable.hasUnsyncedWork(id);
  const table = MUTATION_TABLE[kind];
  if (!table) return false;
  return (await mutationManager.getPendingMutationsForRow(table, id)).length > 0;
}

/** The error a still-saving item is refused with; `classifyDeleteError` reads its code. */
export function stillSavingError(): { code: string; message: string } {
  return { code: SHOW_STILL_SAVING, message: 'Still saving' };
}

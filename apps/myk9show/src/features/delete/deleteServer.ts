/**
 * The server half of the one delete path: exactly one soft-delete RPC and one
 * restore RPC per object (migration 20261001214300). Nothing here writes
 * `deleted_at` directly (the direct-write trigger refuses it) and nothing issues
 * a hard DELETE: permanent purge is a site-admin action on Admin → Deleted Items.
 *
 * Each call resolves on success and THROWS the server's error otherwise, so the
 * caller maps it once (`deleteErrors.ts`).
 */
import { deleteShowRecord } from '@/services/showDeletion';
import { restoreShow } from '@/services/database/shows/writes';
import { deleteTrial, restoreTrial } from '@/services/database/trials/reads';
import { deleteClass, restoreClass } from '@/services/database/classes/reads';
import { deleteEntry } from '@/services/database/entries/writes';
import { supabase } from '@/services/database/supabaseClient';
import { deleteDog, forceDeleteDog, restoreDog } from '@/services/database/dogs/reads';
import { deleteUser, restoreUser } from '@/services/database/users/reads';
import { deleteClub, restoreClub } from '@/services/database/clubs/reads';
import type { DeleteObjectKind } from './deleteTypes';

interface ServiceResult {
  error?: unknown;
}

function unwrap(result: ServiceResult): void {
  if (result.error) throw result.error;
}

export interface ServerDeleteOptions {
  /**
   * Site-admin override of the paid/scored guard (show, trial, class, entry:
   * `p_override`; dog: `force_delete_dog`). The server refuses it for anyone
   * else, so the dialog offers it only to a site admin.
   */
  override?: boolean;
}

/** 'already-deleted': the row was gone before this call (another device, a retry). */
export type ServerDeleteOutcome = 'deleted' | 'already-deleted';

export async function softDeleteOnServer(
  kind: DeleteObjectKind,
  id: string,
  options: ServerDeleteOptions = {}
): Promise<ServerDeleteOutcome | void> {
  const override = options.override === true;
  switch (kind) {
    case 'show': {
      // deleteShow reports "Show not found" as a success flagged alreadyDeleted.
      const result = await deleteShowRecord(id, undefined, { override });
      unwrap(result);
      return 'alreadyDeleted' in result && result.alreadyDeleted ? 'already-deleted' : 'deleted';
    }
    case 'trial':
      return unwrap(await deleteTrial(id, undefined, { override }));
    case 'class':
      return unwrap(await deleteClass(id, undefined, { override }));
    case 'entry':
      // Also discards queued edits and evicts the row from the entries replica
      // with the version guard (acknowledgeServerDeletion).
      return unwrap(await deleteEntry(id, undefined, { override }));
    case 'dog':
      return unwrap(override ? await forceDeleteDog(id) : await deleteDog(id));
    case 'person':
      return unwrap(await deleteUser(id));
    case 'club':
      return unwrap(await deleteClub(id));
  }
}

/** Undo: the deleter within 10 minutes, or a site admin. The server decides. */
export async function restoreOnServer(kind: DeleteObjectKind, id: string): Promise<void> {
  switch (kind) {
    case 'show':
      return unwrap(await restoreShow(id));
    case 'trial':
      return unwrap(await restoreTrial(id));
    case 'class':
      return unwrap(await restoreClass(id));
    case 'entry':
      // The RPC alone: `restoreEntry` (admin Deleted Items) reads the row back
      // afterwards, and a failed read-back must not report a done Undo as failed.
      return unwrap(await supabase.rpc('restore_entry', { p_entry_id: id }));
    case 'dog':
      return unwrap(await restoreDog(id));
    case 'person':
      return unwrap(await restoreUser(id));
    case 'club':
      return unwrap(await restoreClub(id));
  }
}

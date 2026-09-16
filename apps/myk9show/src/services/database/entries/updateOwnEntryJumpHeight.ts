/**
 * MYK9-561: the jump-height save for the Edit Entry dialog.
 *
 * Lives in its own module (like `withdrawOwnEntry.ts`) so `writes.ts` does not
 * grow past the 500-line limit carrying it.
 *
 * ONE path for BOTH tiers. `EntryEditDialog` is rendered by the exhibitor's
 * `MyEntriesDialogs` AND the secretary's `EntryManagementPage`, so this does not
 * branch on role: the RPC restates `entries_update` for show managers and adds
 * the owner tier, exactly as `update_entry_handler_for_entry_management` does
 * for the handler field saved by the same handler.
 */
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { createDatabaseError, logQuery } from '../supabaseClient';

export const updateOwnEntryJumpHeight = async (entryId: string, jumpHeight: string) => {
  const startTime = Date.now();

  try {
    await replicatedEntriesTable.updateOwnEntryJumpHeight(entryId, jumpHeight);
    logQuery('entries', 'update_own_entry_jump_height', Date.now() - startTime);
    return { data: { id: entryId }, error: null };
  } catch (error) {
    const dbError = createDatabaseError(error, 'entries', 'update_own_entry_jump_height');
    logQuery('entries', 'update_own_entry_jump_height', Date.now() - startTime, dbError.message);
    return { data: null, error: dbError };
  }
};

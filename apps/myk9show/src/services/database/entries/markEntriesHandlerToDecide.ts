/**
 * MYK9-2031: flags entries whose exhibitor chose "I'll decide at the show" for the handler,
 * so the secretary sees them on the Finish list before the marked catalog is made.
 *
 * Online-only RPC, called after `submit_show_entries` (the money path is untouched). The
 * server only marks entries the caller owns or manages. Change handler clears the flag.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

export const markEntriesHandlerToDecide = async (entryIds: readonly string[]): Promise<void> => {
  if (entryIds.length === 0) return;
  const startTime = Date.now();
  const { error } = await supabase.rpc(
    'mark_entries_handler_to_decide' as never,
    { p_entry_ids: [...entryIds] } as never
  );
  logQuery('entries', 'mark_handler_to_decide', Date.now() - startTime, error?.message);
  if (error) throw createDatabaseError(error, 'entries', 'mark_handler_to_decide');
};

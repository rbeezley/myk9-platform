/** The online call to `ringside_complete_stale_class` (MYK9-1514); a thrown error means nothing changed. */
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import { syncAtShowData } from '../atShowDataAdapter';
import type { CompleteStaleClassReply, StaleClassRefusal } from './confirmStaleClass';

const COMPLETE_STALE_CLASS_RPC = 'ringside_complete_stale_class';

export async function completeStaleClassRpc(
  showId: string,
  classId: string,
  expectedEntryIds: string[]
): Promise<CompleteStaleClassReply> {
  const { data, error } = await supabase.rpc(COMPLETE_STALE_CLASS_RPC, {
    p_class_id: classId,
    p_expected_entry_ids: expectedEntryIds,
  });
  if (error) throw error;
  const reply = (data ?? {}) as {
    ok?: boolean;
    marked_count?: number;
    current_entry_ids?: string[];
    reason?: StaleClassRefusal;
  };
  if (reply.ok === true) {
    // Pull the show so this device's replica shows the absent dogs and the completed class
    // now; the stale class is not the one the live listener watches. Best effort: the write
    // already succeeded.
    void syncAtShowData(showId).catch(err =>
      logger.warn('Stale-class refresh after completion failed', 'at-show', {}, err as Error)
    );
    return { ok: true, markedCount: reply.marked_count ?? 0 };
  }
  return {
    ok: false,
    currentEntryIds: reply.current_entry_ids ?? [],
    reason: reply.reason ?? 'changed',
  };
}

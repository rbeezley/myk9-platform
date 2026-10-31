/** The online call to `ringside_complete_stale_class` (MYK9-1514); a thrown error means nothing changed. */
import { supabase } from '@/services/database/supabaseClient';
import { COMPLETE_STALE_CLASS_RPC } from '@/services/replication/ReplicatedClassesTable';
import type { CompleteStaleClassReply } from './confirmStaleClass';

export async function completeStaleClassRpc(
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
  };
  if (reply.ok === true) return { ok: true, markedCount: reply.marked_count ?? 0 };
  return { ok: false, currentEntryIds: reply.current_entry_ids ?? [] };
}

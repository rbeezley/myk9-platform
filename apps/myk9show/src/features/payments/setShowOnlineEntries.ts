/**
 * MYK9-979: the "Accept online entries" switch's only write path.
 *
 * An online-only server action (Codex round 4 on #2707): the RPC
 * set_show_online_entries changes shows.online_entries_enabled and nothing
 * else, so no queued or rebuilt full-row show write can carry the switch, and
 * the switch can never carry another column. The publish gate still runs
 * server-side; its MK003 refusal comes back as the thrown error.
 *
 * It does NOT touch the local replica (Codex round 5): the RPC bumps the row's
 * updated_at and version, and the incremental show sync pulls it through its
 * own conflict-safe merge. useOnlineEntriesSwitch shows the confirmed value
 * until then and asks for that sync.
 */
import { supabase } from '@/services/database/supabaseClient';

/** @returns the show row's new version, which the caller's replica must reach
 * before its own value replaces the confirmed one. */
export async function setShowOnlineEntries(showId: string, enabled: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('set_show_online_entries', {
    p_show_id: showId,
    p_enabled: enabled,
  });
  if (error) throw error;
  return data;
}

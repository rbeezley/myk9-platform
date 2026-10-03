/**
 * MYK9-979: the "Accept online entries" switch's only write path.
 *
 * An online-only server action (Codex round 4 on #2707): the RPC
 * set_show_online_entries changes shows.online_entries_enabled and nothing
 * else, so no queued or rebuilt full-row show write can carry the switch, and
 * the switch can never carry another column. The publish gate still runs
 * server-side; its MK003 refusal comes back as the thrown error.
 *
 * On success the show row is re-read and written into the local replica, so
 * every replica-backed surface (the edit panel's switch included) sees the new
 * value at once. A row with unconfirmed local work is left to the next sync,
 * which merges the server value in without touching the queued edit.
 */
import { supabase } from '@/services/database/supabaseClient';
import { replicatedShowsTable, rowToShow } from '@/services/replication/ReplicatedShowsTable';

export async function setShowOnlineEntries(showId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_show_online_entries', {
    p_show_id: showId,
    p_enabled: enabled,
  });
  if (error) throw error;
  await refreshShowReplica(showId);
}

async function refreshShowReplica(showId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('shows')
      .select('*')
      .eq('id', showId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return;
    if (await replicatedShowsTable.hasUnsyncedLocalWork(showId)) return;
    await replicatedShowsTable.replaceFromRemote(showId, rowToShow(data), data.version);
  } catch {
    // The write already succeeded; the next show sync brings the value.
  }
}

// MYK9-572: the one write path for clubs.authorized_at/_by. Site-admin only —
// the RPC restates is_site_admin() itself (does not rely on clubs_update RLS)
// and writes a permission_audit_log row for both directions.
import { supabase } from '../supabaseClient';

export async function setClubAuthorization(clubId: string, authorized: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_club_authorization', {
    p_club_id: clubId,
    p_authorized: authorized,
  });

  if (error) throw error;
}

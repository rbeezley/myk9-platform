// MYK9-572: the one write path for clubs.authorized_at/_by. Site-admin only —
// the RPC restates is_site_admin() itself (does not rely on clubs_update RLS)
// and writes a permission_audit_log row for both directions.
import { supabase } from '../supabaseClient';

export const PENDING_CLUB_AUTHORIZATIONS_QUERY_KEY = [
  'admin',
  'pending-club-authorizations',
] as const;

export async function setClubAuthorization(clubId: string, authorized: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_club_authorization', {
    p_club_id: clubId,
    p_authorized: authorized,
  });

  if (error) throw error;
}

export interface PendingClubAuthorization {
  id: string;
  name: string;
  website: string | null;
  city: string | null;
  state: string | null;
  createdAt: string | null;
}

/** Online-only site-admin work queue. RLS decides which rows the caller may see. */
export async function getPendingClubAuthorizations(): Promise<PendingClubAuthorization[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('id, name, website, city, state, created_at')
    .is('authorized_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    website: row.website,
    city: row.city,
    state: row.state,
    createdAt: row.created_at,
  }));
}

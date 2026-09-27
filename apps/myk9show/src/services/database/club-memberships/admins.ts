// Read-only lookup: who holds the club-scoped `club_admin` RBAC role for a Club.
//
// MYK9-860: there is no SECURITY DEFINER RPC for this (unlike secretaries —
// see get_club_show_managers in show-managers.ts). `user_roles` SELECT is
// scoped to `auth_user_id = self OR is_site_admin()` (SA-006,
// 20260703180000_restrict_rbac_role_map_select.sql), so this direct read
// silently returns only the rows RLS allows: every admin for a site admin,
// or just the caller's own row if they themselves are one of this club's
// admins. Everyone else — guests, ordinary members, even this club's own
// secretary — gets an empty array, never an error. Do NOT widen this by
// adding a caller-check RPC here; that is a migration decision for the
// product owner (see the MYK9-860 PR).

import { supabase } from '../supabaseClient';

export interface ClubAdminEntry {
  personId: string;
  personName: string | null;
}

interface DbClubAdminRow {
  user_id: string;
  people: { first_name: string | null; last_name: string | null } | null;
}

export async function getClubAdmins(clubId: string): Promise<ClubAdminEntry[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select(
      'user_id, roles!inner(name), people!user_roles_user_id_fkey!inner(first_name, last_name)'
    )
    .eq('club_id', clubId)
    .is('show_id', null)
    .eq('is_active', true)
    .eq('roles.name', 'club_admin')
    .is('people.deleted_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (error) throw error;

  return ((data ?? []) as unknown as DbClubAdminRow[]).map(row => ({
    personId: row.user_id,
    personName: [row.people?.first_name, row.people?.last_name].filter(Boolean).join(' ') || null,
  }));
}

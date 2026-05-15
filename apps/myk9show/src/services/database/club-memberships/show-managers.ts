// RBAC lookup: who has the SECRETARY role scoped to a Club.
// Distinct from club_members / club_officers — this reads `user_roles` and
// answers "who can manage shows for this club?" rather than "who's enrolled?".

import { supabase } from '../supabaseClient';

/**
 * Get person IDs that have the SECRETARY RBAC role scoped to this club.
 * These people can create and manage shows for the club.
 */
export async function getClubShowManagerIds(clubId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, roles!inner(name)')
    .eq('roles.name', 'secretary')
    .eq('is_active', true)
    .eq('club_id', clubId);

  if (error) throw error;
  return new Set((data ?? []).map(row => row.user_id));
}

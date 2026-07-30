// RBAC lookup: who has the SECRETARY role scoped to a Club.
// Distinct from club_members / club_officers — this reads `user_roles` and
// answers "who can manage shows for this club?" rather than "who's enrolled?".

import { supabase } from '../supabaseClient';

/**
 * Get person IDs that have the SECRETARY RBAC role scoped to this club.
 * These people can create and manage shows for the club.
 */
export async function getClubShowManagerIds(clubId: string): Promise<Set<string>> {
  // SA-006: user_roles is no longer directly SELECT-able cross-user, so this
  // reads through the get_club_show_manager_ids SECURITY DEFINER RPC
  // (migration 20260703180000).
  const { data, error } = await supabase.rpc('get_club_show_manager_ids', {
    p_club_id: clubId,
  });

  if (error) throw error;
  return new Set(((data as Array<{ user_id: string }> | null) ?? []).map(row => row.user_id));
}

interface SetClubShowManagerAccessRequest {
  clubId: string;
  personId: string;
  grant: boolean;
}

/**
 * Grant or revoke the club-scoped SECRETARY role used for show management.
 *
 * Direct user_roles writes are site-admin-only. These SECURITY DEFINER RPCs
 * authorize the current club admin, enforce club scope, and write the audit log.
 */
export async function setClubShowManagerAccess({
  clubId,
  personId,
  grant,
}: SetClubShowManagerAccessRequest): Promise<void> {
  const functionName = grant ? 'grant_club_secretary' : 'revoke_club_secretary';
  const { error } = await supabase.rpc(functionName, {
    p_club_id: clubId,
    p_person_id: personId,
  });

  if (error) throw error;
}

// RBAC lookup and writes for the CLUB_ADMIN role scoped to one club (MYK9-2209).
// user_roles is not writable or cross-user readable from the client, so every call here is a
// SECURITY DEFINER RPC that restates the caller check (site admin or an admin of this club).
// Online-only by design: role changes need a recent password confirmation.

import { supabase } from '../supabaseClient';

export interface ClubAdmin {
  personId: string;
  personName: string | null;
  personEmail: string | null;
}

export async function getClubAdmins(clubId: string): Promise<ClubAdmin[]> {
  const { data, error } = await supabase.rpc('get_club_admins', { p_club_id: clubId });
  if (error) throw error;

  return (data ?? []).map(row => ({
    personId: row.person_id,
    personName: row.person_name,
    personEmail: row.person_email,
  }));
}

/** `no_account`: nobody with that email has signed in to myK9, so nothing was granted. */
export type AddClubAdminOutcome = 'added' | 'no_account';

/**
 * Makes the existing account with this email an admin of the club. An address with no account
 * grants nothing (inviting a new person is a separate change, MYK9-2211).
 */
export async function addClubAdminByEmail(
  clubId: string,
  email: string
): Promise<AddClubAdminOutcome> {
  const { data, error } = await supabase.rpc('add_club_admin_by_email', {
    p_club_id: clubId,
    p_email: email,
  });
  if (error) throw error;

  return data?.[0]?.outcome === 'added' ? 'added' : 'no_account';
}

export async function removeClubAdmin(clubId: string, personId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_club_admin', {
    p_club_id: clubId,
    p_person_id: personId,
  });
  if (error) throw error;
}

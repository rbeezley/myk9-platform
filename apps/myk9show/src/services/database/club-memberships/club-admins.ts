// RBAC lookup and writes for the CLUB_ADMIN role scoped to one club (MYK9-2209).
// user_roles is not writable or cross-user readable from the client, so every call here is a
// SECURITY DEFINER RPC that restates the caller check (site admin or an admin of this club).
// Online-only by design: role changes need a recent password confirmation.

import { supabase } from '../supabaseClient';
import { invokeAdminInvite } from '@/components/users/UserDetails/useSendUserInvitation';

export interface ClubAdmin {
  personId: string;
  personName: string | null;
  personEmail: string | null;
  /** False for someone who was added by email and has not signed up yet. */
  hasAccount: boolean;
}

export async function getClubAdmins(clubId: string): Promise<ClubAdmin[]> {
  const { data, error } = await supabase.rpc('get_club_admins', { p_club_id: clubId });
  if (error) throw error;

  return (data ?? []).map(row => ({
    personId: row.person_id,
    personName: row.person_name,
    personEmail: row.person_email,
    hasAccount: row.has_account,
  }));
}

export interface AddClubAdminResult {
  personId: string;
  hasAccount: boolean;
  /** True when a sign-up invitation went out (the address had no account yet). */
  invited: boolean;
  /** Set when the role was granted but the invitation email could not be sent. */
  inviteError?: Error;
}

/**
 * Makes the person with this email an admin of the club. An existing account has the role at
 * once; an unknown address gets the role waiting on an unclaimed person row and an invitation
 * (admin-invite-user, which accepts a club admin only for their own club and this person).
 */
export async function addClubAdminByEmail(
  clubId: string,
  email: string
): Promise<AddClubAdminResult> {
  const { data, error } = await supabase.rpc('add_club_admin_by_email', {
    p_club_id: clubId,
    p_email: email,
  });
  if (error) throw error;

  const row = data?.[0];
  if (!row) throw new Error('add_club_admin_by_email returned no person');
  const personId = row.person_id;
  const hasAccount = row.has_account;
  if (hasAccount) return { personId, hasAccount, invited: false };

  try {
    await invokeAdminInvite({
      personId,
      email,
      roleNames: ['club_admin'],
      clubId,
    });
    return { personId, hasAccount, invited: true };
  } catch (inviteError) {
    // The role is already granted; only the email failed. The caller says so.
    return {
      personId,
      hasAccount,
      invited: false,
      inviteError: inviteError instanceof Error ? inviteError : new Error(String(inviteError)),
    };
  }
}

export async function removeClubAdmin(clubId: string, personId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_club_admin', {
    p_club_id: clubId,
    p_person_id: personId,
  });
  if (error) throw error;
}

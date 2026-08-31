// RBAC lookup: who has the SECRETARY role scoped to a Club.
// Distinct from club_members / club_officers — this reads `user_roles` and
// answers "who can manage shows for this club?" rather than "who's enrolled?".

import { supabase } from '../supabaseClient';

export interface ClubShowManager {
  personId: string;
  personName: string | null;
  personEmail: string | null;
  /**
   * False for a professional secretary the club appointed without enrolling them.
   * The roster cannot show these people at all — they have no club_members row —
   * so this is the flag that keeps an appointment visible and revocable.
   */
  isClubMember: boolean;
  membershipStatus: string | null;
}

/**
 * Everyone appointed to run this club's shows, member or not.
 *
 * Replaces the earlier id-only lookup. Ids were enough while every appointee was
 * necessarily a club member, because the UI only ever needed to annotate a roster row
 * that already existed. Appointment no longer implies membership, so the answer to
 * "who can run our shows?" is a list in its own right rather than a filter over the
 * roster.
 *
 * SA-006: user_roles is not directly SELECT-able cross-user, so this reads through the
 * get_club_show_managers SECURITY DEFINER RPC, which restates the caller check
 * internally (site admin, an admin of this club, or one of its secretaries).
 */
export async function getClubShowManagers(clubId: string): Promise<ClubShowManager[]> {
  const { data, error } = await supabase.rpc('get_club_show_managers', {
    p_club_id: clubId,
  });

  if (error) throw error;

  return (data ?? []).map(row => ({
    personId: row.person_id,
    personName: row.person_name,
    personEmail: row.person_email,
    isClubMember: row.is_club_member,
    membershipStatus: row.membership_status,
  }));
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

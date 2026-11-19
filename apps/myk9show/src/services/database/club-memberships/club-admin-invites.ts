// Invitations for an email with no myK9 account to become a club admin (MYK9-2211).
// An invite is not a role: it grants nothing until the invitee confirms that email on a new account.
// All calls are online-only SECURITY DEFINER RPCs; the email is sent by an edge function that
// re-checks the caller server-side.

import { supabase } from '../supabaseClient';

export interface ClubAdminInvite {
  inviteId: string;
  email: string;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  lastSentAt: string | null;
}

/**
 * `invited`: a new invite exists. `already_invited`: one is already pending for that address.
 * `has_account`: the address already has an account, so use the add-admin flow instead.
 */
export type InviteClubAdminOutcome = 'invited' | 'already_invited' | 'has_account';

export interface InviteClubAdminResult {
  outcome: InviteClubAdminOutcome;
  inviteId: string | null;
}

export async function getClubAdminInvites(clubId: string): Promise<ClubAdminInvite[]> {
  const { data, error } = await supabase.rpc('list_club_admin_invites', { p_club_id: clubId });
  if (error) throw error;

  return (data ?? []).map(row => ({
    inviteId: row.invite_id,
    email: row.invite_email,
    invitedByName: row.invited_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSentAt: row.last_sent_at,
  }));
}

export async function inviteClubAdmin(
  clubId: string,
  email: string
): Promise<InviteClubAdminResult> {
  const { data, error } = await supabase.rpc('invite_club_admin', {
    p_club_id: clubId,
    p_email: email,
  });
  if (error) throw error;

  const row = data?.[0];
  const outcome = row?.outcome;
  if (outcome !== 'invited' && outcome !== 'already_invited' && outcome !== 'has_account') {
    throw new Error('Unexpected invite_club_admin result');
  }
  return { outcome, inviteId: row?.invite_id ?? null };
}

/** Sends (or resends) the invitation email. The server authorizes and throttles each send. */
export async function sendClubAdminInviteEmail(inviteId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('send-club-admin-invite-email', {
    body: { inviteId },
  });
  if (error) throw error;
}

export async function cancelClubAdminInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_club_admin_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

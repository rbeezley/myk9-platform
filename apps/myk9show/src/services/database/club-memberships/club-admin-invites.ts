// Invitations for an email with no myK9 account to become a club admin (MYK9-2211).
// An invite is not a role: it grants nothing until the invitee, signed in with that email, accepts it with the emailed one-time link.
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
  /** Past its expiry: shown as expired and can only be cancelled and re-invited. */
  isExpired: boolean;
}

/** Why a send was refused: the edge function's HTTP status and the RPC's reason code. */
export class ClubAdminInviteSendError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly reason: string | undefined
  ) {
    super(message);
    this.name = 'ClubAdminInviteSendError';
  }
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
    isExpired: row.is_expired,
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
  if (!error) return;
  // On a non-2xx the edge body ({ error, code }) rides in FunctionsHttpError.context.
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string; code?: string };
      throw new ClubAdminInviteSendError(
        body?.error ?? 'Invite not sent',
        context.status,
        body?.code
      );
    } catch (parseError) {
      if (parseError instanceof ClubAdminInviteSendError) throw parseError;
    }
  }
  throw error;
}

/**
 * `cancelled` (or `already_cancelled`): the invite can no longer be accepted. `already_accepted`:
 * the invitee got there first, so they are an admin now and Remove is the way to end their access.
 */
export type CancelClubAdminInviteOutcome = 'cancelled' | 'already_cancelled' | 'already_accepted';

export async function cancelClubAdminInvite(
  inviteId: string
): Promise<CancelClubAdminInviteOutcome> {
  const { data, error } = await supabase.rpc('cancel_club_admin_invite', { p_invite_id: inviteId });
  if (error) throw error;
  if (data !== 'cancelled' && data !== 'already_cancelled' && data !== 'already_accepted') {
    throw new Error('Unexpected cancel_club_admin_invite result');
  }
  return data;
}

/** `invalid` covers an unknown, cancelled, already used or deleted-club invite, deliberately. */
export type AcceptClubAdminInviteOutcome =
  'accepted' | 'already_accepted' | 'expired' | 'wrong_account' | 'invalid';

export interface AcceptClubAdminInviteResult {
  outcome: AcceptClubAdminInviteOutcome;
  clubId: string | null;
  clubName: string | null;
}

/** The signed-in invitee presents the emailed one-time token. Online-only. */
export async function acceptClubAdminInvite(token: string): Promise<AcceptClubAdminInviteResult> {
  const { data, error } = await supabase.rpc('accept_club_admin_invite', { p_token: token });
  if (error) throw error;

  const row = data?.[0];
  const outcome = row?.outcome;
  if (
    outcome !== 'accepted' &&
    outcome !== 'already_accepted' &&
    outcome !== 'expired' &&
    outcome !== 'wrong_account' &&
    outcome !== 'invalid'
  ) {
    throw new Error('Unexpected accept_club_admin_invite result');
  }
  return { outcome, clubId: row?.club_id ?? null, clubName: row?.club_name ?? null };
}

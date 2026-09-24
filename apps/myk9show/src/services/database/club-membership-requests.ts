/**
 * Club membership requests (MYK9-685) — an exhibitor asks an existing club to
 * add them to its roster as an ordinary member.
 *
 * A request is an ask; it never grants anything. Only the club admin's
 * approval (approve_club_membership_request) writes the club_members row, and
 * membership itself grants no secretary/show-management permission — that is
 * a separate request and a separate appointment. Every write goes through a
 * SECURITY DEFINER RPC; the table has no client write grants.
 */
import { supabase } from './supabaseClient';
import { RoleRequestAlreadyPendingError, RoleRequestStandingDenialError } from './role-requests';

/** submit_club_membership_request's SQLSTATE for "already an active member". */
const ALREADY_MEMBER_ERROR_CODE = 'MK685';
/** Shared with the secretary ask: the latest request here was denied. */
const STANDING_DENIAL_ERROR_CODE = 'MK571';

export class AlreadyClubMemberError extends Error {
  constructor() {
    super('You are already a member of this club.');
    this.name = 'AlreadyClubMemberError';
  }
}

/**
 * The caller's one membership state at a club, computed by the server
 * (get_my_club_membership_request_status): an active roster row, a
 * suspended one, a pending or denied ask, or nothing blocking a new ask.
 */
export type ClubMembershipState = 'member' | 'suspended' | 'pending' | 'denied' | 'none';

export interface ClubMembershipRequestStatus {
  state: ClubMembershipState;
  /** Set only for 'denied'. */
  reviewerNote: string | null;
}

export interface ClubMembershipRequest {
  id: string;
  clubId: string;
  personId: string;
  requesterName: string;
  requesterEmail: string | null;
  requesterNote: string | null;
  createdAt: string;
}

/**
 * Returns the new request id. A NULL from the server means the one-pending
 * unique index absorbed a duplicate, surfaced as
 * RoleRequestAlreadyPendingError so callers show "under review".
 */
export async function submitClubMembershipRequest(input: {
  clubId: string;
  note: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_club_membership_request', {
    p_club_id: input.clubId,
    p_requester_note: input.note.trim() || null,
  });

  if (error) {
    if (error.code === ALREADY_MEMBER_ERROR_CODE) throw new AlreadyClubMemberError();
    if (error.code === STANDING_DENIAL_ERROR_CODE) {
      throw new RoleRequestStandingDenialError(error.message);
    }
    throw error;
  }
  if (!data) throw new RoleRequestAlreadyPendingError();
  return data;
}

export async function getMyClubMembershipRequestStatus(
  clubId: string
): Promise<ClubMembershipRequestStatus> {
  const { data, error } = await supabase.rpc('get_my_club_membership_request_status', {
    p_club_id: clubId,
  });

  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new Error('get_my_club_membership_request_status returned no row');
  return { state: row.state, reviewerNote: row.reviewer_note };
}

export async function listClubMembershipRequests(clubId: string): Promise<ClubMembershipRequest[]> {
  const { data, error } = await supabase.rpc('list_club_membership_requests', {
    p_club_id: clubId,
  });

  if (error) throw error;
  return (data ?? [])
    .filter(row => row.status === 'pending')
    .map(row => ({
      id: row.id,
      clubId: row.club_id,
      personId: row.person_id,
      requesterName: row.requester_name,
      requesterEmail: row.requester_email,
      requesterNote: row.requester_note,
      createdAt: row.created_at,
    }));
}

export async function approveClubMembershipRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_club_membership_request', {
    p_request_id: requestId,
  });
  if (error) throw error;
}

export async function denyClubMembershipRequest(
  requestId: string,
  note?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('deny_club_membership_request', {
    p_request_id: requestId,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
}

import { supabase } from '../supabaseClient';
import type { Database } from '@/types/supabase';
import {
  mapDbRoleRequest,
  RoleRequestAlreadyPendingError,
  RoleRequestStandingDenialError,
  type ApproveRoleRequestInput,
  type ClubSecretaryRequestStatus,
  type DbRoleRequestRow,
  type RoleRequest,
  type RoleRequestStatus,
} from './types';

export type {
  ApproveRoleRequestInput,
  ClubSecretaryRequestStatus,
  DbRoleRequestRow,
  RequestedRole,
  RequestedScope,
  RoleRequest,
  RoleRequestStatus,
} from './types';
export {
  mapDbRoleRequest,
  RoleRequestAlreadyPendingError,
  RoleRequestStandingDenialError,
} from './types';

/** The SQLSTATE submit_role_request raises for a standing-denial resubmission. */
const STANDING_DENIAL_ERROR_CODE = 'MK571';

const ROLE_REQUEST_SELECT = `
  *,
  person:people!role_requests_person_id_fkey(first_name,last_name,email),
  reviewer:people!role_requests_reviewed_by_fkey(first_name,last_name,email),
  club:clubs(name)
`;

export async function getAllRoleRequests(): Promise<RoleRequest[]> {
  const { data, error } = await supabase
    .from('role_requests')
    .select(ROLE_REQUEST_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as DbRoleRequestRow[]).map(mapDbRoleRequest);
}

export async function approveRoleRequest(
  requestId: string,
  input: ApproveRoleRequestInput
): Promise<void> {
  const args: Database['public']['Functions']['approve_role_request']['Args'] = {
    p_request_id: requestId,
    p_club_id: input.clubId,
    // Conditional spread, not ?? null: generated Args mark these optional, not nullable.
    ...(input.showId != null ? { p_show_id: input.showId } : {}),
    ...(input.reviewerNote != null ? { p_reviewer_note: input.reviewerNote } : {}),
  };

  const { error } = await supabase.rpc('approve_role_request', args);

  if (error) throw error;
}

export async function denyRoleRequest(requestId: string, reviewerNote: string): Promise<void> {
  const { error } = await supabase.rpc('deny_role_request', {
    p_request_id: requestId,
    p_reviewer_note: reviewerNote,
  });

  if (error) throw error;
}

// --- Club-routed secretary requests (MYK9-571) ---
//
// A request is an ask; it never grants anything. Appointment
// (grant_club_secretary, driven from the club admin's Show Access tab)
// remains the only thing that grants club-scoped secretary access. These
// functions only submit, list and review the ask.

export interface SubmitClubSecretaryRequestInput {
  clubId: string;
  note: string;
}

/**
 * Submits a request for club-scoped secretary access. Requires a non-empty
 * note (enforced by the dialog, not the RPC, which accepts an optional note).
 *
 * A NULL return means the server's own unique index silently absorbed a
 * duplicate pending request (ON CONFLICT DO NOTHING) — surfaced here as
 * RoleRequestAlreadyPendingError so the caller can show "Under review"
 * instead of a generic failure.
 */
export async function submitClubSecretaryRequest(
  input: SubmitClubSecretaryRequestInput
): Promise<string> {
  const { data, error } = await supabase.rpc('submit_role_request', {
    p_requested_role: 'secretary',
    p_requested_scope: 'club',
    p_club_id: input.clubId,
    p_requester_note: input.note,
  });

  if (error) {
    if (error.code === STANDING_DENIAL_ERROR_CODE) {
      throw new RoleRequestStandingDenialError(error.message);
    }
    throw error;
  }

  if (!data) {
    throw new RoleRequestAlreadyPendingError();
  }

  return data;
}

/**
 * Reads the caller's own most recent club-scoped secretary request for this
 * club, if any. Filtered explicitly to the current auth user (not just
 * relied on via role_requests_select's own-row arm), because "the caller's
 * OWN latest request" is a claim this query makes on purpose — without the
 * filter it would silently also match any other row role_requests_select
 * happens to let this caller see, such as a club admin's own read of the
 * requests they administer.
 */
export async function getMyClubSecretaryRequestStatus(
  clubId: string
): Promise<ClubSecretaryRequestStatus | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('role_requests')
    .select('status, reviewer_note')
    .eq('auth_user_id', user.id)
    .eq('club_id', clubId)
    .eq('requested_role', 'secretary')
    .eq('requested_scope', 'club')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    status: data.status as RoleRequestStatus,
    reviewerNote: (data.reviewer_note as string | null) ?? null,
  };
}

/**
 * Lists pending club-scoped secretary requests for a club. Relies on the
 * role_requests_select club-admin arm; a caller who is not a site admin or
 * that club's admin gets an empty result, not an error.
 */
export async function listClubRoleRequests(clubId: string): Promise<RoleRequest[]> {
  const { data, error } = await supabase
    .from('role_requests')
    .select(ROLE_REQUEST_SELECT)
    .eq('club_id', clubId)
    .eq('requested_scope', 'club')
    .eq('requested_role', 'secretary')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as DbRoleRequestRow[]).map(mapDbRoleRequest);
}

export async function approveClubRoleRequest(
  requestId: string,
  note?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('approve_club_role_request', {
    p_request_id: requestId,
    ...(note != null ? { p_note: note } : {}),
  });

  if (error) throw error;
}

export async function denyClubRoleRequest(requestId: string, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc('deny_club_role_request', {
    p_request_id: requestId,
    ...(note != null ? { p_note: note } : {}),
  });

  if (error) throw error;
}

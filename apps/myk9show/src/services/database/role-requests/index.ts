import { supabase } from '../supabaseClient';
import type { Database } from '@/types/supabase';
import {
  mapClubRoleRequestRpcRow,
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
  ClubRoleRequestRpcRow,
  ClubSecretaryRequestStatus,
  DbRoleRequestRow,
  RequestedRole,
  RequestedScope,
  RoleRequest,
  RoleRequestStatus,
} from './types';
export {
  mapClubRoleRequestRpcRow,
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
 * note — the dialog's own `disabled={!note.trim()}` keeps the button
 * unusable until one is typed, and submit_role_request (server-side)
 * independently raises 22023 for an empty club-scoped secretary note, so a
 * caller that bypasses the dialog (or a stale client) cannot submit one
 * either.
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
 * club, if any. `authUserId` comes from the caller (RequestShowAccessCard
 * already holds it via useAuthContext) rather than a fresh
 * supabase.auth.getUser() round-trip — the round-trip silently swallowed its
 * own error and returned null on no user, which reads identically to "no
 * prior request" and re-shows the Request button to someone the caller
 * actually has no identity for (MYK9-571 round 2, P2-1). A caller with no id
 * is a caller bug, not a "no request" answer, so this throws instead of
 * returning null.
 *
 * Filtered explicitly to authUserId (not just relied on via
 * role_requests_select's own-row arm), because "the caller's OWN latest
 * request" is a claim this query makes on purpose — without the filter it
 * would silently also match any other row role_requests_select happens to
 * let this caller see, such as a club admin's own read of the requests they
 * administer.
 */
export async function getMyClubSecretaryRequestStatus(
  clubId: string,
  authUserId: string
): Promise<ClubSecretaryRequestStatus | null> {
  if (!authUserId) {
    throw new Error('getMyClubSecretaryRequestStatus requires an authenticated user id');
  }

  const { data, error } = await supabase
    .from('role_requests')
    .select('status, reviewer_note')
    .eq('auth_user_id', authUserId)
    .eq('club_id', clubId)
    .eq('requested_role', 'secretary')
    .eq('requested_scope', 'club')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const status: ClubSecretaryRequestStatus = {
    status: data.status as RoleRequestStatus,
    reviewerNote: (data.reviewer_note as string | null) ?? null,
  };
  if (status.status !== 'approved') return status;
  const appointmentActive = await readClubSecretaryAppointmentActive(clubId, authUserId);
  return appointmentActive === null ? status : { ...status, appointmentActive };
}

/** The roles revoke_club_secretary deactivates, i.e. what "appointed" means. */
const CLUB_SECRETARY_ROLE_NAMES = new Set(['secretary', 'trial_secretary']);

/**
 * Whether the caller still holds a club-scoped secretary appointment at this
 * club: the same rows revoke_club_secretary turns off (MYK9-750). Null when the
 * read fails, so a transient error never re-offers a request.
 */
async function readClubSecretaryAppointmentActive(
  clubId: string,
  authUserId: string
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('expires_at, role:roles!user_roles_role_id_fkey(name)')
    .eq('auth_user_id', authUserId)
    .eq('club_id', clubId)
    .is('show_id', null)
    .eq('is_active', true);
  if (error || !data) return null;

  const now = Date.now();
  return (data as Array<{ expires_at: string | null; role: { name: string } | null }>).some(
    grant =>
      CLUB_SECRETARY_ROLE_NAMES.has(grant.role?.name ?? '') &&
      (grant.expires_at === null || Date.parse(grant.expires_at) > now)
  );
}

/**
 * Lists a club's pending club-scoped secretary requests via the
 * list_club_role_requests RPC (MYK9-571 round 2). Previously a direct
 * `.from('role_requests')` read relying on a role_requests_select
 * club-admin arm that leaked platform-wide on a NULL club_id (round 1's
 * P0) — that arm is gone, and this RPC restates the same club-admin-or-
 * site-admin check as one verdict before returning any row. A caller who
 * is not a site admin or that club's admin gets a 42501 error, not an
 * empty result.
 */
export async function listClubRoleRequests(clubId: string): Promise<RoleRequest[]> {
  const { data, error } = await supabase.rpc('list_club_role_requests', { p_club_id: clubId });

  if (error) throw error;
  // No cast: ClubRoleRequestRpcRow matches the generated Returns row shape
  // structurally (MYK9-571 round 3, P2-3), so `data` (already typed via the
  // Database-generic supabase client) assigns straight through.
  return (data ?? []).map(mapClubRoleRequestRpcRow);
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

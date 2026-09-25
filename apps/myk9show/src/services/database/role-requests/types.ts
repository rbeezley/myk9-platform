export type RoleRequestStatus = 'pending' | 'approved' | 'denied';

/**
 * The caller's own latest club-scoped secretary request for a club: status
 * plus the reviewer's note, so a denial can explain itself without exposing
 * anything beyond the requester's own row (RLS already scopes this to
 * `auth_user_id = auth.uid()`).
 */
export interface ClubSecretaryRequestStatus {
  status: RoleRequestStatus;
  reviewerNote: string | null;
  /**
   * Approved requests only: whether the appointment the approval produced is
   * still in force. False after a club admin revoked it, so the person may ask
   * again. Absent when it could not be read; nothing is claimed then (MYK9-750).
   */
  appointmentActive?: boolean;
}
export type RequestedRole = 'club_admin' | 'secretary';
export type RequestedScope = 'club' | 'show';

export interface DbRoleRequestRow {
  id: string;
  auth_user_id: string;
  person_id: string;
  requested_role: RequestedRole;
  requested_scope: RequestedScope;
  club_id: string | null;
  show_id: string | null;
  status: RoleRequestStatus;
  requester_note: string | null;
  reviewer_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  person?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  reviewer?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  club?: {
    name: string | null;
  } | null;
}

export interface RoleRequest {
  id: string;
  authUserId: string;
  personId: string;
  requestedRole: RequestedRole;
  requestedScope: RequestedScope;
  clubId: string | null;
  clubName: string | null;
  showId: string | null;
  status: RoleRequestStatus;
  requesterNote: string | null;
  reviewerNote: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requesterName: string;
  requesterEmail: string | null;
}

export interface ApproveRoleRequestInput {
  clubId: string;
  showId?: string | null;
  reviewerNote?: string | null;
}

/**
 * Flat row shape returned by the list_club_role_requests RPC (MYK9-571,
 * round 2): a club admin no longer reads role_requests directly (that arm
 * of role_requests_select leaked on a NULL club_id — see the migration
 * header), so this is what the RPC's RETURNS TABLE actually returns, not a
 * PostgREST embed like DbRoleRequestRow.
 */
/**
 * Matches list_club_role_requests' generated Returns row EXACTLY (string
 * fields, not the narrowed unions below) — MYK9-571 round 3 (P2-3): this
 * lets the caller assign the RPC's real generated type straight into this
 * interface with no `as unknown as` cast, structurally. Runtime narrowing
 * into RequestedRole/RequestedScope/RoleRequestStatus happens inside
 * mapClubRoleRequestRpcRow via the same assert* helpers mapDbRoleRequest
 * uses below.
 */
export interface ClubRoleRequestRpcRow {
  id: string;
  person_id: string;
  requested_role: string;
  requested_scope: string;
  club_id: string | null;
  club_name: string | null;
  show_id: string | null;
  status: string;
  requester_note: string | null;
  reviewer_note: string | null;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  requester_name: string;
  requester_email: string | null;
}

/**
 * Thrown by submitRoleRequest when the club-scoped submit RPC's own unique
 * index (role_requests_one_pending_scope_idx) swallowed a duplicate pending
 * request via ON CONFLICT DO NOTHING and returned a NULL id instead of an
 * error. A request is an ask, so "already asked" is not a failure — the UI
 * should read this as "show Under review", not an error toast.
 */
export class RoleRequestAlreadyPendingError extends Error {
  constructor() {
    super('A request for this role at this club is already under review.');
    this.name = 'RoleRequestAlreadyPendingError';
  }
}

/**
 * Thrown by submitRoleRequest when the server's standing-denial guard
 * (submit_role_request, ERRCODE 'MK571') refused a resubmission because the
 * most recent request for this exact role at this club was denied and the
 * caller still does not hold the role. Only a direct appointment by the club
 * clears this.
 */
export class RoleRequestStandingDenialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleRequestStandingDenialError';
  }
}

const REQUESTED_SCOPES: readonly RequestedScope[] = ['club', 'show'];
const REQUESTED_ROLES: readonly RequestedRole[] = ['club_admin', 'secretary'];
const ROLE_REQUEST_STATUSES: readonly RoleRequestStatus[] = ['pending', 'approved', 'denied'];

function assertRequestedScope(value: string, requestId: string): RequestedScope {
  if ((REQUESTED_SCOPES as readonly string[]).includes(value)) {
    return value as RequestedScope;
  }
  throw new Error(
    `mapDbRoleRequest: unknown requested_scope ${JSON.stringify(value)} on role_request ${requestId}. ` +
      `Expected one of ${REQUESTED_SCOPES.join(', ')}.`
  );
}

function assertRequestedRole(value: string, requestId: string): RequestedRole {
  if ((REQUESTED_ROLES as readonly string[]).includes(value)) {
    return value as RequestedRole;
  }
  throw new Error(
    `mapDbRoleRequest: unknown requested_role ${JSON.stringify(value)} on role_request ${requestId}. ` +
      `Expected one of ${REQUESTED_ROLES.join(', ')}.`
  );
}

function assertRoleRequestStatus(value: string, requestId: string): RoleRequestStatus {
  if ((ROLE_REQUEST_STATUSES as readonly string[]).includes(value)) {
    return value as RoleRequestStatus;
  }
  throw new Error(
    `mapDbRoleRequest: unknown status ${JSON.stringify(value)} on role_request ${requestId}. ` +
      `Expected one of ${ROLE_REQUEST_STATUSES.join(', ')}.`
  );
}

export function mapClubRoleRequestRpcRow(row: ClubRoleRequestRpcRow): RoleRequest {
  return {
    id: row.id,
    // MYK9-571 round 3 (P3): the RPC does not return auth_user_id — no
    // club-admin consumer reads RoleRequest.authUserId (it exists for the
    // site-admin listing's mapDbRoleRequest, which still populates it for
    // real). Left as an empty string rather than making the field optional
    // on the shared RoleRequest shape.
    authUserId: '',
    personId: row.person_id,
    requestedRole: assertRequestedRole(row.requested_role, row.id),
    requestedScope: assertRequestedScope(row.requested_scope, row.id),
    clubId: row.club_id,
    clubName: row.club_name,
    showId: row.show_id,
    status: assertRoleRequestStatus(row.status, row.id),
    requesterNote: row.requester_note,
    reviewerNote: row.reviewer_note,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name,
    reviewerEmail: row.reviewer_email,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
  };
}

export function mapDbRoleRequest(row: DbRoleRequestRow): RoleRequest {
  const firstName = row.person?.first_name?.trim() ?? '';
  const lastName = row.person?.last_name?.trim() ?? '';
  const requesterName = `${firstName} ${lastName}`.trim() || 'Unknown user';
  const reviewerFirstName = row.reviewer?.first_name?.trim() ?? '';
  const reviewerLastName = row.reviewer?.last_name?.trim() ?? '';
  const reviewerName = `${reviewerFirstName} ${reviewerLastName}`.trim() || null;

  return {
    id: row.id,
    authUserId: row.auth_user_id,
    personId: row.person_id,
    requestedRole: assertRequestedRole(row.requested_role, row.id),
    requestedScope: assertRequestedScope(row.requested_scope, row.id),
    clubId: row.club_id,
    clubName: row.club?.name ?? null,
    showId: row.show_id,
    status: assertRoleRequestStatus(row.status, row.id),
    requesterNote: row.requester_note,
    reviewerNote: row.reviewer_note,
    reviewedBy: row.reviewed_by,
    reviewerName,
    reviewerEmail: row.reviewer?.email ?? null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requesterName,
    requesterEmail: row.person?.email ?? null,
  };
}

export type RoleRequestStatus = 'pending' | 'approved' | 'denied';
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

export function mapDbRoleRequest(row: DbRoleRequestRow): RoleRequest {
  const firstName = row.person?.first_name?.trim() ?? '';
  const lastName = row.person?.last_name?.trim() ?? '';
  const requesterName = `${firstName} ${lastName}`.trim() || 'Unknown user';

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
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requesterName,
    requesterEmail: row.person?.email ?? null,
  };
}

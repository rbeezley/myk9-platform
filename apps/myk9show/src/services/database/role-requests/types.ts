export type RoleRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';
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

export function mapDbRoleRequest(row: DbRoleRequestRow): RoleRequest {
  const firstName = row.person?.first_name?.trim() ?? '';
  const lastName = row.person?.last_name?.trim() ?? '';
  const requesterName = `${firstName} ${lastName}`.trim() || 'Unknown user';

  return {
    id: row.id,
    authUserId: row.auth_user_id,
    personId: row.person_id,
    requestedRole: row.requested_role,
    requestedScope: row.requested_scope,
    clubId: row.club_id,
    clubName: row.club?.name ?? null,
    showId: row.show_id,
    status: row.status,
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

import type { UserRole as UserRoleType } from '@/types/user-types';
import { SelectedUser } from '@/pages/admin/UserManagementPage';

export interface BulkActionsBarProps {
  selectedUsers: SelectedUser[];
  onClearSelection: () => void;
  onBulkComplete: () => void;
  onUsersDeleted?: (deletedUserIds: string[]) => void;
}

// 'status' dialog removed: no single-user account-status mutation exists to mirror
// (see docs — Manage Roles is the only real per-user admin action beyond delete).
export type DialogType = 'role' | 'delete' | 'cascadeConfirm' | null;

export interface BulkRoleData {
  action: 'add' | 'remove' | 'replace';
  roles: UserRoleType[];
}

export interface RelatedDataDetails {
  entryCount: number;
  dogCount: number;
  canCascade: boolean;
}

export interface ErrorWithRelatedData extends Error {
  code?: string;
  details?: RelatedDataDetails;
}

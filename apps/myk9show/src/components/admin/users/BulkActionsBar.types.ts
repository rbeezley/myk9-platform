import type { UserRole as UserRoleType } from '@/types/user-types';
import { SelectedUser } from '@/pages/admin/UserManagementPage';

export interface BulkActionsBarProps {
  selectedUsers: SelectedUser[];
  onClearSelection: () => void;
  onBulkComplete: () => void;
  onUsersDeleted?: (deletedUserIds: string[]) => void;
}

export type DialogType = 'role' | 'status' | 'delete' | 'cascadeConfirm' | null;

export interface BulkRoleData {
  action: 'add' | 'remove' | 'replace';
  roles: UserRoleType[];
}

export interface BulkStatusData {
  action: 'activate' | 'deactivate' | 'suspend';
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

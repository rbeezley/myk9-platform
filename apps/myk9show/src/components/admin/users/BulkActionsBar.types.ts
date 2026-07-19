import { SelectedUser } from '@/pages/admin/UserManagementPage';

export interface BulkActionsBarProps {
  selectedUsers: SelectedUser[];
  onClearSelection: () => void;
  /** Removes only the users confirmed deleted; blocked users remain selected. */
  onBulkComplete: (deletedUserIds?: string[]) => void;
  onUsersDeleted?: (deletedUserIds: string[]) => void;
}

// 'status' dialog removed: no correct per-user account-status mutation exists to
// mirror in bulk. 'role' was removed in MYK9-47 (broken canonical values, ignored
// ensureUserHasRole result, no club scope) and rebuilt correctly in MYK9-58 —
// see BulkRoleDialog.tsx and useBulkActions.handleBulkRoleChange.
export type DialogType = 'delete' | 'cascadeConfirm' | 'role' | null;

export interface RelatedDataDetails {
  entryCount: number;
  dogCount: number;
  canCascade: boolean;
}

export interface ErrorWithRelatedData extends Error {
  code?: string;
  details?: RelatedDataDetails;
}

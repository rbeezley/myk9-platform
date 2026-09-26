import { SelectedUser } from '@/pages/admin/UserManagementPage';

export interface BulkActionsBarProps {
  selectedUsers: SelectedUser[];
  onClearSelection: () => void;
  /** Removes only the users confirmed deleted; blocked users remain selected. */
  onBulkComplete: (deletedUserIds?: string[]) => void;
  onUsersDeleted?: (deletedUserIds: string[]) => void;
}

// Suspend / Reinstate are not dialogs here: they live in BulkAccountActions and
// use the status-only update the row menu uses (MYK9-712's `updatePersonStatus`,
// guarded by `people_protect_status`), which did not exist when a bulk status
// dialog was first removed. 'role' was removed in MYK9-47 (broken canonical values, ignored
// ensureUserHasRole result, no club scope) and rebuilt correctly in MYK9-58 —
// see BulkRoleEditPanel.tsx, bulkRolePlanner.ts and useBulkActions.handleBulkRoleEdit.
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

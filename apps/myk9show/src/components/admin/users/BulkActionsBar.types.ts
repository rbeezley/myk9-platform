import { SelectedUser } from '@/pages/admin/UserManagementPage';

export interface BulkActionsBarProps {
  selectedUsers: SelectedUser[];
  onClearSelection: () => void;
  /** Removes only the users confirmed deleted; blocked users remain selected. */
  onBulkComplete: (deletedUserIds?: string[]) => void;
  onUsersDeleted?: (deletedUserIds: string[]) => void;
}

// 'status' and 'role' dialogs removed: no correct single-user mutation exists to
// mirror in bulk (account-status has no per-user mutation; role assignment needs a
// club-scope selector + canonical value mapping = a distinct feature). Bulk delete
// is the only real bulk action.
export type DialogType = 'delete' | 'cascadeConfirm' | null;

export interface RelatedDataDetails {
  entryCount: number;
  dogCount: number;
  canCascade: boolean;
}

export interface ErrorWithRelatedData extends Error {
  code?: string;
  details?: RelatedDataDetails;
}

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
// dialog was first removed. Bulk role editing is deferred (docs/plan-list-toolkit.md);
// roles change one person at a time from Manage roles.
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

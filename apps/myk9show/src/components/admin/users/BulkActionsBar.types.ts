import { SelectedUser } from '@/pages/admin/UserManagementPage';

export interface BulkActionsBarProps {
  selectedUsers: SelectedUser[];
  onClearSelection: () => void;
  /** Removes only the users confirmed deleted; blocked users remain selected. */
  onBulkComplete: (deletedUserIds?: string[]) => void;
  onUsersDeleted?: (deletedUserIds: string[]) => void;
}

// Bulk account actions (Suspend, Reinstate, Send invitation, Restore) and bulk
// role editing are both deferred (docs/plan-list-toolkit.md, MYK9-835 and
// MYK9-820); roles and status change one person at a time, via the row menu's
// existing paths.
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

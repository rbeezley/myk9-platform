import { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';

export interface BulkActionsBarProps {
  selectedUsers: SelectedUser[];
  /** The live roster (current page's full fetch) — the source bulk account
   * actions and role editing resolve targets and eligibility from, at dispatch
   * time and on every retry (MYK9-835, MYK9-820), never from `selectedUsers`. */
  users: AdminUser[];
  onClearSelection: () => void;
  /** Removes only the users confirmed deleted; blocked users remain selected. */
  onBulkComplete: (deletedUserIds?: string[]) => void;
  onUsersDeleted?: (deletedUserIds: string[]) => void;
}

// Suspend / Reinstate are not dialogs here: they live in BulkAccountActions and
// use the status-only update the row menu uses. 'role' opens BulkRoleEditPanel.
export type DialogType = 'delete' | 'role' | null;

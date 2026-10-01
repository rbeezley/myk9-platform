/**
 * BulkActionsBar Component - Toolbar for bulk user operations
 *
 * Features:
 * - Floats at the bottom of the viewport (list toolkit's FloatingBulkBar), so it
 *   is in view wherever the rows were ticked
 * - Change roles (BulkRoleEditPanel), account actions (BulkAccountActions:
 *   suspend, reinstate, invite, restore), a More menu (Copy emails, read-only;
 *   Export CSV) and bulk delete through the shared DeleteObjectDialog (soft,
 *   with Undo; a person who owns dogs is named and blocked up front).
 */

import React, { useMemo } from 'react';
import { Trash2, ChevronUp, Copy, Download, Shield } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';
import { DeleteObjectDialog, personDeleteDetail } from '@/features/delete';
import { getUserFullName } from './UserTable/utils';
import { selectedEmails } from './bulkAccountTargets';
import { exportUsersCSV } from '@/pages/admin/UserManagementPage.helpers';
import { BulkAccountActions } from './BulkAccountActions';
import { BulkRoleEditPanel } from './BulkRoleEditPanel';
import type { BulkActionsBarProps } from './BulkActionsBar.types';
import { useBulkActions } from './useBulkActions';

const USER_NOUN = ['user', 'users'] as const;
const ICON = 'h-4 w-4';

async function copyEmails(selectedUsers: BulkActionsBarProps['selectedUsers']) {
  const emails = selectedEmails(selectedUsers);
  const missing = selectedUsers.length - emails.length;
  if (emails.length === 0) {
    toast.error('None of the selected people has an email address.');
    return;
  }
  try {
    await navigator.clipboard.writeText(emails.join(', '));
    toast.success(
      `Copied ${emails.length} email ${emails.length === 1 ? 'address' : 'addresses'}`,
      missing > 0 ? { description: `${missing} selected without an email.` } : undefined
    );
  } catch {
    toast.error('Could not copy to the clipboard. Try Export instead.');
  }
}

export const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedUsers,
  users,
  onClearSelection,
  onBulkComplete,
  onUsersDeleted,
}) => {
  const {
    currentDialog,
    setCurrentDialog,
    closeDialog,
    handleBulkRoleEdit,
    isRoleProcessing,
    roleError,
  } = useBulkActions({ selectedUsers, onBulkComplete, onClearSelection });

  // The live roster, keyed by id — the single source bulk account actions and
  // role editing resolve targets and eligibility from at dispatch time and on
  // every retry (MYK9-835, MYK9-820), never from the selection snapshot.
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const selectedIds = useMemo(() => selectedUsers.map(u => u.id), [selectedUsers]);

  if (selectedUsers.length === 0) {
    return null;
  }

  return (
    <>
      <FloatingBulkBar
        count={selectedUsers.length}
        noun={USER_NOUN}
        onClear={onClearSelection}
        busy={isRoleProcessing}
      >
        <p className="sr-only">
          Selected users:{' '}
          {selectedUsers
            .slice(0, 3)
            .map(u => getUserFullName(u.user))
            .join(', ')}
          {selectedUsers.length > 3 && ` and ${selectedUsers.length - 3} more`}
        </p>
        <BulkBarButton
          onClick={() => setCurrentDialog('role')}
          icon={<Shield className="h-4 w-4" aria-hidden="true" />}
        >
          Change roles
        </BulkBarButton>
        <BulkAccountActions
          selectedIds={selectedIds}
          usersById={usersById}
          onClearSelection={onClearSelection}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              More
              <ChevronUp className={ICON} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem className="min-h-11" onClick={() => void copyEmails(selectedUsers)}>
              <Copy className={`${ICON} mr-2`} aria-hidden="true" />
              Copy emails
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => exportUsersCSV(selectedUsers.map(item => item.user))}
            >
              <Download className={`${ICON} mr-2`} aria-hidden="true" />
              Export CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <BulkBarButton
          tone="destructive"
          onClick={() => setCurrentDialog('delete')}
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
        >
          Delete
        </BulkBarButton>
      </FloatingBulkBar>

      {currentDialog === 'delete' && (
        <DeleteObjectDialog
          open
          onOpenChange={open => {
            if (!open) closeDialog();
          }}
          kind="person"
          targets={selectedUsers.map(item => ({
            id: item.id,
            name: getUserFullName(item.user),
            detail: personDeleteDetail({ email: item.user.email, town: item.user.city }),
          }))}
          onDeleted={({ deleted, alreadyGone }) => {
            const ids = [...deleted, ...alreadyGone].map(target => target.id);
            onBulkComplete(ids);
            onUsersDeleted?.(ids);
          }}
        />
      )}

      {/* Change Roles Dialog */}
      <BulkRoleEditPanel
        open={currentDialog === 'role'}
        onClose={closeDialog}
        selectedIds={selectedIds}
        usersById={usersById}
        isProcessing={isRoleProcessing}
        error={roleError}
        onSubmit={handleBulkRoleEdit}
      />
    </>
  );
};

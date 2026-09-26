/**
 * BulkActionsBar Component - Toolbar for bulk user operations
 *
 * Features:
 * - Floats at the bottom of the viewport (list toolkit's FloatingBulkBar), so it
 *   is in view wherever the rows were ticked
 * - Change roles (BulkRoleEditPanel), account actions (BulkAccountActions:
 *   suspend, reinstate, invite, restore), a More menu (Copy emails, read-only;
 *   Export CSV) and bulk delete with confirmation (soft/permanent for admins,
 *   cascade for related data).
 */

import React, { useMemo } from 'react';
import { Trash2, AlertCircle, ChevronUp, Copy, Download, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';
import { AdminDeleteUserDialog } from './AdminDeleteUserDialog';
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
    isProcessing,
    error,
    cascadeData,
    closeDialog,
    handleBulkDelete,
    handleCascadeDelete,
    handleBulkPermanentDelete,
    handleBulkRoleEdit,
    isRoleProcessing,
    roleError,
  } = useBulkActions({ selectedUsers, onBulkComplete, onUsersDeleted, onClearSelection });

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
      <FloatingBulkBar count={selectedUsers.length} noun={USER_NOUN} onClear={onClearSelection}>
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

      {/* Delete dialog — offers the reversible removal and the permanent one,
          and describes each accurately. (A second, non-admin dialog used to sit
          behind an `isAdmin` branch here; /admin/users is SITE_ADMIN-guarded so
          it was unreachable, and its copy called the reversible delete
          permanent.) */}
      <AdminDeleteUserDialog
        open={currentDialog === 'delete'}
        onOpenChange={() => closeDialog()}
        onSoftDelete={handleBulkDelete}
        onPermanentDelete={handleBulkPermanentDelete}
        entityName={
          selectedUsers
            .slice(0, 3)
            .map(u => getUserFullName(u.user))
            .join(', ') + (selectedUsers.length > 3 ? ` and ${selectedUsers.length - 3} more` : '')
        }
        isDeleting={isProcessing}
        bulkCount={selectedUsers.length}
        errorMessage={error}
      />

      {/* Cascade Delete Confirmation Dialog */}
      <Dialog open={currentDialog === 'cascadeConfirm'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Users with Related Data</DialogTitle>
            <DialogDescription>
              Some users have related data that would prevent deletion. You can choose to delete
              everything or cancel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-semibold">This will also delete:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {cascadeData?.entryCount ? (
                      <li>
                        {cascadeData.entryCount} show entr
                        {cascadeData.entryCount === 1 ? 'y' : 'ies'}
                      </li>
                    ) : null}
                    {cascadeData?.dogCount ? (
                      <li>
                        {cascadeData.dogCount} dog{cascadeData.dogCount === 1 ? '' : 's'} and all
                        their related data
                      </li>
                    ) : null}
                  </ul>
                  <div className="mt-2 font-semibold text-destructive">
                    This action cannot be undone!
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {cascadeData && cascadeData.ownsDogsBlocked.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {cascadeData.ownsDogsBlocked.length} user
                      {cascadeData.ownsDogsBlocked.length === 1 ? '' : 's'} cannot be deleted (owns
                      registered dogs) and will remain even after this cascade:
                    </div>
                    <ul className="list-disc list-inside">
                      {cascadeData.ownsDogsBlocked.map(b => (
                        <li key={b.userId}>{b.label}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {cascadeData && (
              <div className="space-y-2">
                <Label>Users with related data:</Label>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {cascadeData.userIds.map(userId => {
                    const user = selectedUsers.find(u => u.id === userId);
                    return user ? (
                      <div key={userId} className="text-sm p-2 bg-muted rounded">
                        {getUserFullName(user.user)}
                        {user.user.email ? ` (${user.user.email})` : ''}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel - Keep Data
            </Button>
            <Button variant="destructive" onClick={handleCascadeDelete} disabled={isProcessing}>
              <Trash2 className="h-4 w-4 mr-2" />
              {isProcessing ? 'Deleting Everything...' : 'Delete Users & Related Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

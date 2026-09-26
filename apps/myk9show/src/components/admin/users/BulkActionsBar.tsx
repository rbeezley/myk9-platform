/**
 * BulkActionsBar Component - Toolbar for bulk user operations
 *
 * Features:
 * - Floats at the bottom of the viewport (list toolkit's FloatingBulkBar), so it
 *   is in view wherever the rows were ticked
 * - Change roles, export the selection, bulk delete with confirmation
 *   (soft/permanent for admins, cascade for related data)
 */

import React from 'react';
import { Trash2, AlertCircle, Shield, Download } from 'lucide-react';
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

import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';
import { exportUsersCSV } from '@/pages/admin/UserManagementPage.helpers';
import { AdminDeleteUserDialog } from './AdminDeleteUserDialog';
import { getUserFullName } from './UserTable/utils';
import { BulkRoleDialog } from './BulkRoleDialog';
import type { BulkActionsBarProps } from './BulkActionsBar.types';
import { useBulkActions } from './useBulkActions';

const USER_NOUN = ['user', 'users'] as const;

export const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedUsers,
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
    handleBulkRoleChange,
    isRoleProcessing,
    roleError,
    roleNotice,
  } = useBulkActions({ selectedUsers, onBulkComplete, onUsersDeleted, onClearSelection });

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
        <BulkBarButton
          onClick={() => exportUsersCSV(selectedUsers.map(item => item.user))}
          icon={<Download className="h-4 w-4" aria-hidden="true" />}
        >
          Export
        </BulkBarButton>
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
      <BulkRoleDialog
        open={currentDialog === 'role'}
        onOpenChange={() => closeDialog()}
        selectedUsers={selectedUsers}
        isProcessing={isRoleProcessing}
        error={roleError}
        notice={roleNotice}
        onSubmit={handleBulkRoleChange}
      />
    </>
  );
};

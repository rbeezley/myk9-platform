/**
 * BulkActionsBar Component - Toolbar for bulk user operations
 *
 * Features:
 * - Bulk delete with confirmation (soft/permanent for admins, cascade for related data)
 * - Selection management
 */

import React from 'react';
import { Users, Trash2, AlertCircle, X, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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

import { AdminDeleteUserDialog } from './AdminDeleteUserDialog';
import { getUserFullName } from './UserTable/utils';
import { BulkRoleDialog } from './BulkRoleDialog';
import type { BulkActionsBarProps } from './BulkActionsBar.types';
import { useBulkActions } from './useBulkActions';

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
      {/* Bulk Actions Bar */}
      <Card
        className="border-primary/30 bg-primary/5 rounded-xl"
        role="region"
        aria-label="Bulk actions"
      >
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <Badge
                  variant="default"
                  className="gap-2 px-4 py-2 rounded-full bg-primary/20 text-primary border-0 text-sm"
                >
                  <Users className="h-4 w-4" />
                  {selectedUsers.length} selected
                </Badge>
                <Button
                  variant="ghost"
                  onClick={onClearSelection}
                  aria-label="Clear selection"
                  className="h-11 w-11 p-0 rounded-xl hover:bg-primary/20"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-sm text-muted-foreground truncate max-w-full sm:max-w-md">
                <span className="sr-only">Selected users: </span>
                {selectedUsers
                  .slice(0, 3)
                  .map(u => getUserFullName(u.user))
                  .join(', ')}
                {selectedUsers.length > 3 && ` and ${selectedUsers.length - 3} more`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Change roles */}
              <Button
                variant="outline"
                onClick={() => setCurrentDialog('role')}
                className="h-11 px-4 rounded-xl"
              >
                <Shield className="h-4 w-4 mr-2" />
                Change roles
              </Button>

              {/* Delete */}
              <Button
                variant="outline"
                onClick={() => setCurrentDialog('delete')}
                className="h-11 px-4 rounded-xl border-destructive/30 bg-destructive/10 text-destructive
                           hover:bg-destructive/20 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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

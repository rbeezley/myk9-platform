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

import { useAuthContext } from '@/hooks/useAuthContext';
import { AdminDeleteUserDialog } from './AdminDeleteUserDialog';
import { BulkRoleDialog } from './BulkRoleDialog';
import type { BulkActionsBarProps } from './BulkActionsBar.types';
import { useBulkActions } from './useBulkActions';

export const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedUsers,
  onClearSelection,
  onBulkComplete,
  onUsersDeleted,
}) => {
  const { isAdmin } = useAuthContext();
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
  } = useBulkActions({ selectedUsers, onBulkComplete, onUsersDeleted, onClearSelection });

  if (selectedUsers.length === 0) {
    return null;
  }

  return (
    <>
      {/* Bulk Actions Bar */}
      <Card
        className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 backdrop-blur-xl
                       rounded-2xl shadow-sm"
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Badge
                  variant="default"
                  className="gap-2 px-4 py-2 rounded-full bg-primary/20 text-primary
                                                  border-0 font-[590] text-sm"
                >
                  <Users className="h-4 w-4" />
                  {selectedUsers.length} selected
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearSelection}
                  className="h-8 w-8 p-0 rounded-xl hover:bg-primary/20 transition-colors duration-200"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-sm text-muted-foreground font-[500]">
                Selected users:{' '}
                {selectedUsers
                  .slice(0, 3)
                  .map(u => `${u.user.firstName} ${u.user.lastName}`)
                  .join(', ')}
                {selectedUsers.length > 3 && ` and ${selectedUsers.length - 3} more`}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Change roles */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDialog('role')}
                className="h-10 px-4 rounded-xl font-[590]"
              >
                <Shield className="h-4 w-4 mr-2" />
                Change roles
              </Button>

              {/* Delete */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDialog('delete')}
                className="h-10 px-4 rounded-xl border-destructive/30 bg-destructive/10 text-destructive font-[590]
                           hover:bg-destructive/20 hover:text-destructive transition-all duration-300"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog -- Admin sees soft/permanent options, others see standard confirmation */}
      {isAdmin ? (
        <AdminDeleteUserDialog
          open={currentDialog === 'delete'}
          onOpenChange={() => closeDialog()}
          onSoftDelete={handleBulkDelete}
          onPermanentDelete={handleBulkPermanentDelete}
          entityName={
            selectedUsers
              .slice(0, 3)
              .map(u => `${u.user.firstName} ${u.user.lastName}`)
              .join(', ') +
            (selectedUsers.length > 3 ? ` and ${selectedUsers.length - 3} more` : '')
          }
          isDeleting={isProcessing}
          bulkCount={selectedUsers.length}
        />
      ) : (
        <Dialog open={currentDialog === 'delete'} onOpenChange={() => closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Users</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedUsers.length} selected user
                {selectedUsers.length !== 1 ? 's' : ''}? This action cannot be undone.
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
                  This will permanently delete all user data including profiles, registrations, and
                  history.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Users to be deleted:</Label>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {selectedUsers.map(item => (
                    <div key={item.id} className="text-sm p-2 bg-muted rounded">
                      {item.user.firstName} {item.user.lastName} ({item.user.email})
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={isProcessing}>
                <Trash2 className="h-4 w-4 mr-2" />
                {isProcessing ? 'Deleting...' : 'Delete Users'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
                        {user.user.firstName} {user.user.lastName} ({user.user.email})
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
        onSubmit={handleBulkRoleChange}
      />
    </>
  );
};

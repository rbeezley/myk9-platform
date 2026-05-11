/**
 * BulkActionsBar Component - Toolbar for bulk user operations
 *
 * Features:
 * - Bulk role assignment/removal
 * - Bulk status changes (activate/deactivate/suspend)
 * - Bulk delete with confirmation
 * - Selection management
 */

import React from 'react';
import {
  Users,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  UserMinus,
  AlertCircle,
  X,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useAuthContext } from '@/hooks/useAuthContext';
import { AdminDeleteUserDialog } from './AdminDeleteUserDialog';
import type { BulkActionsBarProps } from './BulkActionsBar.types';
import { ROLE_OPTIONS } from './BulkActionsBar.constants';
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
    roleData,
    setRoleData,
    statusData,
    setStatusData,
    closeDialog,
    handleBulkRoleAction,
    handleBulkStatusAction,
    handleBulkDelete,
    handleCascadeDelete,
    handleBulkPermanentDelete,
    handleRoleSelection,
  } = useBulkActions({ selectedUsers, onBulkComplete, onUsersDeleted });

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
              {/* Role Management */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild nativeButton>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-4 rounded-xl border-border/50 bg-background/50 font-[590]
                               hover:bg-muted/50 transition-all duration-300"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Roles
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="rounded-xl border-border/30 bg-card/95 backdrop-blur-xl shadow-xl">
                  <DropdownMenuItem
                    onClick={() => setCurrentDialog('role')}
                    className="rounded-lg font-[500] text-sm py-3 focus:bg-primary/10 focus:text-primary"
                  >
                    <Shield className="h-4 w-4 mr-3" />
                    Manage Roles
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Status Management */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild nativeButton>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-4 rounded-xl border-border/50 bg-background/50 font-[590]
                               hover:bg-muted/50 transition-all duration-300"
                  >
                    <UserCheck className="h-4 w-4 mr-2" />
                    Status
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="rounded-xl border-border/30 bg-card/95 backdrop-blur-xl shadow-xl">
                  <DropdownMenuItem
                    onClick={() => {
                      setStatusData({ action: 'activate' });
                      setCurrentDialog('status');
                    }}
                    className="rounded-lg font-[500] text-sm py-3 focus:bg-green-50 focus:text-green-700 dark:focus:bg-green-950/20"
                  >
                    <UserCheck className="h-4 w-4 mr-3" />
                    Activate Users
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setStatusData({ action: 'deactivate' });
                      setCurrentDialog('status');
                    }}
                    className="rounded-lg font-[500] text-sm py-3 focus:bg-orange-50 focus:text-orange-700 dark:focus:bg-orange-950/20"
                  >
                    <UserX className="h-4 w-4 mr-3" />
                    Deactivate Users
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setStatusData({ action: 'suspend' });
                      setCurrentDialog('status');
                    }}
                    className="rounded-lg font-[500] text-sm py-3 focus:bg-red-50 focus:text-red-700 dark:focus:bg-red-950/20"
                  >
                    <UserMinus className="h-4 w-4 mr-3" />
                    Suspend Users
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Delete */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDialog('delete')}
                className="h-10 px-4 rounded-xl border-red-200/50 bg-red-50/50 text-red-600 font-[590]
                           hover:bg-red-100/50 hover:text-red-700 transition-all duration-300
                           dark:border-red-900/50 dark:bg-red-950/20 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role Management Dialog */}
      <Dialog open={currentDialog === 'role'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Role Management</DialogTitle>
            <DialogDescription>
              Manage roles for {selectedUsers.length} selected user
              {selectedUsers.length !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Label>Action</Label>
              <Select
                value={roleData.action}
                onValueChange={value =>
                  setRoleData(prev => ({ ...prev, action: value as 'add' | 'remove' | 'replace' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add roles to users</SelectItem>
                  <SelectItem value="remove">Remove roles from users</SelectItem>
                  <SelectItem value="replace">Replace all user roles</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Roles</Label>
              <div className="space-y-2 mt-2">
                {ROLE_OPTIONS.map(role => (
                  <div key={role.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={role.value}
                      checked={roleData.roles.includes(role.value)}
                      onCheckedChange={checked => handleRoleSelection(role.value, !!checked)}
                    />
                    <Label htmlFor={role.value}>{role.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleBulkRoleAction} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Apply Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={currentDialog === 'status'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusData.action === 'activate'
                ? 'Activate Users'
                : statusData.action === 'deactivate'
                  ? 'Deactivate Users'
                  : 'Suspend Users'}
            </DialogTitle>
            <DialogDescription>
              This will {statusData.action} {selectedUsers.length} selected user
              {selectedUsers.length !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {statusData.action === 'activate'
                  ? 'Users will be able to log in and access the system.'
                  : statusData.action === 'deactivate'
                    ? 'Users will not be able to log in until reactivated.'
                    : 'Users will be temporarily suspended and cannot access the system.'}
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkStatusAction}
              disabled={isProcessing}
              variant={statusData.action === 'activate' ? 'default' : 'destructive'}
            >
              {isProcessing
                ? 'Processing...'
                : statusData.action === 'activate'
                  ? 'Activate Users'
                  : statusData.action === 'deactivate'
                    ? 'Deactivate Users'
                    : 'Suspend Users'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  );
};

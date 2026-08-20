/**
 * Role Actions card for the Role Edit page.
 *
 * Clone and delete are self-contained here: the delete confirmation dialog,
 * its handler, and the "hide Delete for system roles" guard all live in one
 * place. Extracted from RoleEditPage.tsx to keep that file under the
 * project's 500-line ceiling — see CLAUDE.md § Development Principles.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { rbacService } from '@/services/rbac/RBACService';
import { notifications } from '@/lib/notifications';
import type { Role } from '@/types/rbac-types';

export interface RoleActionsCardProps {
  role: Role;
  roleId: string;
  /** Called after the role is successfully deleted. */
  onDeleted: () => void;
}

export const RoleActionsCard: React.FC<RoleActionsCardProps> = ({ role, roleId, onDeleted }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteRole = async () => {
    try {
      setIsDeleting(true);
      await rbacService.deleteRole(roleId);
      onDeleted();
    } catch (err) {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      notifications.error(
        `Failed to delete role: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Role Actions
          </CardTitle>
          <CardDescription>
            Clone this role as a starting point for a new one, or remove it entirely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="lg" asChild>
              <Link to={`/admin/permissions/roles/${roleId}/clone`}>
                <Copy className="h-4 w-4 mr-2" />
                Clone Role
              </Link>
            </Button>
            {!role.is_system && (
              <Button
                variant="destructive"
                size="lg"
                className="ml-auto"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Role
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={open => !open && setShowDeleteDialog(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the role &quot;{role.display_name || role.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

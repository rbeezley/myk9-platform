/**
 * Confirmation dialogs for restore and permanent delete actions.
 */

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
import type { ConfirmationDialogsProps } from './types';

export function ConfirmationDialogs({
  showRestoreDialog,
  onRestoreDialogChange,
  showDeleteDialog,
  onDeleteDialogChange,
  selectedEntity,
  isLoadingDeleted,
  onConfirmRestore,
  onConfirmDelete,
}: ConfirmationDialogsProps) {
  return (
    <>
      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={onRestoreDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {selectedEntity?.type === 'club' ? 'Club' : 'Dog'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore &quot;{selectedEntity?.name}&quot;? This will make it visible and active again in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmRestore}
              disabled={isLoadingDeleted}
              className="bg-green-500 hover:bg-green-600"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={onDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete {selectedEntity?.type === 'club' ? 'Club' : 'Dog'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete &quot;{selectedEntity?.name}&quot;? This action cannot be undone and will remove all data associated with this {selectedEntity?.type} from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDelete}
              disabled={isLoadingDeleted}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
